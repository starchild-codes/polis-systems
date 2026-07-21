import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReviewNotificationMessage } from "./review-notification.js";
import {
  SupabaseReviewNotificationStore,
  TwilioReviewNotificationSender,
  contentTemplateRendersVariables,
  type TwilioReviewClient,
  type TwilioContentTemplate,
} from "./supabase-review-notification-store.js";
import type { WhatsAppServerConfig } from "./supabase-webhook-store.js";

const REGRESSION_REASON = "Before photo does not clearly show the assigned collection area.";

const config: WhatsAppServerConfig = {
  twilioAccountSid: "AC00000000000000000000000000000000",
  twilioAuthToken: "test-token",
  twilioWhatsAppFrom: "whatsapp:+15005550006",
  supabaseUrl: "https://example.supabase.co",
  supabaseServiceRoleKey: "test-service-key",
  whatsappMediaMaxBytes: 10 * 1024 * 1024,
};

function rejectedMessage(): ReviewNotificationMessage {
  return {
    to: "whatsapp:+13055550123",
    body: [
      "Polis Systems Update",
      "",
      'Your proof for "Central Market Cleanup" was not approved.',
      "",
      `Reason: ${REGRESSION_REASON}`,
      "",
      "Please contact your organization administrator for next steps.",
    ].join("\n"),
    contentSid: "HX00000000000000000000000000000000",
    contentVariables: { "1": "Central Market Cleanup", "2": REGRESSION_REASON },
    requiredTemplateVariables: ["1", "2"],
  };
}

function clientHarness(template: TwilioContentTemplate, fetchError = false) {
  const calls: Array<{ name: string; value?: unknown }> = [];
  const client: TwilioReviewClient = {
    content: {
      v1: {
        contents: (contentSid) => ({
          fetch: async () => {
            calls.push({ name: "fetch-template", value: contentSid });
            if (fetchError) throw new Error("provider detail that must stay private");
            return template;
          },
        }),
      },
    },
    messages: {
      create: async (input) => {
        calls.push({ name: "send", value: input });
        return { sid: "SM00000000000000000000000000000000" };
      },
    },
  };
  return { client, calls };
}

describe("Twilio rejection template contract", () => {
  it("passes the reason into the review RPC and maps the authoritative saved reason from retry claims", async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const database = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (name === "review_submission_with_whatsapp_outbox") {
          return {
            data: [{ result: "reviewed", notification_id: "notification", notification_status: "pending" }],
            error: null,
          };
        }
        return {
          data: [{
            result: "claimed",
            notification_id: "notification",
            notification_type: "submission_rejected",
            phone_e164: "+13055550123",
            task_title: "Central Market Cleanup",
            rejection_reason: REGRESSION_REASON,
            last_interaction_at: "2026-07-21T10:00:00.000Z",
            attempt_count: 2,
          }],
          error: null,
        };
      },
    };
    const store = new SupabaseReviewNotificationStore(database as never);
    await store.reviewSubmission({
      submissionId: "submission",
      organizationId: "organization",
      reviewerId: "reviewer",
      decision: "rejected",
      rejectionReason: REGRESSION_REASON,
    });
    const claim = await store.claimNotification({
      notificationId: "notification",
      organizationId: "organization",
      actorId: "reviewer",
    });

    assert.equal(rpcCalls[0]?.args.p_rejection_reason, REGRESSION_REASON);
    assert.equal(claim.result, "claimed");
    if (claim.result === "claimed") assert.equal(claim.rejectionReason, REGRESSION_REASON);
  });

  it("recognizes the documented title and rejection-reason variables in message bodies", () => {
    assert.equal(contentTemplateRendersVariables({
      types: {
        "twilio/text": {
          body: 'Your proof for "{{1}}" was not approved. Reason: {{2}}. Please contact your administrator.',
        },
      },
    }, ["1", "2"]), true);

    assert.equal(contentTemplateRendersVariables({
      types: {
        "twilio/call-to-action": {
          body: 'Your proof for "{{1}}" was not approved.',
          actions: [{ url: "https://example.com/reason/{{2}}" }],
        },
      },
    }, ["1", "2"]), false);
  });

  it("sends ContentVariables with the exact rejection reason after validating the template", async () => {
    const harness = clientHarness({
      types: {
        "twilio/text": {
          body: 'Your proof for "{{1}}" was not approved. Reason: {{2}}. Please contact your administrator.',
        },
      },
    });
    const sender = new TwilioReviewNotificationSender(config, harness.client);
    await sender.send(rejectedMessage());

    assert.deepEqual(harness.calls.map((call) => call.name), ["fetch-template", "send"]);
    const outbound = harness.calls[1]?.value as Record<string, unknown>;
    assert.equal(outbound.contentSid, rejectedMessage().contentSid);
    assert.equal(outbound.body, undefined);
    assert.deepEqual(JSON.parse(String(outbound.contentVariables)), {
      "1": "Central Market Cleanup",
      "2": REGRESSION_REASON,
    });
  });

  it("never sends a configured rejection template that omits the reason variable", async () => {
    const harness = clientHarness({
      types: {
        "twilio/text": {
          body: 'Your proof for "{{1}}" was not approved. Please contact your administrator.',
        },
      },
    });
    const sender = new TwilioReviewNotificationSender(config, harness.client);
    await assert.rejects(
      () => sender.send(rejectedMessage()),
      /rejection_template_missing_reason_variable/u,
    );
    assert.deepEqual(harness.calls.map((call) => call.name), ["fetch-template"]);
  });

  it("fails closed when the configured template contract cannot be retrieved", async () => {
    const harness = clientHarness({}, true);
    const sender = new TwilioReviewNotificationSender(config, harness.client);
    await assert.rejects(
      () => sender.send(rejectedMessage()),
      /rejection_template_contract_unavailable/u,
    );
    assert.deepEqual(harness.calls.map((call) => call.name), ["fetch-template"]);
  });

  it("keeps free-form rejection delivery unchanged inside the service window", async () => {
    const harness = clientHarness({});
    const sender = new TwilioReviewNotificationSender(config, harness.client);
    const message = rejectedMessage();
    delete message.contentSid;
    delete message.requiredTemplateVariables;
    await sender.send(message);
    assert.deepEqual(harness.calls.map((call) => call.name), ["send"]);
    const outbound = harness.calls[0]?.value as Record<string, unknown>;
    assert.match(String(outbound.body), new RegExp(REGRESSION_REASON.replace(".", "\\."), "u"));
    assert.equal(outbound.contentVariables, undefined);
  });

  it("keeps approved ContentSid delivery unchanged", async () => {
    const harness = clientHarness({});
    const sender = new TwilioReviewNotificationSender(config, harness.client);
    await sender.send({
      to: "whatsapp:+13055550123",
      body: "Polis Systems Update\n\nYour proof has been approved.",
      contentSid: "HX00000000000000000000000000000001",
      contentVariables: { "1": "Central Market Cleanup" },
    });
    assert.deepEqual(harness.calls.map((call) => call.name), ["send"]);
    const outbound = harness.calls[0]?.value as Record<string, unknown>;
    assert.deepEqual(JSON.parse(String(outbound.contentVariables)), { "1": "Central Market Cleanup" });
  });
});
