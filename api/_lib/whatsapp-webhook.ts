import { normalizeWhatsAppPhone } from "./phone.js";
import {
  createMessagingTwiml,
  GENERIC_ERROR_MESSAGE,
  RECOGNIZED_COLLECTOR_MESSAGE,
  UNRECOGNIZED_COLLECTOR_MESSAGE,
} from "./twiml.js";

export type WebhookProcessingStatus =
  | "received"
  | "recognized"
  | "unrecognized"
  | "error";

export type WebhookEventClaim =
  | { kind: "claimed" }
  | { kind: "duplicate"; processingStatus: WebhookProcessingStatus };

export interface CollectorIdentity {
  id: string;
  organizationId: string;
}

export interface WhatsAppWebhookStore {
  claim(messageSid: string, hasMedia: boolean): Promise<WebhookEventClaim>;
  findCollectorsByPhone(phoneE164: string): Promise<CollectorIdentity[]>;
  markProcessed(
    messageSid: string,
    status: "recognized" | "unrecognized",
    collector?: CollectorIdentity,
  ): Promise<void>;
  markError(messageSid: string, errorCode: string): Promise<void>;
}

export interface SafeWebhookLog {
  messageSid?: string;
  status: string;
  collectorMatched?: boolean;
  errorCode?: string;
}

export interface WebhookRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface WebhookResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface WhatsAppWebhookDependencies {
  authToken: string;
  store: WhatsAppWebhookStore;
  validateSignature: (
    authToken: string,
    signature: string,
    publicUrl: string,
    parameters: Record<string, string>,
  ) => boolean;
  log?: (entry: SafeWebhookLog) => void;
}

interface ParsedInboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  mediaUrl0: string | null;
  mediaContentType0: string | null;
}

const XML_HEADERS = { "Content-Type": "application/xml; charset=utf-8" };
const TEXT_HEADERS = { "Content-Type": "text/plain; charset=utf-8" };

function firstHeaderValue(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return null;
  return candidate.split(",")[0]?.trim() || null;
}

function getHeader(
  headers: WebhookRequest["headers"],
  requestedName: string,
): string | null {
  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === requestedName.toLowerCase(),
  );
  return key ? firstHeaderValue(headers[key]) : null;
}

export function reconstructPublicWebhookUrl(request: WebhookRequest): string | null {
  const forwardedHost = getHeader(request.headers, "x-forwarded-host");
  const host = forwardedHost || getHeader(request.headers, "host");
  const forwardedProto = getHeader(request.headers, "x-forwarded-proto");
  const requestUrl = request.url || "/api/twilio/whatsapp";

  if (!host) {
    try {
      const absoluteUrl = new URL(requestUrl);
      return absoluteUrl.protocol === "http:" || absoluteUrl.protocol === "https:"
        ? absoluteUrl.toString()
        : null;
    } catch {
      return null;
    }
  }

  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
  const protocol = forwardedProto || (localHost ? "http" : "https");
  if (protocol !== "http" && protocol !== "https") return null;

  try {
    const pathAndQuery = requestUrl.startsWith("http://") || requestUrl.startsWith("https://")
      ? `${new URL(requestUrl).pathname}${new URL(requestUrl).search}`
      : requestUrl.startsWith("/")
        ? requestUrl
        : `/${requestUrl}`;
    return new URL(pathAndQuery, `${protocol}://${host}`).toString();
  } catch {
    return null;
  }
}

export function parseFormBody(body: unknown): Record<string, string> | null {
  if (typeof body === "string") {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }

  if (Buffer.isBuffer(body)) {
    return Object.fromEntries(new URLSearchParams(body.toString("utf8")).entries());
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const parameters: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      parameters[key] = value;
    } else if (Array.isArray(value) && typeof value[0] === "string") {
      parameters[key] = value[0];
    } else if (typeof value === "number") {
      parameters[key] = String(value);
    } else {
      return null;
    }
  }
  return parameters;
}

function parseInboundMessage(
  parameters: Record<string, string>,
): ParsedInboundMessage | null {
  const messageSid = parameters.MessageSid?.trim();
  const from = parameters.From?.trim();
  if (!messageSid || messageSid.length > 64 || !from) return null;

  const rawNumMedia = parameters.NumMedia?.trim() || "0";
  if (!/^\d+$/.test(rawNumMedia)) return null;
  const numMedia = Number.parseInt(rawNumMedia, 10);
  if (!Number.isSafeInteger(numMedia) || numMedia < 0) return null;

  return {
    messageSid,
    from,
    to: parameters.To || "",
    body: parameters.Body || "",
    numMedia,
    mediaUrl0: parameters.MediaUrl0 || null,
    mediaContentType0: parameters.MediaContentType0 || null,
  };
}

function twimlResponse(message: string, status = 200): WebhookResponse {
  return { status, headers: XML_HEADERS, body: createMessagingTwiml(message) };
}

async function markErrorSafely(
  store: WhatsAppWebhookStore,
  messageSid: string,
  errorCode: string,
): Promise<void> {
  try {
    await store.markError(messageSid, errorCode);
  } catch {
    // The original safe error is more useful than a secondary persistence error.
  }
}

export async function handleWhatsAppWebhook(
  request: WebhookRequest,
  dependencies: WhatsAppWebhookDependencies,
): Promise<WebhookResponse> {
  const log = dependencies.log || (() => undefined);

  if ((request.method || "POST").toUpperCase() !== "POST") {
    return { status: 405, headers: { ...TEXT_HEADERS, Allow: "POST" }, body: "Method Not Allowed" };
  }

  const signature = getHeader(request.headers, "x-twilio-signature");
  if (!signature) {
    log({ status: "rejected", errorCode: "missing_signature" });
    return { status: 403, headers: TEXT_HEADERS, body: "Forbidden" };
  }

  const contentType = getHeader(request.headers, "content-type") || "";
  const parameters = parseFormBody(request.body);
  const publicUrl = reconstructPublicWebhookUrl(request);

  if (!parameters || !publicUrl) {
    log({ status: "rejected", errorCode: "invalid_request_shape" });
    return { status: 403, headers: TEXT_HEADERS, body: "Forbidden" };
  }

  let signatureIsValid = false;
  try {
    signatureIsValid = dependencies.validateSignature(
      dependencies.authToken,
      signature,
      publicUrl,
      parameters,
    );
  } catch {
    signatureIsValid = false;
  }

  if (!signatureIsValid) {
    log({ status: "rejected", errorCode: "invalid_signature" });
    return { status: 403, headers: TEXT_HEADERS, body: "Forbidden" };
  }

  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    log({ status: "rejected", errorCode: "unsupported_content_type" });
    return twimlResponse(GENERIC_ERROR_MESSAGE, 415);
  }

  const inbound = parseInboundMessage(parameters);
  if (!inbound) {
    log({ status: "rejected", errorCode: "malformed_payload" });
    return twimlResponse(GENERIC_ERROR_MESSAGE, 400);
  }

  const hasMedia =
    inbound.numMedia > 0 ||
    Boolean(inbound.mediaUrl0) ||
    Boolean(inbound.mediaContentType0);

  try {
    const claim = await dependencies.store.claim(inbound.messageSid, hasMedia);
    if (claim.kind === "duplicate") {
      log({ messageSid: inbound.messageSid, status: "duplicate" });
      if (claim.processingStatus === "recognized") {
        return twimlResponse(RECOGNIZED_COLLECTOR_MESSAGE);
      }
      if (claim.processingStatus === "unrecognized") {
        return twimlResponse(UNRECOGNIZED_COLLECTOR_MESSAGE);
      }
      return twimlResponse(GENERIC_ERROR_MESSAGE);
    }
  } catch {
    log({ messageSid: inbound.messageSid, status: "error", errorCode: "event_claim_failed" });
    return twimlResponse(GENERIC_ERROR_MESSAGE, 500);
  }

  const phoneE164 = normalizeWhatsAppPhone(inbound.from);
  if (!phoneE164) {
    try {
      await dependencies.store.markProcessed(inbound.messageSid, "unrecognized");
    } catch {
      await markErrorSafely(dependencies.store, inbound.messageSid, "event_update_failed");
      log({ messageSid: inbound.messageSid, status: "error", errorCode: "event_update_failed" });
      return twimlResponse(GENERIC_ERROR_MESSAGE, 500);
    }
    log({ messageSid: inbound.messageSid, status: "unrecognized", collectorMatched: false });
    return twimlResponse(UNRECOGNIZED_COLLECTOR_MESSAGE);
  }

  try {
    const matches = await dependencies.store.findCollectorsByPhone(phoneE164);
    if (matches.length === 0) {
      await dependencies.store.markProcessed(inbound.messageSid, "unrecognized");
      log({ messageSid: inbound.messageSid, status: "unrecognized", collectorMatched: false });
      return twimlResponse(UNRECOGNIZED_COLLECTOR_MESSAGE);
    }

    if (matches.length !== 1 || !matches[0]?.organizationId) {
      await markErrorSafely(dependencies.store, inbound.messageSid, "ambiguous_collector");
      log({
        messageSid: inbound.messageSid,
        status: "error",
        collectorMatched: false,
        errorCode: "ambiguous_collector",
      });
      return twimlResponse(GENERIC_ERROR_MESSAGE, 500);
    }

    const collector = matches[0];
    await dependencies.store.markProcessed(inbound.messageSid, "recognized", collector);
    log({ messageSid: inbound.messageSid, status: "recognized", collectorMatched: true });
    return twimlResponse(RECOGNIZED_COLLECTOR_MESSAGE);
  } catch {
    await markErrorSafely(dependencies.store, inbound.messageSid, "collector_lookup_failed");
    log({
      messageSid: inbound.messageSid,
      status: "error",
      collectorMatched: false,
      errorCode: "collector_lookup_failed",
    });
    return twimlResponse(GENERIC_ERROR_MESSAGE, 500);
  }
}
