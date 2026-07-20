import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildProofObjectPath,
  isTrustedTwilioMediaHost,
  isTrustedTwilioMediaUrl,
  MAX_TWILIO_MEDIA_REDIRECTS,
  SupabaseTwilioProofMediaService,
  TASK_PROOF_BUCKET,
  type TwilioMediaDiagnostic,
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
  it("allows only the Twilio API and exact secured Messaging CDN hosts over HTTPS", () => {
    assert.equal(isTrustedTwilioMediaHost("api.twilio.com"), true);
    assert.equal(isTrustedTwilioMediaHost("api.us1.twilio.com"), true);
    assert.equal(isTrustedTwilioMediaHost("mms.twiliocdn.com"), true);
    assert.equal(isTrustedTwilioMediaUrl("https://api.twilio.com/2010-04-01/media"), true);
    assert.equal(isTrustedTwilioMediaUrl("https://api.us1.twilio.com/media"), true);
    assert.equal(isTrustedTwilioMediaUrl("https://mms.twiliocdn.com/media"), true);
    assert.equal(isTrustedTwilioMediaUrl("http://api.twilio.com/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("http://mms.twiliocdn.com/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://example.com/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://localhost/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://10.0.0.1/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://172.16.0.1/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://192.168.1.1/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://169.254.169.254/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://[::1]/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://twilio.example.com/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://mms.twiliocdn.com.example/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://mms-twiliocdn.com/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://api.twilio.com.attacker.example/media"), false);
    assert.equal(isTrustedTwilioMediaUrl("https://127.0.0.1/media"), false);
  });

  it("accepts the secured Twilio CDN redirect and strips Basic Auth across hosts", async () => {
    const storage = createSupabase();
    const calls: Array<{ url: string; authorization: string; redirect: string }> = [];
    const diagnostics: TwilioMediaDiagnostic[] = [];
    const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: url.toString(),
        authorization: new Headers(init?.headers).get("authorization") || "",
        redirect: init?.redirect || "",
      });
      if (calls.length === 1) {
        return imageResponse(new Uint8Array(), "image/jpeg", 302, {
          location: "https://mms.twiliocdn.com/secured-media?token=signed-secret",
        });
      }
      return imageResponse();
    }) as typeof fetch;
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      fetchImplementation,
      diagnosticLog: (entry) => diagnostics.push(entry),
      randomId: () => "55555555-5555-4555-8555-555555555555",
    });

    await service.storeImage({
      context: proofContext,
      kind: "before",
      mediaUrl: "https://api.twilio.com/media/ME1",
      declaredContentType: "image/jpeg",
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0]?.authorization || "", /^Basic /u);
    assert.equal(calls[1]?.authorization, "");
    assert.ok(calls.every((call) => call.redirect === "manual"));
    assert.deepEqual(diagnostics, [{
      code: "media_redirect_accepted",
      sourceHost: "api.twilio.com",
      targetHost: "mms.twiliocdn.com",
      redirectCount: 1,
    }]);
    assert.doesNotMatch(JSON.stringify(diagnostics), /secured-media|signed-secret|token=/u);
    assert.equal(storage.uploads.length, 1);
  });

  it("retains Basic Auth only while redirects stay on trusted Twilio API hosts", async () => {
    const storage = createSupabase();
    const authorizations: string[] = [];
    const fetchImplementation = (async (_url: string | URL | Request, init?: RequestInit) => {
      authorizations.push(new Headers(init?.headers).get("authorization") || "");
      return authorizations.length === 1
        ? imageResponse(new Uint8Array(), "image/jpeg", 307, { location: "/media/ME1/content" })
        : imageResponse();
    }) as typeof fetch;
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      fetchImplementation,
    });

    await service.storeImage({
      context: proofContext,
      kind: "before",
      mediaUrl: "https://api.twilio.com/media/ME1",
      declaredContentType: "image/jpeg",
    });

    assert.equal(authorizations.length, 2);
    assert.ok(authorizations.every((authorization) => /^Basic /u.test(authorization)));
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

  it("rejects HTTP, local, private, misleading, and lookalike redirect targets", async () => {
    const unsafeTargets = [
      "http://mms.twiliocdn.com/proof.jpg",
      "https://localhost/proof.jpg",
      "https://127.0.0.1/proof.jpg",
      "https://10.0.0.1/proof.jpg",
      "https://twilio.example.com/proof.jpg",
      "https://mms.twiliocdn.com.example/proof.jpg",
    ];

    for (const location of unsafeTargets) {
      const storage = createSupabase();
      let calls = 0;
      const service = new SupabaseTwilioProofMediaService(storage.supabase, {
        accountSid: "AC-test",
        authToken: "auth-test",
        fetchImplementation: (async () => {
          calls += 1;
          return imageResponse(new Uint8Array(), "image/jpeg", 302, { location });
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
      assert.equal(storage.uploads.length, 0);
    }
  });

  it("enforces the redirect-count limit while revalidating every hop", async () => {
    const storage = createSupabase();
    const diagnostics: TwilioMediaDiagnostic[] = [];
    let calls = 0;
    const service = new SupabaseTwilioProofMediaService(storage.supabase, {
      accountSid: "AC-test",
      authToken: "auth-test",
      diagnosticLog: (entry) => diagnostics.push(entry),
      fetchImplementation: (async () => {
        calls += 1;
        return imageResponse(new Uint8Array(), "image/jpeg", 302, {
          location: `https://mms.twiliocdn.com/hop-${calls}`,
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
    assert.equal(calls, MAX_TWILIO_MEDIA_REDIRECTS + 1);
    assert.equal(diagnostics.at(-1)?.code, "media_redirect_limit");
    assert.equal(storage.uploads.length, 0);
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
