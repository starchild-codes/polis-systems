import assert from "node:assert/strict";
import { describe, it } from "node:test";
import twilio from "twilio";
import { normalizeWhatsAppPhone } from "./phone.js";
import {
  AMBIGUOUS_ASSIGNMENT_MESSAGE,
  BEFORE_PHOTO_RECEIVED_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  INVALID_ASSIGNMENT_COMMAND_MESSAGE,
  NO_ACTIVE_ASSIGNMENT_MESSAGE,
  TASK_ACCEPTED_MESSAGE,
  TASK_DECLINED_MESSAGE,
  UNRECOGNIZED_COLLECTOR_MESSAGE,
} from "./twiml.js";
import {
  handleWhatsAppWebhook,
  reconstructPublicWebhookUrl,
  type WebhookRequest,
  type WhatsAppWebhookStore,
} from "./whatsapp-webhook.js";
import type { WhatsAppProofMediaService } from "./whatsapp-proof.js";

const AUTH_TOKEN = "test_auth_token_not_a_real_secret";
const PUBLIC_URL = "https://polis-systems.vercel.app/api/twilio/whatsapp";

const baseParameters: Record<string, string> = {
  MessageSid: "SM00000000000000000000000000000001",
  From: "whatsapp:+919000000001",
  To: "whatsapp:+15005550006",
  Body: "Hello",
  NumMedia: "0",
};

function tracked<TArguments extends unknown[], TResult>(
  implementation: (...arguments_: TArguments) => TResult,
) {
  const calls: TArguments[] = [];
  const callable = (...arguments_: TArguments): TResult => {
    calls.push(arguments_);
    return implementation(...arguments_);
  };
  return Object.assign(callable, { calls });
}

function createStore(overrides: Partial<WhatsAppWebhookStore> = {}): WhatsAppWebhookStore {
  return {
    claim: async () => ({ kind: "claimed" }),
    findCollectorsByPhone: async () => [],
    markProcessed: async () => undefined,
    markError: async () => undefined,
    processTaskResponse: async () => "no_active_session",
    ...overrides,
  };
}

function createRequest(
  body: unknown = baseParameters,
  headers: Record<string, string> = {},
): WebhookRequest {
  return {
    method: "POST",
    url: "/api/twilio/whatsapp",
    headers: {
      host: "polis-systems.vercel.app",
      "x-forwarded-proto": "https",
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
      "x-twilio-signature": "valid-test-signature",
      ...headers,
    },
    body,
  };
}

async function execute(
  request = createRequest(),
  store = createStore(),
  validateSignature: (
    authToken: string,
    signature: string,
    publicUrl: string,
    parameters: Record<string, string>,
  ) => boolean = () => true,
  proofMediaService?: WhatsAppProofMediaService,
) {
  return handleWhatsAppWebhook(request, {
    authToken: AUTH_TOKEN,
    store,
    validateSignature,
    proofMediaService,
  });
}

describe("Twilio WhatsApp webhook", () => {
  it("accepts a request signed by the official Twilio validator", async () => {
    const url = `${PUBLIC_URL}?source=sandbox`;
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, url, baseParameters);
    const request = createRequest(new URLSearchParams(baseParameters).toString(), {
      host: "internal.vercel.local",
      "x-forwarded-host": "polis-systems.vercel.app",
      "x-forwarded-proto": "https",
      "x-twilio-signature": signature,
    });
    request.url = "/api/twilio/whatsapp?source=sandbox";

    const response = await execute(request, createStore(), twilio.validateRequest);

    assert.equal(response.status, 200);
    assert.equal(reconstructPublicWebhookUrl(request), url);
  });

  it("rejects an invalid signature with 403", async () => {
    const request = createRequest();
    request.headers["content-type"] = "application/json";
    const response = await execute(request, createStore(), () => false);
    assert.equal(response.status, 403);
    assert.equal(response.body, "Forbidden");
  });

  it("rejects a missing signature with 403", async () => {
    const request = createRequest();
    delete request.headers["x-twilio-signature"];
    const response = await execute(request);
    assert.equal(response.status, 403);
  });

  it("recognizes a collector and reports that no task is awaiting a response", async () => {
    const lookup = tracked(async (_phone: string) => [
      { id: "collector-1", organizationId: "organization-1" },
    ]);
    const store = createStore({ findCollectorsByPhone: lookup });
    const response = await execute(createRequest(), store);

    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(NO_ACTIVE_ASSIGNMENT_MESSAGE));
    assert.deepEqual(lookup.calls, [["+919000000001"]]);
  });

  it("returns the unregistered response for an unknown phone", async () => {
    const response = await execute();
    assert.equal(response.status, 200);
    assert.match(response.body, new RegExp(UNRECOGNIZED_COLLECTOR_MESSAGE));
  });

  it("normalizes supported international phone formats consistently", () => {
    const cases: Array<[string, string | null]> = [
      ["whatsapp:+919000000001", "+919000000001"],
      ["+919000000001", "+919000000001"],
      ["919000000001", "+919000000001"],
      ["+91 90000 00001", "+919000000001"],
      ["whatsapp:+91 (90000)-00001", "+919000000001"],
      ["90000 00001", "+9000000001"],
      ["not-a-phone", null],
    ];
    for (const [input, expected] of cases) {
      assert.equal(normalizeWhatsAppPhone(input), expected);
    }
  });

  it("does not process a duplicate MessageSid twice", async () => {
    const lookup = tracked(async (_phone: string) => []);
    const store = createStore({
      claim: async () => ({
        kind: "duplicate",
        processingStatus: "recognized",
        responseCode: "accepted",
      }),
      findCollectorsByPhone: lookup,
    });
    const response = await execute(createRequest(), store);

    assert.match(response.body, new RegExp(TASK_ACCEPTED_MESSAGE));
    assert.equal(lookup.calls.length, 0);
  });

  it("returns safe TwiML for a malformed signed form payload", async () => {
    const response = await execute(createRequest({ From: "whatsapp:+919000000001" }));
    assert.equal(response.status, 400);
    assert.match(response.body, new RegExp(GENERIC_ERROR_MESSAGE));
  });

  it("returns a safe response when the collector lookup fails", async () => {
    const store = createStore({
      findCollectorsByPhone: async () => {
        throw new Error("sensitive database detail");
      },
    });
    const response = await execute(createRequest(), store);

    assert.equal(response.status, 500);
    assert.match(response.body, new RegExp(GENERIC_ERROR_MESSAGE));
    assert.doesNotMatch(response.body, /sensitive database detail/);
  });

  it("persists organization identity only from the matched collector", async () => {
    const collector = { id: "collector-1", organizationId: "trusted-organization" };
    const processTaskResponse = tracked(async () => "no_active_session" as const);
    const store = createStore({
      findCollectorsByPhone: async () => [collector],
      processTaskResponse,
    });
    await execute(createRequest(), store);

    assert.deepEqual(processTaskResponse.calls, [
      [collector, baseParameters.MessageSid, baseParameters.Body],
    ]);
  });

  it("ignores an organization ID spoofed inside Body", async () => {
    const collector = { id: "collector-1", organizationId: "trusted-organization" };
    const processTaskResponse = tracked(async () => "no_active_session" as const);
    const store = createStore({
      findCollectorsByPhone: async () => [collector],
      processTaskResponse,
    });
    const spoofed: Record<string, string> = {
      ...baseParameters,
      Body: "organization_id=attacker-organization",
    };
    await execute(createRequest(spoofed), store);

    assert.deepEqual(processTaskResponse.calls, [[collector, spoofed.MessageSid, spoofed.Body]]);
  });

  it("detects media metadata without downloading or storing its URL", async () => {
    const claim = tracked(async (_messageSid: string, _hasMedia: boolean) => ({
      kind: "claimed" as const,
    }));
    const store = createStore({ claim });
    const withMedia: Record<string, string> = {
      ...baseParameters,
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.test/private-media",
      MediaContentType0: "image/jpeg",
    };
    await execute(createRequest(withMedia), store);

    assert.deepEqual(claim.calls, [[withMedia.MessageSid, true]]);
    assert.doesNotMatch(JSON.stringify(claim.calls), /private-media/);
  });

  it("routes an active proof photo through secure storage instead of Stage 2 command handling", async () => {
    const collector = { id: "collector-1", organizationId: "organization-1" };
    const processTaskResponse = tracked(async () => "invalid_command" as const);
    const storeProofPhoto = tracked(async () => "before_photo_received" as const);
    const store = createStore({
      findCollectorsByPhone: async () => [collector],
      processTaskResponse,
      findProofContext: async () => ({
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
      }),
      recordProofPrompt: async (_collector, _sid, code) => code,
      storeProofPhoto,
      storeProofText: async () => "waste_type_received",
      submitProof: async () => "proof_submitted",
      cancelProof: async () => ({ responseCode: "proof_cancelled", paths: [] }),
    });
    const media: WhatsAppProofMediaService = {
      storeImage: async ({ kind }) => ({ path: `organizations/organization-1/tasks/task-1/submissions/session-1/${kind}-safe.jpg` }),
      removeImages: async () => undefined,
    };
    const message = {
      ...baseParameters,
      Body: "",
      NumMedia: "1",
      MediaUrl0: "https://api.twilio.com/media/ME1",
      MediaContentType0: "image/jpeg",
    };

    const response = await execute(createRequest(message), store, () => true, media);

    assert.match(response.body, new RegExp(BEFORE_PHOTO_RECEIVED_MESSAGE));
    assert.equal(storeProofPhoto.calls.length, 1);
    assert.equal(processTaskResponse.calls.length, 0);
  });

  it("returns valid XML content type for TwiML", async () => {
    const response = await execute();
    assert.equal(response.headers["Content-Type"], "application/xml; charset=utf-8");
    assert.match(response.body, /^<\?xml version="1\.0"/);
    assert.match(response.body, /<Response><Message>/);
  });

  it("returns a safe response when idempotency storage fails", async () => {
    const store = createStore({
      claim: async () => {
        throw new Error("service role key was invalid");
      },
    });
    const response = await execute(createRequest(), store);

    assert.equal(response.status, 500);
    assert.match(response.body, new RegExp(GENERIC_ERROR_MESSAGE));
    assert.doesNotMatch(response.body, /service role key/);
  });

  it("fails closed when one phone ambiguously matches multiple organizations", async () => {
    const markError = tracked(async (_messageSid: string, _errorCode: string) => undefined);
    const store = createStore({
      findCollectorsByPhone: async () => [
        { id: "collector-1", organizationId: "organization-1" },
        { id: "collector-2", organizationId: "organization-2" },
      ],
      markError,
    });
    const response = await execute(createRequest(), store);

    assert.equal(response.status, 500);
    assert.match(response.body, new RegExp(GENERIC_ERROR_MESSAGE));
    assert.deepEqual(markError.calls, [
      [baseParameters.MessageSid, "ambiguous_collector"],
    ]);
  });

  for (const [label, body] of [
    ["exact case", "ACCEPT"],
    ["lowercase", "accept"],
    ["surrounding whitespace", "  ACCEPT  "],
  ]) {
    it(`accepts an assignment using ${label}`, async () => {
      const processTaskResponse = tracked(async () => "accepted" as const);
      const collector = { id: "collector-1", organizationId: "organization-1" };
      const response = await execute(
        createRequest({ ...baseParameters, Body: body }),
        createStore({
          findCollectorsByPhone: async () => [collector],
          processTaskResponse,
        }),
      );
      assert.match(response.body, new RegExp(TASK_ACCEPTED_MESSAGE));
      assert.deepEqual(processTaskResponse.calls, [[collector, baseParameters.MessageSid, body]]);
    });
  }

  it("declines an assignment and confirms only after persistence succeeds", async () => {
    const collector = { id: "collector-1", organizationId: "organization-1" };
    const response = await execute(
      createRequest({ ...baseParameters, Body: "DECLINE" }),
      createStore({
        findCollectorsByPhone: async () => [collector],
        processTaskResponse: async () => "declined",
      }),
    );
    assert.match(response.body, new RegExp(TASK_DECLINED_MESSAGE));
  });

  it("handles zero, expired, and cancelled active sessions safely", async () => {
    for (const simulatedState of ["zero", "expired", "cancelled"]) {
      const response = await execute(
        createRequest({ ...baseParameters, Body: "ACCEPT" }),
        createStore({
          findCollectorsByPhone: async () => [
            { id: "collector-1", organizationId: "organization-1" },
          ],
          processTaskResponse: async () => {
            assert.ok(simulatedState);
            return "no_active_session";
          },
        }),
      );
      assert.match(response.body, new RegExp(NO_ACTIVE_ASSIGNMENT_MESSAGE));
    }
  });

  it("does not guess when multiple sessions are active", async () => {
    const logs: Array<{ errorCode?: string }> = [];
    const response = await handleWhatsAppWebhook(
      createRequest({ ...baseParameters, Body: "ACCEPT" }),
      {
        authToken: AUTH_TOKEN,
        validateSignature: () => true,
        store: createStore({
          findCollectorsByPhone: async () => [
            { id: "collector-1", organizationId: "organization-1" },
          ],
          processTaskResponse: async () => "ambiguous_session",
        }),
        log: (entry) => logs.push(entry),
      },
    );
    assert.match(response.body, new RegExp(AMBIGUOUS_ASSIGNMENT_MESSAGE));
    assert.ok(logs.some((entry) => entry.errorCode === "ambiguous_assignment_session"));
  });

  it("prompts for ACCEPT or DECLINE when an active session receives another command", async () => {
    const response = await execute(
      createRequest({ ...baseParameters, Body: "maybe later" }),
      createStore({
        findCollectorsByPhone: async () => [
          { id: "collector-1", organizationId: "organization-1" },
        ],
        processTaskResponse: async () => "invalid_command",
      }),
    );
    assert.match(response.body, new RegExp(INVALID_ASSIGNMENT_COMMAND_MESSAGE));
  });

  it("fails safely when the atomic task update or event insertion fails", async () => {
    for (const failure of ["task_update_failed", "event_insert_failed"]) {
      const response = await execute(
        createRequest({ ...baseParameters, Body: "ACCEPT" }),
        createStore({
          findCollectorsByPhone: async () => [
            { id: "collector-1", organizationId: "organization-1" },
          ],
          processTaskResponse: async () => { throw new Error(failure); },
        }),
      );
      assert.equal(response.status, 500);
      assert.match(response.body, new RegExp(GENERIC_ERROR_MESSAGE));
      assert.doesNotMatch(response.body, new RegExp(failure));
    }
  });

  it("blocks a cross-tenant session through the organization-scoped store result", async () => {
    const collector = { id: "collector-1", organizationId: "trusted-organization" };
    const processTaskResponse = tracked(async (
      _collector: typeof collector,
      _messageSid: string,
      _body: string,
    ) => "no_active_session" as const);
    await execute(
      createRequest({ ...baseParameters, Body: "organization_id=other-tenant ACCEPT" }),
      createStore({
        findCollectorsByPhone: async () => [collector],
        processTaskResponse,
      }),
    );
    assert.deepEqual(processTaskResponse.calls[0]?.[0], collector);
  });

  it("does not apply repeated ACCEPT or DECLINE deliveries twice", async () => {
    for (const responseCode of ["accepted", "declined"] as const) {
      const processTaskResponse = tracked(async () => responseCode);
      const response = await execute(
        createRequest({ ...baseParameters, Body: responseCode.toUpperCase() }),
        createStore({
          claim: async () => ({
            kind: "duplicate",
            processingStatus: "recognized",
            responseCode,
          }),
          processTaskResponse,
        }),
      );
      assert.equal(processTaskResponse.calls.length, 0);
      assert.match(
        response.body,
        new RegExp(responseCode === "accepted" ? TASK_ACCEPTED_MESSAGE : TASK_DECLINED_MESSAGE),
      );
    }
  });
});
