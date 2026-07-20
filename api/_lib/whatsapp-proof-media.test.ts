import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProofObjectPath,
  isTrustedTwilioMediaUrl,
  SupabaseTwilioProofMediaService,
  TASK_PROOF_BUCKET,
} from "./whatsapp-proof-media.js";
import type { WhatsAppProofContext } from "./whatsapp-proof.js";

const proofContext: WhatsAppProofContext = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  collectorId: "44444444-4444-4444-8444-444444444444",
  conversationState: "awaiting_before_photo",
  proofStep: null,
  assignmentStatus: "accepted",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  beforePhotoPath: null,
  afterPhotoPath: null,
  taskAvailable: true,
};

function createSupabase(uploadError: Error | null = null) {
  const uploads: Array<{ bucket: string; path: string; body: Uint8Array; options: unknown }> = [];
  const removals: string[][] = [];
  const supabase = {
    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, body: Uint8Array, options: unknown) {
            uploads.push({ bucket, path, body, options });
            return { error: uploadError };
          },
          async remove(paths: string[]) {
            removals.push(paths);
            return { error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  return { supabase, uploads, removals };
}

function imageResponse(
  body: Uint8Array = new Uint8Array([1, 2, 3]),
  contentType = "image/jpeg",
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(body as unknown as BodyInit, {
    status,
    headers: { "content-type": contentType, ...extraHeaders },
  });
}

describe("secure Twilio proof media", () => {
  it("allows only trusted Twilio-controlled HTTPS media hosts", () => {
    assert.equal(isTrustedTwilioMediaUrl("https://api.twilio.com/2010-04-01/media"), true);
    assert.equal(isTrustedTwilioMediaUrl("https://api.us1.twilio.com/media"), true);
    assert.equal(isTrustedTwilioMediaUrl("https://media.twiliocdn.com/media"), true);
    assert.equal(isTrustedTwilioMediaUrl("http://api.twilio.com/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://api.twilio.com.attacker.example/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://127.0.0.1/media"), false);
  });

  it("uses Twilio Basic authentication, validates MIME, and uploads privately scoped bytes", async () => {
    const storage = createSupabase();
    let authorization = "";
    let redirect = "";
    const fetchImplementation = (async (_url: string | URL | Request, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") || "";
      redirect = init?.redirect || "";
      return imageResponse();
    }) as typeof fetch;
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      fetchImplementation,
      randomId: () => "55555555-5555-4555-8555-555555555555",
    });

    const result = await service.storeImage({
      context: proofContext,
      kind: "before",
      mediaUrl: "https://api.twilio.com/media/ME1",
      declaredContentType: "image/jpeg",
    });

    assert.match(authorization, /^Basic /u);
    assert.equal(redirect, "manual");
    assert.equal(storage.uploads[0]?.bucket, TASK_PROOF_BUCKET);
    assert.equal(storage.uploads[0]?.path, result.path);
    assert.match(result.path, /^organizations\/33333333-3333-4333-8333-333333333333\/tasks\/22222222-2222-4222-8222-222222222222\/submissions\/11111111-1111-4111-8111-111111111111\/before-/u);
    assert.doesNotMatch(result.path, /collector|phone|whatsapp/u);
  });

  it("rejects unsupported declarations and response MIME mismatches", async () => {
    const storage = createSupabase();
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      fetchImplementation: (async () => imageResponse(undefined, "text/html")) as typeof fetch,
    });
    await assert.rejects(
      service.storeImage({
        context: proofContext,
        kind: "before",
        mediaUrl: "https://api.twilio.com/media/ME1",
        declaredContentType: "application/pdf",
      }),
      /unsupported_media_type/u,
    );
    await assert.rejects(
      service.storeImage({
        context: proofContext,
        kind: "before",
        mediaUrl: "https://api.twilio.com/media/ME1",
        declaredContentType: "image/jpeg",
      }),
      /media_content_type_mismatch/u,
    );
  });

  it("enforces content-length and streamed response limits", async () => {
    for (const response of [
      imageResponse(new Uint8Array([1]), "image/jpeg", 200, { "content-length": "100" }),
      imageResponse(new Uint8Array([1, 2, 3, 4]), "image/jpeg"),
    ]) {
      const storage = createSupabase();
      const service = new SupabaseTwilioProofMediaService(storage.supabase, {
        accountSid: "AC-test",
        authToken: "auth-test",
        maximumBytes: 3,
        fetchImplementation: (async () => response) as typeof fetch,
      });
      await assert.rejects(
        service.storeImage({
          context: proofContext,
          kind: "before",
          mediaUrl: "https://api.twilio.com/media/ME1",
          declaredContentType: "image/jpeg",
        }),
        /media_too_large/u,
      );
      assert.equal(storage.uploads.length, 0);
    }
  });

  it("rejects an untrusted redirect without following it", async () => {
    const storage = createSupabase();
    let calls = 0;
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      fetchImplementation: (async () => {
        calls += 1;
        return imageResponse(new Uint8Array(), "image/jpeg", 302, {
          location: "https://attacker.example/proof.jpg",
        });
      }) as typeof fetch,
    });
    await assert.rejects(
      service.storeImage({
        context: proofContext,
        kind: "before",
        mediaUrl: "https://api.twilio.com/media/ME1",
        declaredContentType: "image/jpeg",
      }),
      /unsafe_media_redirect/u,
    );
    assert.equal(calls, 1);
  });

  it("aborts a timed-out fetch", async () => {
    const storage = createSupabase();
    const fetchImplementation = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })) as typeof fetch;
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      timeoutMs: 5,
      fetchImplementation,
    });
    await assert.rejects(
      service.storeImage({
        context: proofContext,
        kind: "before",
        mediaUrl: "https://api.twilio.com/media/ME1",
        declaredContentType: "image/jpeg",
      }),
      /media_fetch_timeout/u,
    );
  });

  it("surfaces a storage failure without exposing provider details", async () => {
    const storage = createSupabase(new Error("sensitive storage error"));
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      fetchImplementation: (async () => imageResponse()) as typeof fetch,
    });
    await assert.rejects(
      service.storeImage({
        context: proofContext,
        kind: "after",
        mediaUrl: "https://api.twilio.com/media/ME1",
        declaredContentType: "image/jpeg",
      }),
      /^Error: proof_storage_upload_failed$/u,
    );
  });

  it("builds distinguishable before and after object paths", () => {
    const before = buildProofObjectPath(proofContext, "before", "jpg", "safe-id");
    const after = buildProofObjectPath(proofContext, "after", "jpg", "safe-id");
    assert.notEqual(before, after);
    assert.match(before, /\/before-safe-id\.jpg$/u);
    assert.match(after, /\/after-safe-id\.jpg$/u);
  });
});
