import { normalizeWhatsAppPhone } from "./phone.js";
import {
  AFTER_PHOTO_RECEIVED_MESSAGE,
  AMBIGUOUS_ASSIGNMENT_MESSAGE,
  BEFORE_PHOTO_RECEIVED_MESSAGE,
  createMessagingTwiml,
  EXPECTED_AFTER_PHOTO_MESSAGE,
  EXPECTED_BEFORE_PHOTO_MESSAGE,
  EXPECTED_NOTES_MESSAGE,
  EXPECTED_QUANTITY_MESSAGE,
  EXPECTED_WASTE_TYPE_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  INVALID_ASSIGNMENT_COMMAND_MESSAGE,
  MEDIA_RETRY_MESSAGE,
  NO_ACTIVE_ASSIGNMENT_MESSAGE,
  PROOF_CANCELLED_MESSAGE,
  PROOF_EXPIRED_MESSAGE,
  PROOF_RETRY_MESSAGE,
  PROOF_SUBMITTED_MESSAGE,
  QUANTITY_RECEIVED_MESSAGE,
  RECOGNIZED_COLLECTOR_MESSAGE,
  TASK_UNAVAILABLE_MESSAGE,
  TASK_ACCEPTED_MESSAGE,
  TASK_DECLINED_MESSAGE,
  UNRECOGNIZED_COLLECTOR_MESSAGE,
  WASTE_TYPE_RECEIVED_MESSAGE,
} from "./twiml.js";
import {
  handleWhatsAppProofWorkflow,
  isActiveProofContext,
  type WhatsAppProofMediaService,
  type WhatsAppProofStore,
} from "./whatsapp-proof.js";

export type WebhookProcessingStatus =
  | "received"
  | "recognized"
  | "unrecognized"
  | "error";

export type WebhookResponseCode =
  | "recognized_collector"
  | "unrecognized_collector"
  | "accepted"
  | "declined"
  | "no_active_session"
  | "ambiguous_session"
  | "invalid_command"
  | "before_photo_received"
  | "after_photo_received"
  | "waste_type_received"
  | "quantity_received"
  | "proof_submitted"
  | "expected_before_photo"
  | "expected_after_photo"
  | "expected_waste_type"
  | "expected_quantity"
  | "expected_notes"
  | "proof_expired"
  | "task_unavailable"
  | "proof_cancelled"
  | "generic_error";

export type WebhookEventClaim =
  | { kind: "claimed" }
  | {
      kind: "duplicate";
      processingStatus: WebhookProcessingStatus;
      responseCode?: WebhookResponseCode | null;
    };

export interface CollectorIdentity {
  id: string;
  organizationId: string;
}

export interface WhatsAppWebhookStore extends Partial<WhatsAppProofStore> {
  claim(messageSid: string, hasMedia: boolean): Promise<WebhookEventClaim>;
  findCollectorsByPhone(phoneE164: string): Promise<CollectorIdentity[]>;
  markProcessed(
    messageSid: string,
    status: "recognized" | "unrecognized",
    collector?: CollectorIdentity,
    responseCode?: WebhookResponseCode,
  ): Promise<void>;
  markError(messageSid: string, errorCode: string): Promise<void>;
  processTaskResponse(
    collector: CollectorIdentity,
    messageSid: string,
    body: string,
  ): Promise<WebhookResponseCode>;
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
  proofMediaService?: WhatsAppProofMediaService;
  log?: (entry: SafeWebhookLog) => void;
}

interface ParsedInboundMessage {
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: number;
  media: Array<{ url: string; contentType: string }>;
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
  if (!Number.isSafeInteger(numMedia) || numMedia < 0 || numMedia > 10) return null;

  const media: Array<{ url: string; contentType: string }> = [];
  for (let index = 0; index < numMedia; index += 1) {
    const url = parameters[`MediaUrl${index}`]?.trim();
    const contentType = parameters[`MediaContentType${index}`]?.trim();
    if (url && contentType) media.push({ url, contentType });
  }

  return {
    messageSid,
    from,
    to: parameters.To || "",
    body: parameters.Body || "",
    numMedia,
    media,
  };
}

function twimlResponse(message: string, status = 200): WebhookResponse {
  return { status, headers: XML_HEADERS, body: createMessagingTwiml(message) };
}

export function responseMessage(code: WebhookResponseCode | null | undefined): string {
  switch (code) {
    case "accepted":
      return TASK_ACCEPTED_MESSAGE;
    case "declined":
      return TASK_DECLINED_MESSAGE;
    case "no_active_session":
      return NO_ACTIVE_ASSIGNMENT_MESSAGE;
    case "ambiguous_session":
      return AMBIGUOUS_ASSIGNMENT_MESSAGE;
    case "invalid_command":
      return INVALID_ASSIGNMENT_COMMAND_MESSAGE;
    case "before_photo_received":
      return BEFORE_PHOTO_RECEIVED_MESSAGE;
    case "after_photo_received":
      return AFTER_PHOTO_RECEIVED_MESSAGE;
    case "waste_type_received":
      return WASTE_TYPE_RECEIVED_MESSAGE;
    case "quantity_received":
      return QUANTITY_RECEIVED_MESSAGE;
    case "proof_submitted":
      return PROOF_SUBMITTED_MESSAGE;
    case "expected_before_photo":
      return EXPECTED_BEFORE_PHOTO_MESSAGE;
    case "expected_after_photo":
      return EXPECTED_AFTER_PHOTO_MESSAGE;
    case "expected_waste_type":
      return EXPECTED_WASTE_TYPE_MESSAGE;
    case "expected_quantity":
      return EXPECTED_QUANTITY_MESSAGE;
    case "expected_notes":
      return EXPECTED_NOTES_MESSAGE;
    case "proof_expired":
      return PROOF_EXPIRED_MESSAGE;
    case "task_unavailable":
      return TASK_UNAVAILABLE_MESSAGE;
    case "proof_cancelled":
      return PROOF_CANCELLED_MESSAGE;
    case "unrecognized_collector":
      return UNRECOGNIZED_COLLECTOR_MESSAGE;
    case "recognized_collector":
      return RECOGNIZED_COLLECTOR_MESSAGE;
    default:
      return GENERIC_ERROR_MESSAGE;
  }
}

function isCompleteProofStore(
  store: WhatsAppWebhookStore,
): store is WhatsAppWebhookStore & WhatsAppProofStore {
  return typeof store.findProofContext === "function"
    && typeof store.recordProofPrompt === "function"
    && typeof store.storeProofPhoto === "function"
    && typeof store.storeProofText === "function"
    && typeof store.submitProof === "function"
    && typeof store.cancelProof === "function";
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
    inbound.media.length > 0 ||
    Boolean(parameters.MediaUrl0) ||
    Boolean(parameters.MediaContentType0);

  try {
    const claim = await dependencies.store.claim(inbound.messageSid, hasMedia);
    if (claim.kind === "duplicate") {
      log({ messageSid: inbound.messageSid, status: "duplicate" });
      if (claim.responseCode) {
        return twimlResponse(responseMessage(claim.responseCode));
      }
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
      await dependencies.store.markProcessed(
        inbound.messageSid,
        "unrecognized",
        undefined,
        "unrecognized_collector",
      );
    } catch {
      await markErrorSafely(dependencies.store, inbound.messageSid, "event_update_failed");
      log({ messageSid: inbound.messageSid, status: "error", errorCode: "event_update_failed" });
      return twimlResponse(GENERIC_ERROR_MESSAGE, 500);
    }
    log({ messageSid: inbound.messageSid, status: "unrecognized", collectorMatched: false });
    return twimlResponse(UNRECOGNIZED_COLLECTOR_MESSAGE);
  }

  let matches: CollectorIdentity[];
  try {
    matches = await dependencies.store.findCollectorsByPhone(phoneE164);
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

  try {
    if (matches.length === 0) {
      await dependencies.store.markProcessed(
        inbound.messageSid,
        "unrecognized",
        undefined,
        "unrecognized_collector",
      );
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

    if (isCompleteProofStore(dependencies.store) && dependencies.proofMediaService) {
      let proofContext;
      try {
        proofContext = await dependencies.store.findProofContext(collector);
      } catch {
        await markErrorSafely(dependencies.store, inbound.messageSid, "proof_context_lookup_failed");
        log({
          messageSid: inbound.messageSid,
          status: "error",
          collectorMatched: true,
          errorCode: "proof_context_lookup_failed",
        });
        return twimlResponse(PROOF_RETRY_MESSAGE, 500);
      }

      if (isActiveProofContext(proofContext)) {
        const proofResult = await handleWhatsAppProofWorkflow(
          {
            messageSid: inbound.messageSid,
            body: inbound.body,
            numMedia: inbound.numMedia,
            media: inbound.media,
          },
          collector,
          proofContext,
          dependencies.store,
          dependencies.proofMediaService,
        );

        if (proofResult.kind === "failed") {
          await markErrorSafely(dependencies.store, inbound.messageSid, proofResult.errorCode);
          log({
            messageSid: inbound.messageSid,
            status: "error",
            collectorMatched: true,
            errorCode: proofResult.errorCode,
          });
          const mediaFailure = proofResult.errorCode.includes("media")
            || proofResult.errorCode.includes("photo")
            || proofResult.errorCode.includes("storage");
          return twimlResponse(mediaFailure ? MEDIA_RETRY_MESSAGE : PROOF_RETRY_MESSAGE);
        }

        log({
          messageSid: inbound.messageSid,
          status: proofResult.responseCode,
          collectorMatched: true,
        });
        return twimlResponse(responseMessage(proofResult.responseCode));
      }
    }

    const responseCode = await dependencies.store.processTaskResponse(
      collector,
      inbound.messageSid,
      inbound.body,
    );
    if (responseCode === "ambiguous_session") {
      log({
        messageSid: inbound.messageSid,
        status: "error",
        collectorMatched: true,
        errorCode: "ambiguous_assignment_session",
      });
    } else {
      log({ messageSid: inbound.messageSid, status: responseCode, collectorMatched: true });
    }
    return twimlResponse(responseMessage(responseCode));
  } catch {
    await markErrorSafely(dependencies.store, inbound.messageSid, "task_response_failed");
    log({
      messageSid: inbound.messageSid,
      status: "error",
      collectorMatched: true,
      errorCode: "task_response_failed",
    });
    return twimlResponse(GENERIC_ERROR_MESSAGE, 500);
  }
}
