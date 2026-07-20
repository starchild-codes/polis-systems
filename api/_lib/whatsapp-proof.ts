import type { CollectorIdentity, WebhookResponseCode } from "./whatsapp-webhook.js";

export type ProofConversationState =
  | "awaiting_before_photo"
  | "awaiting_after_photo"
  | "awaiting_details"
  | "submitted";

export type ProofStep = "waste_type" | "waste_quantity" | "notes" | null;

export interface WhatsAppProofContext {
  sessionId: string;
  taskId: string;
  organizationId: string;
  collectorId: string;
  conversationState: ProofConversationState;
  proofStep: ProofStep;
  assignmentStatus: string;
  expiresAt: string | null;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
  taskAvailable: boolean;
}

export interface WhatsAppProofInbound {
  messageSid: string;
  body: string;
  numMedia: number;
  media: Array<{ url: string; contentType: string }>;
}

export interface StoredProofImage {
  path: string;
}

export interface WhatsAppProofMediaService {
  storeImage(input: {
    context: WhatsAppProofContext;
    kind: "before" | "after";
    mediaUrl: string;
    declaredContentType: string;
  }): Promise<StoredProofImage>;
  removeImages(paths: string[]): Promise<void>;
}

export interface WhatsAppProofStore {
  findProofContext(collector: CollectorIdentity): Promise<WhatsAppProofContext | null>;
  recordProofPrompt(
    collector: CollectorIdentity,
    messageSid: string,
    responseCode: WebhookResponseCode,
  ): Promise<WebhookResponseCode>;
  storeProofPhoto(input: {
    collector: CollectorIdentity;
    messageSid: string;
    kind: "before" | "after";
    objectPath: string;
  }): Promise<WebhookResponseCode>;
  storeProofText(input: {
    collector: CollectorIdentity;
    messageSid: string;
    field: "waste_type" | "waste_quantity";
    value: string;
  }): Promise<WebhookResponseCode>;
  submitProof(input: {
    collector: CollectorIdentity;
    messageSid: string;
    notes: string | null;
  }): Promise<WebhookResponseCode>;
  cancelProof(
    collector: CollectorIdentity,
    messageSid: string,
  ): Promise<{ responseCode: WebhookResponseCode; paths: string[] }>;
}

export type ProofWorkflowResult =
  | { kind: "processed"; responseCode: WebhookResponseCode }
  | { kind: "failed"; errorCode: string };

const ACTIVE_PROOF_STATES = new Set<ProofConversationState>([
  "awaiting_before_photo",
  "awaiting_after_photo",
  "awaiting_details",
]);

const COMMANDS = new Set(["accept", "decline", "help", "cancel", "skip"]);

export function isActiveProofContext(
  context: WhatsAppProofContext | null,
): context is WhatsAppProofContext {
  return Boolean(
    context
      && context.assignmentStatus === "accepted"
      && ACTIVE_PROOF_STATES.has(context.conversationState),
  );
}

export function expectedProofResponseCode(
  context: WhatsAppProofContext,
): WebhookResponseCode {
  if (context.conversationState === "awaiting_before_photo") return "expected_before_photo";
  if (context.conversationState === "awaiting_after_photo") return "expected_after_photo";
  if (context.proofStep === "waste_type") return "expected_waste_type";
  if (context.proofStep === "waste_quantity") return "expected_quantity";
  return "expected_notes";
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function isUsableText(value: string, maximumLength: number): boolean {
  return value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && /[\p{L}\p{N}]/u.test(value);
}

async function promptForCurrentStep(
  store: WhatsAppProofStore,
  collector: CollectorIdentity,
  messageSid: string,
  context: WhatsAppProofContext,
): Promise<ProofWorkflowResult> {
  try {
    return {
      kind: "processed",
      responseCode: await store.recordProofPrompt(
        collector,
        messageSid,
        expectedProofResponseCode(context),
      ),
    };
  } catch {
    return { kind: "failed", errorCode: "proof_prompt_failed" };
  }
}

export async function handleWhatsAppProofWorkflow(
  inbound: WhatsAppProofInbound,
  collector: CollectorIdentity,
  context: WhatsAppProofContext,
  store: WhatsAppProofStore,
  mediaService: WhatsAppProofMediaService,
): Promise<ProofWorkflowResult> {
  const body = cleanText(inbound.body);
  const command = body.toLowerCase();

  if (!context.taskAvailable) {
    try {
      return {
        kind: "processed",
        responseCode: await store.recordProofPrompt(
          collector,
          inbound.messageSid,
          "task_unavailable",
        ),
      };
    } catch {
      return { kind: "failed", errorCode: "proof_task_unavailable" };
    }
  }

  if (!context.expiresAt || new Date(context.expiresAt).getTime() <= Date.now()) {
    try {
      return {
        kind: "processed",
        responseCode: await store.recordProofPrompt(
          collector,
          inbound.messageSid,
          "proof_expired",
        ),
      };
    } catch {
      return { kind: "failed", errorCode: "proof_expiry_failed" };
    }
  }

  if (command === "help") {
    return promptForCurrentStep(store, collector, inbound.messageSid, context);
  }

  if (command === "cancel") {
    try {
      const cancelled = await store.cancelProof(collector, inbound.messageSid);
      await mediaService.removeImages(cancelled.paths);
      return { kind: "processed", responseCode: cancelled.responseCode };
    } catch {
      return { kind: "failed", errorCode: "proof_cancel_failed" };
    }
  }

  if (
    context.conversationState === "awaiting_before_photo"
    || context.conversationState === "awaiting_after_photo"
  ) {
    if (
      inbound.numMedia !== 1
      || inbound.media.length !== 1
      || !inbound.media[0]?.url
      || !inbound.media[0]?.contentType.toLowerCase().startsWith("image/")
    ) {
      return promptForCurrentStep(store, collector, inbound.messageSid, context);
    }

    const kind = context.conversationState === "awaiting_before_photo" ? "before" : "after";
    let stored: StoredProofImage;
    try {
      stored = await mediaService.storeImage({
        context,
        kind,
        mediaUrl: inbound.media[0].url,
        declaredContentType: inbound.media[0].contentType,
      });
    } catch (error) {
      const code = error instanceof Error && /^[a-z0-9_]{1,64}$/u.test(error.message)
        ? error.message
        : "proof_media_failed";
      return { kind: "failed", errorCode: code };
    }

    try {
      const responseCode = await store.storeProofPhoto({
        collector,
        messageSid: inbound.messageSid,
        kind,
        objectPath: stored.path,
      });
      return { kind: "processed", responseCode };
    } catch {
      try {
        await mediaService.removeImages([stored.path]);
      } catch {
        // The generated path remains organization scoped and private. Operators
        // can identify it from server logs without exposing media or phone data.
      }
      return { kind: "failed", errorCode: "proof_photo_transition_failed" };
    }
  }

  if (inbound.numMedia > 0 || inbound.media.length > 0) {
    return promptForCurrentStep(store, collector, inbound.messageSid, context);
  }

  if (context.proofStep === "waste_type") {
    if (!isUsableText(body, 120) || COMMANDS.has(command)) {
      return promptForCurrentStep(store, collector, inbound.messageSid, context);
    }
    try {
      return {
        kind: "processed",
        responseCode: await store.storeProofText({
          collector,
          messageSid: inbound.messageSid,
          field: "waste_type",
          value: body,
        }),
      };
    } catch {
      return { kind: "failed", errorCode: "proof_waste_type_failed" };
    }
  }

  if (context.proofStep === "waste_quantity") {
    if (!isUsableText(body, 120) || COMMANDS.has(command)) {
      return promptForCurrentStep(store, collector, inbound.messageSid, context);
    }
    try {
      return {
        kind: "processed",
        responseCode: await store.storeProofText({
          collector,
          messageSid: inbound.messageSid,
          field: "waste_quantity",
          value: body,
        }),
      };
    } catch {
      return { kind: "failed", errorCode: "proof_quantity_failed" };
    }
  }

  if (context.proofStep === "notes") {
    const notes = command === "skip" ? null : body;
    if (notes !== null && !isUsableText(notes, 1000)) {
      return promptForCurrentStep(store, collector, inbound.messageSid, context);
    }
    try {
      return {
        kind: "processed",
        responseCode: await store.submitProof({
          collector,
          messageSid: inbound.messageSid,
          notes,
        }),
      };
    } catch {
      return { kind: "failed", errorCode: "proof_submission_failed" };
    }
  }

  return { kind: "failed", errorCode: "invalid_proof_state" };
}
