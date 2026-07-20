import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handleWhatsAppProofWorkflow,
  type WhatsAppProofContext,
  type WhatsAppProofMediaService,
  type WhatsAppProofStore,
} from "./whatsapp-proof.js";
import type { CollectorIdentity, WebhookResponseCode } from "./whatsapp-webhook.js";

const collector: CollectorIdentity = { id: "collector-1", organizationId: "organization-1" };

function context(
  overrides: Partial<WhatsAppProofContext> = {},
): WhatsAppProofContext {
  return {
    sessionId: "session-1",
    taskId: "task-1",
    organizationId: collector.organizationId,
    collectorId: collector.id,
    conversationState: "awaiting_before_photo",
    proofStep: null,
    assignmentStatus: "accepted",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    beforePhotoPath: null,
    afterPhotoPath: null,
    taskAvailable: true,
    ...overrides,
  };
}

function inbound(overrides: Partial<{
  messageSid: string;
  body: string;
  numMedia: number;
  media: Array<{ url: string; contentType: string }>;
}> = {}) {
  return {
    messageSid: "SM-proof-1",
    body: "",
    numMedia: 0,
    media: [],
    ...overrides,
  };
}

function createHarness() {
  const calls: Array<{ name: string; value?: unknown }> = [];
  const store: WhatsAppProofStore = {
    findProofContext: async () => context(),
    recordProofPrompt: async (_collector, _sid, responseCode) => {
      calls.push({ name: "prompt", value: responseCode });
      return responseCode;
    },
    storeProofPhoto: async (input) => {
      calls.push({ name: "photo", value: input });
      return input.kind === "before" ? "before_photo_received" : "after_photo_received";
    },
    storeProofText: async (input) => {
      calls.push({ name: "text", value: input });
      return input.field === "waste_type" ? "waste_type_received" : "quantity_received";
    },
    submitProof: async (input) => {
      calls.push({ name: "submit", value: input });
      return "proof_submitted";
    },
    cancelProof: async () => ({
      responseCode: "proof_cancelled",
      paths: ["organizations/organization-1/tasks/task-1/submissions/session-1/before-x.jpg"],
    }),
  };
  const media: WhatsAppProofMediaService = {
    storeImage: async (input) => {
      calls.push({ name: "upload", value: input });
      return { path: `organizations/organization-1/tasks/task-1/submissions/session-1/${input.kind}-safe.jpg` };
    },
    removeImages: async (paths) => {
      calls.push({ name: "remove", value: paths });
    },
  };
  return { store, media, calls };
}

describe("WhatsApp proof workflow", () => {
  it("stores one valid BEFORE image and advances transactionally", async () => {
    const harness = createHarness();
    const result = await handleWhatsAppProofWorkflow(
      inbound({
        numMedia: 1,
        media: [{ url: "https://api.twilio.com/media/1", contentType: "image/jpeg" }],
      }),
      collector,
      context(),
      harness.store,
      harness.media,
    );
    assert.deepEqual(result, { kind: "processed", responseCode: "before_photo_received" });
    assert.deepEqual(harness.calls.map((call) => call.name), ["upload", "photo"]);
  });

  it("keeps AFTER separate from BEFORE", async () => {
    const harness = createHarness();
    const result = await handleWhatsAppProofWorkflow(
      inbound({
        numMedia: 1,
        media: [{ url: "https://api.twilio.com/media/2", contentType: "image/png" }],
      }),
      collector,
      context({
        conversationState: "awaiting_after_photo",
        beforePhotoPath: "organizations/organization-1/tasks/task-1/submissions/session-1/before-safe.jpg",
      }),
      harness.store,
      harness.media,
    );
    assert.deepEqual(result, { kind: "processed", responseCode: "after_photo_received" });
    const photo = harness.calls.find((call) => call.name === "photo")?.value as { kind: string };
    assert.equal(photo.kind, "after");
  });

  it("prompts instead of accepting missing, multiple, unsupported, or text-only photo input", async () => {
    for (const message of [
      inbound({ body: "photo" }),
      inbound({ numMedia: 2, media: [
        { url: "https://api.twilio.com/media/1", contentType: "image/jpeg" },
        { url: "https://api.twilio.com/media/2", contentType: "image/jpeg" },
      ] }),
      inbound({ numMedia: 1, media: [{ url: "https://api.twilio.com/media/1", contentType: "application/pdf" }] }),
      inbound({ numMedia: 1, media: [] }),
    ]) {
      const harness = createHarness();
      const result = await handleWhatsAppProofWorkflow(
        message, collector, context(), harness.store, harness.media,
      );
      assert.deepEqual(result, { kind: "processed", responseCode: "expected_before_photo" });
      assert.equal(harness.calls.some((call) => call.name === "upload"), false);
    }
  });

  it("expires or cancels stale task state before downloading media", async () => {
    for (const [overrides, responseCode] of [
      [{ expiresAt: new Date(Date.now() - 1_000).toISOString() }, "proof_expired"],
      [{ taskAvailable: false }, "task_unavailable"],
    ] as const) {
      const harness = createHarness();
      harness.store.recordProofPrompt = async (_collector, _sid, code) => code;
      const result = await handleWhatsAppProofWorkflow(
        inbound({
          numMedia: 1,
          media: [{ url: "https://api.twilio.com/media/1", contentType: "image/jpeg" }],
        }),
        collector,
        context(overrides),
        harness.store,
        harness.media,
      );
      assert.deepEqual(result, { kind: "processed", responseCode });
      assert.equal(harness.calls.some((call) => call.name === "upload"), false);
    }
  });

  it("removes an uploaded object when the database transition fails", async () => {
    const harness = createHarness();
    harness.store.storeProofPhoto = async () => { throw new Error("state mismatch"); };
    const result = await handleWhatsAppProofWorkflow(
      inbound({ numMedia: 1, media: [{ url: "https://api.twilio.com/media/1", contentType: "image/jpeg" }] }),
      collector, context(), harness.store, harness.media,
    );
    assert.deepEqual(result, { kind: "failed", errorCode: "proof_photo_transition_failed" });
    assert.equal(harness.calls.some((call) => call.name === "remove"), true);
  });

  it("accepts trimmed waste type and quantity without classification or conversion", async () => {
    const harness = createHarness();
    const waste = await handleWhatsAppProofWorkflow(
      inbound({ body: "  mixed plastic and paper  " }), collector,
      context({ conversationState: "awaiting_details", proofStep: "waste_type" }),
      harness.store, harness.media,
    );
    const quantity = await handleWhatsAppProofWorkflow(
      inbound({ body: " approximately 20 kilograms " }), collector,
      context({ conversationState: "awaiting_details", proofStep: "waste_quantity" }),
      harness.store, harness.media,
    );
    assert.deepEqual(waste, { kind: "processed", responseCode: "waste_type_received" });
    assert.deepEqual(quantity, { kind: "processed", responseCode: "quantity_received" });
    const values = harness.calls
      .filter((call) => call.name === "text")
      .map((call) => (call.value as { value: string }).value);
    assert.deepEqual(values, ["mixed plastic and paper", "approximately 20 kilograms"]);
  });

  it("rejects empty, command-like, control-character, and overlong detail text", async () => {
    for (const body of ["", "HELP", "SKIP", "...", `plastic${"x".repeat(120)}`, "plastic\u0000metal"]) {
      const harness = createHarness();
      const result = await handleWhatsAppProofWorkflow(
        inbound({ body }), collector,
        context({ conversationState: "awaiting_details", proofStep: "waste_type" }),
        harness.store, harness.media,
      );
      const expected: WebhookResponseCode = body.toLowerCase() === "help"
        ? "expected_waste_type"
        : "expected_waste_type";
      assert.deepEqual(result, { kind: "processed", responseCode: expected });
      assert.equal(harness.calls.some((call) => call.name === "text"), false);
    }
  });

  it("stores notes, treats SKIP as null, and submits exactly once per claimed message", async () => {
    for (const [body, expectedNotes] of [["Work completed safely", "Work completed safely"], ["sKiP", null]] as const) {
      const harness = createHarness();
      const result = await handleWhatsAppProofWorkflow(
        inbound({ body }), collector,
        context({ conversationState: "awaiting_details", proofStep: "notes" }),
        harness.store, harness.media,
      );
      assert.deepEqual(result, { kind: "processed", responseCode: "proof_submitted" });
      const submissions = harness.calls.filter((call) => call.name === "submit");
      assert.equal(submissions.length, 1);
      assert.equal((submissions[0]?.value as { notes: string | null }).notes, expectedNotes);
    }
  });

  it("HELP returns the current prompt and unexpected media does not advance text states", async () => {
    const helpHarness = createHarness();
    const help = await handleWhatsAppProofWorkflow(
      inbound({ body: "HELP" }), collector,
      context({ conversationState: "awaiting_details", proofStep: "waste_quantity" }),
      helpHarness.store, helpHarness.media,
    );
    assert.deepEqual(help, { kind: "processed", responseCode: "expected_quantity" });

    const mediaHarness = createHarness();
    const unexpectedMedia = await handleWhatsAppProofWorkflow(
      inbound({ numMedia: 1, media: [{ url: "https://api.twilio.com/media/3", contentType: "image/jpeg" }] }),
      collector,
      context({ conversationState: "awaiting_details", proofStep: "notes" }),
      mediaHarness.store, mediaHarness.media,
    );
    assert.deepEqual(unexpectedMedia, { kind: "processed", responseCode: "expected_notes" });
    assert.equal(mediaHarness.calls.some((call) => call.name === "upload"), false);
  });

  it("CANCEL closes the proof flow and requests cleanup of existing private objects", async () => {
    const harness = createHarness();
    const result = await handleWhatsAppProofWorkflow(
      inbound({ body: " cancel " }), collector, context(), harness.store, harness.media,
    );
    assert.deepEqual(result, { kind: "processed", responseCode: "proof_cancelled" });
    assert.equal(harness.calls.some((call) => call.name === "remove"), true);
  });
});
