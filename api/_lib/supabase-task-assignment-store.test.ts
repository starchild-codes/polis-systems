import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TwilioTaskAssignmentSender,
  type TwilioTaskAssignmentClient,
} from "./supabase-task-assignment-store.js";
import type { OutboundAssignmentMessage } from "./task-assignment.js";
import type { WhatsAppServerConfig } from "./supabase-webhook-store.js";

const config: WhatsAppServerConfig = {
  twilioAccountSid: "AC00000000000000000000000000000000",
  twilioAuthToken: "test-token",
  twilioWhatsAppFrom: "whatsapp:+10000000000",
  twilioTaskAssignmentContentSid: "HX00000000000000000000000000000000",
  supabaseUrl: "https://example.supabase.co",
  supabaseServiceRoleKey: "test-service-role-key",
  whatsappMediaMaxBytes: 10 * 1024 * 1024,
};

const message: Omit<OutboundAssignmentMessage, "deliveryMode"> = {
  to: "whatsapp:+919000000001",
  body: "Polis Systems Task Assignment\n\nTask: Lake cleanup",
  contentVariables: {
    task: "Lake cleanup",
    zone: "East",
    location: "East lake gate",
    due: "22 Jul 2026, 6:00 pm",
    priority: "high",
  },
};

function clientHarness() {
  const calls: Array<Record<string, unknown>> = [];
  const client: TwilioTaskAssignmentClient = {
    messages: {
      async create(input) {
        calls.push(input);
        return { sid: "SM00000000000000000000000000000000" };
      },
    },
  };
  return { client, calls };
}

describe("Twilio task-assignment sender", () => {
  it("uses a free-form body inside the service window even when a ContentSid exists", async () => {
    const harness = clientHarness();
    const sender = new TwilioTaskAssignmentSender(config, harness.client);

    await sender.send({ ...message, deliveryMode: "freeform" });

    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0]?.body, message.body);
    assert.equal(harness.calls[0]?.contentSid, undefined);
    assert.equal(harness.calls[0]?.contentVariables, undefined);
  });

  it("uses the documented numeric variables for an out-of-window template", async () => {
    const harness = clientHarness();
    const sender = new TwilioTaskAssignmentSender(config, harness.client);

    await sender.send({ ...message, deliveryMode: "template" });

    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0]?.body, undefined);
    assert.equal(harness.calls[0]?.contentSid, config.twilioTaskAssignmentContentSid);
    assert.deepEqual(JSON.parse(String(harness.calls[0]?.contentVariables)), {
      1: "Lake cleanup",
      2: "East",
      3: "East lake gate",
      4: "22 Jul 2026, 6:00 pm",
      5: "high",
    });
  });

  it("maps Twilio template mismatch errors to a stable safe code", async () => {
    const client: TwilioTaskAssignmentClient = {
      messages: {
        async create() {
          throw Object.assign(new Error("provider details must not escape"), { code: 63028 });
        },
      },
    };
    const sender = new TwilioTaskAssignmentSender(config, client);

    await assert.rejects(
      () => sender.send({ ...message, deliveryMode: "template" }),
      /assignment_template_invalid/u,
    );
  });
});
