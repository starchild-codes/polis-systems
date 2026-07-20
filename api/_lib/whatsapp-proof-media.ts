import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WhatsAppProofContext,
  WhatsAppProofMediaService,
} from "./whatsapp-proof.js";

export const TASK_PROOF_BUCKET = "task-proof";
export const DEFAULT_WHATSAPP_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const TWILIO_MEDIA_FETCH_TIMEOUT_MS = 8_000;

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

type FetchImplementation = typeof fetch;

export interface TwilioProofMediaOptions {
  accountSid: string;
  authToken: string;
  maximumBytes?: number;
  fetchImplementation?: FetchImplementation;
  randomId?: () => string;
  timeoutMs?: number;
}

function normalizeMimeType(value: string | null): string {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() || "";
  return normalized === "image/jpg" ? "image/jpeg" : normalized;
}

export function isTrustedTwilioMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === "api.twilio.com"
      || /^api\.[a-z0-9-]+\.twilio\.com$/u.test(hostname)
      || hostname === "media.twiliocdn.com"
      || /^[a-z0-9-]+\.media\.twiliocdn\.com$/u.test(hostname);
  } catch {
    return false;
  }
}

async function fetchTrustedMedia(
  initialUrl: string,
  options: TwilioProofMediaOptions,
): Promise<Response> {
  const fetchImplementation = options.fetchImplementation || fetch;
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    if (!isTrustedTwilioMediaUrl(currentUrl)) throw new Error("untrusted_media_url");

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs || TWILIO_MEDIA_FETCH_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetchImplementation(currentUrl, {
        method: "GET",
        headers: {
          Authorization: `Basic ${Buffer.from(`${options.accountSid}:${options.authToken}`).toString("base64")}`,
          Accept: "image/jpeg,image/png,image/webp,image/heic,image/heif",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("media_fetch_timeout");
      }
      throw new Error("media_fetch_failed");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 2) throw new Error("unsafe_media_redirect");
      const redirectedUrl = new URL(location, currentUrl).toString();
      if (!isTrustedTwilioMediaUrl(redirectedUrl)) throw new Error("unsafe_media_redirect");
      currentUrl = redirectedUrl;
      continue;
    }

    if (!response.ok) throw new Error("media_fetch_failed");
    return response;
  }

  throw new Error("unsafe_media_redirect");
}

async function readLimitedBody(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maximumBytes) {
    throw new Error("media_too_large");
  }
  if (!response.body) throw new Error("media_body_missing");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error("media_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) throw new Error("media_body_missing");
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function buildProofObjectPath(
  context: WhatsAppProofContext,
  kind: "before" | "after",
  extension: string,
  randomId: string,
): string {
  const safeRandomId = randomId.toLowerCase().replace(/[^a-z0-9-]/gu, "");
  if (!safeRandomId) throw new Error("invalid_storage_identifier");
  return [
    "organizations",
    context.organizationId,
    "tasks",
    context.taskId,
    "submissions",
    context.sessionId,
    `${kind}-${safeRandomId}.${extension}`,
  ].join("/");
}

export class SupabaseTwilioProofMediaService implements WhatsAppProofMediaService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly options: TwilioProofMediaOptions,
  ) {}

  async storeImage(input: {
    context: WhatsAppProofContext;
    kind: "before" | "after";
    mediaUrl: string;
    declaredContentType: string;
  }): Promise<{ path: string }> {
    const declaredMimeType = normalizeMimeType(input.declaredContentType);
    if (!MIME_EXTENSIONS[declaredMimeType]) throw new Error("unsupported_media_type");
    if (!isTrustedTwilioMediaUrl(input.mediaUrl)) throw new Error("untrusted_media_url");

    const response = await fetchTrustedMedia(input.mediaUrl, this.options);
    const responseMimeType = normalizeMimeType(response.headers.get("content-type"));
    const extension = MIME_EXTENSIONS[responseMimeType];
    if (!extension || responseMimeType !== declaredMimeType) {
      throw new Error("media_content_type_mismatch");
    }

    const maximumBytes = this.options.maximumBytes || DEFAULT_WHATSAPP_MEDIA_MAX_BYTES;
    const body = await readLimitedBody(response, maximumBytes);
    const path = buildProofObjectPath(
      input.context,
      input.kind,
      extension,
      (this.options.randomId || randomUUID)(),
    );

    const { error } = await this.supabase.storage.from(TASK_PROOF_BUCKET).upload(path, body, {
      contentType: responseMimeType,
      upsert: false,
      cacheControl: "0",
    });
    if (error) throw new Error("proof_storage_upload_failed");
    return { path };
  }

  async removeImages(paths: string[]): Promise<void> {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (uniquePaths.length === 0) return;
    await this.supabase.storage.from(TASK_PROOF_BUCKET).remove(uniquePaths);
  }
}
