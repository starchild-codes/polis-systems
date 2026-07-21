import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createReviewOutcomeMessage,
  handleReviewDecision,
  handleReviewNotificationRetry,
  type ReviewNotificationClaim,
  type ReviewNotificationDependencies,
  type ReviewNotificationMessage,
  type ReviewNotificationStore,
} from "./review-notification.js";

const submissionId = "11111111-1111-4111-8111-111111111111";
const notificationId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-21T10:00:00.000Z");
const REGRESSION_REASON = "Before photo does not clearly show the assigned collection area.";

function request(body: Record<string, unknown>, token = "valid-token") {
  return { method: "POST", headers: { authorization: `Bearer ${token}` }, body };
}

function createHarness(overrides: {
  role?: "admin" | "operator";
  active?: boolean;
  submissionOrganizationId?: string;
  submissionMissing?: boolean;
  reviewStatus?: "pending" | "approved" | "rejected";
  transactionStatus?: "pending" | "sending" | "sent" | "failed";
  reviewError?: string;
  claim?: ReviewNotificationClaim;
  claimError?: string;
  sendError?: boolean | string;
  completeResult?: boolean;
  completeError?: boolean;
} = {}) {
  const calls: Array<{ name: string; value?: unknown }> = [];
  const defaultClaim: ReviewNotificationClaim = {
    result: "claimed",
    notificationId,
    notificationType: "submission_approved",
    phoneE164: "+919876543210",
    taskTitle: "Central Market Cleanup",
    rejectionReason: null,
    lastInteractionAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    attemptCount: 1,
  };
  const store: ReviewNotificationStore = {
    authenticate: async (token) => token === "valid-token" ? { id: userId } : null,
    getProfile: async () => ({ activeOrganizationId: organizationId }),
    getMembership: async () => ({
      organizationId,
      role: overrides.role || "admin",
      isActive: overrides.active ?? true,
    }),
    getSubmission: async () => overrides.submissionMissing ? null : ({
      id: submissionId,
      organizationId: overrides.submissionOrganizationId || organizationId,
      reviewStatus: overrides.reviewStatus || "pending",
    }),
    reviewSubmission: async (input) => {
      calls.push({ name: "review", value: input });
      if (overrides.reviewError) throw new Error(overrides.reviewError);
      return {
        result: overrides.reviewStatus && overrides.reviewStatus !== "pending"
          ? "already_reviewed"
          : "reviewed",
        notificationId,
        notificationStatus: overrides.transactionStatus || "pending",
      };
    },
    claimNotification: async (input) => {
      calls.push({ name: "claim", value: input });
      if (overrides.claimError) throw new Error(overrides.claimError);
      return overrides.claim || defaultClaim;
    },
    completeNotification: async (_id, sid) => {
      calls.push({ name: "complete", value: sid });
      if (overrides.completeError) throw new Error("notification_finalize_failed");
      return overrides.completeResult ?? true;
    },
    failNotification: async (_id, code) => {
      calls.push({ name: "fail", value: code });
      return true;
    },
  };
  const sender = {
    send: async (message: ReviewNotificationMessage) => {
      calls.push({ name: "send", value: message });
      if (overrides.sendError) {
        throw new Error(typeof overrides.sendError === "string" ? overrides.sendError : "twilio unavailable");
      }
      return { messageSid: "SM11111111111111111111111111111111" };
    },
  };
  const logs: unknown[] = [];
  const dependencies: ReviewNotificationDependencies = {
    store,
    sender,
    now: () => NOW,
    log: (entry) => logs.push(entry),
  };
  return { store, sender, calls, logs, dependencies };
}

function payload(response: { body: string }) {
  return JSON.parse(response.body) as Record<string, any>;
}

describe("WhatsApp review outcome notifications", () => {
  it("saves an authorized admin approval, sends once, and finalizes the outbox", async () => {
    const harness = createHarness();
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      harness.dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(payload(response).reviewSaved, true);
    assert.equal(payload(response).notification.status, "sent");
    assert.deepEqual(harness.calls.map((call) => call.name), ["review", "claim", "send", "complete"]);
    const sent = harness.calls.find((call) => call.name === "send")?.value as ReviewNotificationMessage;
    assert.match(sent.body, /Central Market Cleanup/u);
    assert.match(sent.body, /has been approved/u);
    assert.doesNotMatch(sent.body, /11111111|22222222|33333333/u);
  });

  it("allows an active operator to approve", async () => {
    const harness = createHarness({ role: "operator" });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      harness.dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(harness.calls.filter((call) => call.name === "review").length, 1);
  });

  it("rejects missing authentication and inactive or unauthorized membership", async () => {
    const missing = createHarness();
    const missingResponse = await handleReviewDecision(
      { method: "POST", headers: {}, body: { submissionId, decision: "approved" } },
      missing.dependencies,
    );
    assert.equal(missingResponse.status, 401);

    const inactive = createHarness({ active: false });
    const inactiveResponse = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      inactive.dependencies,
    );
    assert.equal(inactiveResponse.status, 403);
    assert.equal(inactive.calls.some((call) => call.name === "review"), false);
  });

  it("does not reveal a missing or cross-organization submission", async () => {
    for (const harness of [
      createHarness({ submissionMissing: true }),
      createHarness({ submissionOrganizationId: "55555555-5555-4555-8555-555555555555" }),
    ]) {
      const response = await handleReviewDecision(
        request({ submissionId, decision: "approved" }),
        harness.dependencies,
      );
      assert.equal(response.status, 404);
      assert.equal(harness.calls.some((call) => call.name === "review"), false);
    }
  });

  it("requires a trimmed rejection reason and enforces its maximum length", async () => {
    for (const reason of ["", "   ", "x".repeat(501)]) {
      const harness = createHarness();
      const response = await handleReviewDecision(
        request({ submissionId, decision: "rejected", rejectionReason: reason }),
        harness.dependencies,
      );
      assert.equal(response.status, 400);
      assert.equal(harness.calls.some((call) => call.name === "review"), false);
    }
  });

  it("trims, stores, and sends the exact rejection reason without claiming resubmission", async () => {
    const harness = createHarness({
      claim: {
        result: "claimed",
        notificationId,
        notificationType: "submission_rejected",
        phoneE164: "+919876543210",
        taskTitle: "Central Market Cleanup",
        rejectionReason: REGRESSION_REASON,
        lastInteractionAt: new Date(NOW.getTime() - 60_000).toISOString(),
        attemptCount: 1,
      },
    });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "rejected", rejectionReason: `  ${REGRESSION_REASON}  ` }),
      harness.dependencies,
    );
    assert.equal(response.status, 200);
    const reviewed = harness.calls.find((call) => call.name === "review")?.value as Record<string, unknown>;
    assert.equal(reviewed.rejectionReason, REGRESSION_REASON);
    const sent = harness.calls.find((call) => call.name === "send")?.value as ReviewNotificationMessage;
    assert.match(sent.body, new RegExp(`Reason: ${REGRESSION_REASON.replace(".", "\\.")}`, "u"));
    assert.equal(sent.contentVariables[2], REGRESSION_REASON);
    assert.match(sent.body, /contact your organization administrator/u);
    assert.doesNotMatch(sent.body, /send new proof|reopen/iu);
  });

  it("accepts a 500-character reason and preserves ordinary punctuation", async () => {
    const reason = `${"Evidence unclear; retry requested! ".repeat(16)}`.slice(0, 500);
    assert.equal(reason.length, 500);
    const harness = createHarness({
      claim: {
        result: "claimed", notificationId, notificationType: "submission_rejected",
        phoneE164: "+919876543210", taskTitle: "Central Market Cleanup",
        rejectionReason: reason, lastInteractionAt: NOW.toISOString(), attemptCount: 1,
      },
    });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "rejected", rejectionReason: reason }),
      harness.dependencies,
    );
    assert.equal(response.status, 200);
    const sent = harness.calls.find((call) => call.name === "send")?.value as ReviewNotificationMessage;
    assert.match(sent.body, /Evidence unclear; retry requested!/u);
    assert.equal(sent.contentVariables[2], reason);
  });

  it("uses approval and rejection ContentSid templates when configured", async () => {
    const approved = createHarness();
    approved.dependencies.approvedContentSid = "HXapproved";
    await handleReviewDecision(request({ submissionId, decision: "approved" }), approved.dependencies);
    const approvedMessage = approved.calls.find((call) => call.name === "send")?.value as ReviewNotificationMessage;
    assert.equal(approvedMessage.contentSid, "HXapproved");
    assert.deepEqual(approvedMessage.contentVariables, { 1: "Central Market Cleanup" });

    const rejected = createHarness({
      claim: {
        result: "claimed", notificationId, notificationType: "submission_rejected",
        phoneE164: "+919876543210", taskTitle: "Central Market Cleanup",
        rejectionReason: REGRESSION_REASON, lastInteractionAt: null, attemptCount: 1,
      },
    });
    rejected.dependencies.rejectedContentSid = "HXrejected";
    await handleReviewDecision(
      request({ submissionId, decision: "rejected", rejectionReason: REGRESSION_REASON }),
      rejected.dependencies,
    );
    const rejectedMessage = rejected.calls.find((call) => call.name === "send")?.value as ReviewNotificationMessage;
    assert.equal(rejectedMessage.contentSid, "HXrejected");
    assert.deepEqual(rejectedMessage.contentVariables, { 1: "Central Market Cleanup", 2: REGRESSION_REASON });
    assert.deepEqual(rejectedMessage.requiredTemplateVariables, ["1", "2"]);
  });

  it("keeps the review saved and reports a stable template contract error", async () => {
    const harness = createHarness({
      claim: {
        result: "claimed", notificationId, notificationType: "submission_rejected",
        phoneE164: "+919876543210", taskTitle: "Central Market Cleanup",
        rejectionReason: REGRESSION_REASON, lastInteractionAt: null, attemptCount: 1,
      },
      sendError: "rejection_template_missing_reason_variable",
    });
    harness.dependencies.rejectedContentSid = "HXrejected";
    const response = await handleReviewDecision(
      request({ submissionId, decision: "rejected", rejectionReason: REGRESSION_REASON }),
      harness.dependencies,
    );
    const result = payload(response);
    assert.equal(response.status, 200);
    assert.equal(result.reviewSaved, true);
    assert.equal(result.notification.status, "failed");
    assert.equal(result.notification.retryable, true);
    assert.equal(result.notification.errorCode, "rejection_template_missing_reason_variable");
    assert.match(result.notification.message, /template must include the rejection reason/u);
    assert.equal(harness.calls.find((call) => call.name === "fail")?.value, "rejection_template_missing_reason_variable");
    assert.equal(harness.calls.some((call) => call.name === "complete"), false);
    assert.doesNotMatch(JSON.stringify(harness.logs), new RegExp(REGRESSION_REASON.replace(".", "\\."), "u"));
  });

  it("fails safely when a rejected outbox claim has no saved reason", async () => {
    const harness = createHarness({
      claim: {
        result: "claimed", notificationId, notificationType: "submission_rejected",
        phoneE164: "+919876543210", taskTitle: "Central Market Cleanup",
        rejectionReason: null, lastInteractionAt: NOW.toISOString(), attemptCount: 1,
      },
    });
    const response = await handleReviewNotificationRetry(request({ notificationId }), harness.dependencies);
    const result = payload(response);
    assert.equal(result.notification.status, "failed");
    assert.equal(result.notification.retryable, false);
    assert.equal(result.notification.errorCode, "rejection_reason_missing");
    assert.equal(harness.calls.some((call) => call.name === "send"), false);
  });

  it("uses free-form only inside the customer-service window", async () => {
    const open = createHarness();
    await handleReviewDecision(request({ submissionId, decision: "approved" }), open.dependencies);
    assert.equal((open.calls.find((call) => call.name === "send")?.value as ReviewNotificationMessage).contentSid, undefined);

    const closed = createHarness({
      claim: {
        result: "claimed", notificationId, notificationType: "submission_approved",
        phoneE164: "+919876543210", taskTitle: "Central Market Cleanup",
        rejectionReason: null,
        lastInteractionAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(),
        attemptCount: 1,
      },
    });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      closed.dependencies,
    );
    assert.equal(payload(response).reviewSaved, true);
    assert.equal(payload(response).notification.status, "failed");
    assert.equal(closed.calls.some((call) => call.name === "send"), false);
    assert.equal(closed.calls.find((call) => call.name === "fail")?.value, "template_required");
  });

  it("records missing or invalid phone errors without calling Twilio", async () => {
    for (const phoneE164 of [null, "not-a-phone"]) {
      const harness = createHarness({
        claim: {
          result: "claimed", notificationId, notificationType: "submission_approved",
          phoneE164, taskTitle: "Central Market Cleanup", rejectionReason: null,
          lastInteractionAt: NOW.toISOString(), attemptCount: 1,
        },
      });
      const response = await handleReviewDecision(
        request({ submissionId, decision: "approved" }),
        harness.dependencies,
      );
      assert.equal(payload(response).reviewSaved, true);
      assert.equal(payload(response).notification.status, "failed");
      assert.equal(harness.calls.some((call) => call.name === "send"), false);
      assert.match(String(harness.calls.find((call) => call.name === "fail")?.value), /phone/u);
    }
  });

  it("keeps the review committed and records a safe failure when Twilio fails", async () => {
    const harness = createHarness({ sendError: true });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      harness.dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(payload(response).reviewSaved, true);
    assert.equal(payload(response).notification.status, "failed");
    assert.equal(harness.calls.find((call) => call.name === "fail")?.value, "twilio_send_failed");
    assert.equal(harness.calls.some((call) => call.name === "complete"), false);
    assert.doesNotMatch(JSON.stringify(harness.logs), /9876543210|Polis Systems Update/u);
  });

  it("does not misreport a post-commit notification permission failure as a failed review", async () => {
    const harness = createHarness({ claimError: "notification_claim_failed" });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      harness.dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(payload(response).reviewSaved, true);
    assert.equal(payload(response).notification.status, "failed");
    assert.equal(payload(response).notification.retryable, true);
    assert.match(payload(response).notification.message, /Review saved/u);
    assert.doesNotMatch(response.body, /permission denied|schema|SQL/iu);
  });

  it("maps database transition failures to a stable safe code", async () => {
    const harness = createHarness({ reviewError: "permission denied for table submissions" });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      harness.dependencies,
    );
    assert.equal(response.status, 500);
    assert.equal(payload(response).code, "database_transition_failed");
    assert.doesNotMatch(response.body, /permission denied|submissions/iu);
  });

  it("does not retry after Twilio accepted a message but finalization is uncertain", async () => {
    const harness = createHarness({ completeError: true });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      harness.dependencies,
    );
    assert.equal(payload(response).notification.status, "sending");
    assert.equal(payload(response).notification.retryable, false);
    assert.equal(harness.calls.some((call) => call.name === "fail"), false);
  });

  it("does not send again when the transaction or claim reports an existing sent notification", async () => {
    const finalized = createHarness({ reviewStatus: "approved", transactionStatus: "sent" });
    const response = await handleReviewDecision(
      request({ submissionId, decision: "approved" }),
      finalized.dependencies,
    );
    assert.equal(payload(response).notification.status, "sent");
    assert.equal(finalized.calls.some((call) => call.name === "send"), false);

    const claimed = createHarness({
      claim: {
        result: "already_sent", notificationId,
        notificationType: "submission_approved", attemptCount: 1,
      },
    });
    await handleReviewDecision(request({ submissionId, decision: "approved" }), claimed.dependencies);
    assert.equal(claimed.calls.some((call) => call.name === "send"), false);
  });

  it("retries a failed notification deliberately and stores the Twilio MessageSid", async () => {
    const harness = createHarness();
    const response = await handleReviewNotificationRetry(
      request({ notificationId }),
      harness.dependencies,
    );
    assert.equal(response.status, 200);
    assert.equal(payload(response).notification.status, "sent");
    assert.equal(harness.calls.filter((call) => call.name === "send").length, 1);
    assert.equal(harness.calls.find((call) => call.name === "complete")?.value, "SM11111111111111111111111111111111");
  });

  it("retry resolves and sends the authoritative saved rejection reason", async () => {
    const harness = createHarness({
      claim: {
        result: "claimed", notificationId, notificationType: "submission_rejected",
        phoneE164: "+919876543210", taskTitle: "Central Market Cleanup",
        rejectionReason: REGRESSION_REASON, lastInteractionAt: NOW.toISOString(), attemptCount: 2,
      },
    });
    harness.dependencies.rejectedContentSid = "HXrejected";
    const response = await handleReviewNotificationRetry(request({ notificationId }), harness.dependencies);
    assert.equal(response.status, 200);
    const sent = harness.calls.find((call) => call.name === "send")?.value as ReviewNotificationMessage;
    assert.match(sent.body, new RegExp(REGRESSION_REASON.replace(".", "\\."), "u"));
    assert.equal(sent.contentVariables[2], REGRESSION_REASON);
    assert.deepEqual(sent.requiredTemplateVariables, ["1", "2"]);
    assert.equal(harness.calls.filter((call) => call.name === "send").length, 1);
  });

  it("blocks unauthorized, cross-tenant, already-sent, concurrent, and exhausted retries", async () => {
    const unauthorized = createHarness();
    assert.equal((await handleReviewNotificationRetry(
      { method: "POST", headers: {}, body: { notificationId } }, unauthorized.dependencies,
    )).status, 401);

    const crossTenant = createHarness({ claimError: "notification_not_found" });
    assert.equal((await handleReviewNotificationRetry(
      request({ notificationId }), crossTenant.dependencies,
    )).status, 404);

    const sent = createHarness({
      claim: { result: "already_sent", notificationId, notificationType: "submission_approved", attemptCount: 1 },
    });
    assert.equal((await handleReviewNotificationRetry(request({ notificationId }), sent.dependencies)).status, 409);
    assert.equal(sent.calls.some((call) => call.name === "send"), false);

    const concurrent = createHarness({ claimError: "notification_not_claimable" });
    const concurrentResponse = await handleReviewNotificationRetry(request({ notificationId }), concurrent.dependencies);
    assert.equal(concurrentResponse.status, 200);
    assert.equal(payload(concurrentResponse).notification.status, "sending");
    assert.equal(concurrent.calls.some((call) => call.name === "send"), false);

    const exhausted = createHarness({ claimError: "notification_attempt_limit" });
    const exhaustedResponse = await handleReviewNotificationRetry(request({ notificationId }), exhausted.dependencies);
    assert.equal(exhaustedResponse.status, 200);
    assert.equal(payload(exhaustedResponse).notification.retryable, false);
  });

  it("builds concise outcome messages from real fields only", () => {
    const approved = createReviewOutcomeMessage("submission_approved", " Task A ", null);
    assert.match(approved.body, /proof for "Task A" has been approved/u);
    const rejected = createReviewOutcomeMessage("submission_rejected", "Task B", "Unsafe proof");
    assert.match(rejected.body, /Reason: Unsafe proof/u);
    assert.throws(
      () => createReviewOutcomeMessage("submission_rejected", "Task B", null),
      /rejection_reason_missing/u,
    );
  });
});
