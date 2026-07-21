import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseReviewNotificationStore } from "./supabase-review-notification-store.js";
import {
  formatSubmissionQuantity,
  QUANTITY_NOT_PROVIDED,
} from "../../src/lib/submission-quantity.js";

const root = new URL("../../", import.meta.url);

describe("Stage 4 Review blocker regressions", () => {
  it("keeps identity verification separate from privileged data access", async () => {
    const calls: string[] = [];
    const identityClient = {
      auth: {
        getUser: async (token: string) => {
          calls.push(`identity:${token}`);
          return { data: { user: { id: "reviewer" } }, error: null };
        },
      },
    } as unknown as SupabaseClient;
    const serviceClient = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push(`service:${table}`);
              return { data: { active_organization_id: "organization" }, error: null };
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const store = new SupabaseReviewNotificationStore(serviceClient, identityClient);
    assert.deepEqual(await store.authenticate("user-access-token"), { id: "reviewer" });
    assert.deepEqual(await store.getProfile("reviewer"), { activeOrganizationId: "organization" });
    assert.deepEqual(calls, ["identity:user-access-token", "service:profiles"]);
  });

  it("does not let getUser authorization replace later service-role authorization", async () => {
    const observed: Array<{ endpoint: string; authorization: string | null; apiKey: string | null }> = [];
    const serviceToken = "service-role-test-token";
    const userToken = "user-access-test-token";
    const client = createClient("https://example.supabase.co", serviceToken, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init = {}) => {
          const endpoint = String(input).includes("/auth/v1/") ? "auth" : "rest";
          const headers = new Headers(init.headers);
          observed.push({
            endpoint,
            authorization: headers.get("authorization"),
            apiKey: headers.get("apikey"),
          });
          const body = endpoint === "auth" ? { id: "reviewer" } : [];
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });

    await client.auth.getUser(userToken);
    await client.from("profiles").select("id");

    assert.deepEqual(observed, [
      {
        endpoint: "auth",
        authorization: `Bearer ${userToken}`,
        apiKey: serviceToken,
      },
      {
        endpoint: "rest",
        authorization: `Bearer ${serviceToken}`,
        apiKey: serviceToken,
      },
    ]);
  });

  it("routes browser decisions through the server and leaves no direct review fallback", async () => {
    const actions = await readFile(new URL("src/lib/review-actions.ts", root), "utf8");
    const submissionStore = await readFile(new URL("src/lib/submission-store.ts", root), "utf8");
    const decisionEndpoint = await readFile(new URL("api/review/decision.ts", root), "utf8");
    assert.match(actions, /fetch\(path/iu);
    assert.match(actions, /\/api\/review\/decision/iu);
    assert.doesNotMatch(actions, /\.rpc\(|\.from\("submissions"\)\.update/iu);
    assert.doesNotMatch(submissionStore, /review_submission_safely|approveSubmission|rejectSubmission/iu);
    assert.match(decisionEndpoint, /const identityClient = createWebhookSupabaseClient/iu);
    assert.match(decisionEndpoint, /const serviceClient = createWebhookSupabaseClient/iu);
    assert.match(decisionEndpoint, /SupabaseReviewNotificationStore\(serviceClient, identityClient\)/iu);
  });

  it("preserves free-text quantity units and provides a neutral historical fallback", () => {
    assert.equal(formatSubmissionQuantity("12 kg"), "12 kg");
    assert.equal(formatSubmissionQuantity(" 3 bags "), "3 bags");
    assert.equal(formatSubmissionQuantity("750 litres"), "750 litres");
    assert.equal(formatSubmissionQuantity(null), QUANTITY_NOT_PROVIDED);
    assert.equal(formatSubmissionQuantity("   "), QUANTITY_NOT_PROVIDED);
  });

  it("selects, maps, and renders final submission quantity in queue and detail", async () => {
    const store = await readFile(new URL("src/lib/submission-store.ts", root), "utf8");
    const review = await readFile(new URL("src/routes/review.tsx", root), "utf8");
    assert.match(store, /from\("submissions"\)[\s\S]*?select\("\*"\)/iu);
    assert.match(store, /quantityEstimate:\s*row\.quantity_estimate/iu);
    assert.match(review, /<TableHead>Quantity<\/TableHead>/iu);
    assert.match(review, /formatSubmissionQuantity\(s\.quantityEstimate\)/iu);
    assert.match(review, /formatSubmissionQuantity\(submission\.quantityEstimate\)/iu);
    assert.match(review, /Notes not provided/iu);
    assert.match(review, /EvidencePreview[\s\S]*label="Before photo"/iu);
    assert.match(review, /EvidencePreview[\s\S]*label="After photo"/iu);
  });
});
