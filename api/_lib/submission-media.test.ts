import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handleSubmissionMediaRequest,
  isScopedProofPath,
  PROOF_SIGNED_URL_EXPIRY_SECONDS,
  type SubmissionMediaStore,
} from "./submission-media.js";

const submissionId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const beforePath = `organizations/${organizationId}/tasks/${taskId}/submissions/${sessionId}/before-safe.jpg`;
const afterPath = `organizations/${organizationId}/tasks/${taskId}/submissions/${sessionId}/after-safe.png`;

function createStore(overrides: Partial<SubmissionMediaStore> = {}) {
  const signed: Array<{ path: string; expires: number }> = [];
  const store: SubmissionMediaStore = {
    authenticate: async () => ({ id: "user-1" }),
    getProfile: async () => ({ activeOrganizationId: organizationId }),
    getMembership: async () => ({ role: "operator", isActive: true }),
    getSubmission: async () => ({
      id: submissionId,
      organizationId,
      taskId,
      beforePhotoPath: beforePath,
      afterPhotoPath: afterPath,
    }),
    createSignedUrl: async (path, expires) => {
      signed.push({ path, expires });
      return `https://signed.example/${encodeURIComponent(path)}`;
    },
    ...overrides,
  };
  return { store, signed };
}

function request(authorization = "Bearer valid-token") {
  return {
    method: "GET",
    url: `/api/review/submission-media?submissionId=${submissionId}`,
    headers: { authorization },
  };
}

describe("authenticated submission proof media", () => {
  it("rejects missing authentication and unsupported methods", async () => {
    const harness = createStore();
    const unauthorized = await handleSubmissionMediaRequest(request(""), harness.store);
    assert.equal(unauthorized.status, 401);

    const method = await handleSubmissionMediaRequest(
      { ...request(), method: "POST" }, harness.store,
    );
    assert.equal(method.status, 405);
    assert.equal(method.headers.Allow, "GET");
  });

  it("requires an active admin or operator membership", async () => {
    for (const membership of [null, { role: "operator" as const, isActive: false }]) {
      const harness = createStore({ getMembership: async () => membership });
      const response = await handleSubmissionMediaRequest(request(), harness.store);
      assert.equal(response.status, 403);
    }
  });

  it("rejects a cross-organization submission without signing either path", async () => {
    const harness = createStore({
      getSubmission: async () => ({
        id: submissionId,
        organizationId: "55555555-5555-4555-8555-555555555555",
        taskId,
        beforePhotoPath: beforePath,
        afterPhotoPath: afterPath,
      }),
    });
    const response = await handleSubmissionMediaRequest(request(), harness.store);
    assert.equal(response.status, 404);
    assert.equal(harness.signed.length, 0);
  });

  it("returns only short-lived signed URLs and disables response caching", async () => {
    const harness = createStore();
    const response = await handleSubmissionMediaRequest(request(), harness.store);
    const body = JSON.parse(response.body) as { beforeUrl: string; afterUrl: string; expiresIn: number };
    assert.equal(response.status, 200);
    assert.equal(response.headers["Cache-Control"], "private, no-store, max-age=0");
    assert.equal(body.expiresIn, PROOF_SIGNED_URL_EXPIRY_SECONDS);
    assert.match(body.beforeUrl, /^https:\/\/signed\.example\//u);
    assert.match(body.afterUrl, /^https:\/\/signed\.example\//u);
    assert.deepEqual(harness.signed.map((item) => item.expires), [300, 300]);
  });

  it("does not sign an unscoped, cross-task, or URL-shaped legacy path", async () => {
    for (const invalidPath of [
      "https://api.twilio.com/media/ME1",
      `organizations/${organizationId}/tasks/other/submissions/${sessionId}/before-safe.jpg`,
      `organizations/${organizationId}/tasks/${taskId}/submissions/${sessionId}/../before-safe.jpg`,
    ]) {
      const harness = createStore({
        getSubmission: async () => ({
          id: submissionId,
          organizationId,
          taskId,
          beforePhotoPath: invalidPath,
          afterPhotoPath: null,
        }),
      });
      const response = await handleSubmissionMediaRequest(request(), harness.store);
      const body = JSON.parse(response.body) as { beforeUrl: null; unavailable: string[] };
      assert.equal(response.status, 200);
      assert.equal(body.beforeUrl, null);
      assert.deepEqual(body.unavailable, ["before"]);
      assert.equal(harness.signed.length, 0);
    }
  });

  it("validates organization, task, session, kind, and extension in proof paths", () => {
    assert.equal(isScopedProofPath(beforePath, organizationId, taskId, "before"), true);
    assert.equal(isScopedProofPath(beforePath, organizationId, taskId, "after"), false);
    assert.equal(isScopedProofPath(afterPath, organizationId, taskId, "after"), true);
  });
});
