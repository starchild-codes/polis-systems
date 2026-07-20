import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CollectorIdentity,
  WebhookEventClaim,
  WebhookProcessingStatus,
  WebhookResponseCode,
  WhatsAppWebhookStore,
} from "./whatsapp-webhook.js";
import type {
  ProofConversationState,
  ProofStep,
  WhatsAppProofContext,
  WhatsAppProofStore,
} from "./whatsapp-proof.js";
import { DEFAULT_WHATSAPP_MEDIA_MAX_BYTES } from "./whatsapp-proof-media.js";

const DUPLICATE_KEY_CODE = "23505";

export interface WhatsAppServerConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioWhatsAppFrom: string;
  twilioTaskAssignmentContentSid?: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  whatsappMediaMaxBytes: number;
}

export function loadWhatsAppServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WhatsAppServerConfig {
  const required = {
    twilioAccountSid: environment.TWILIO_ACCOUNT_SID,
    twilioAuthToken: environment.TWILIO_AUTH_TOKEN,
    twilioWhatsAppFrom: environment.TWILIO_WHATSAPP_FROM,
    supabaseUrl: environment.SUPABASE_URL,
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  };

  for (const [name, value] of Object.entries(required)) {
    if (!value) throw new Error(`missing_server_configuration:${name}`);
  }

  const configuredMaximum = Number.parseInt(environment.WHATSAPP_MEDIA_MAX_BYTES || "", 10);
  const whatsappMediaMaxBytes = Number.isSafeInteger(configuredMaximum) && configuredMaximum > 0
    ? Math.min(configuredMaximum, DEFAULT_WHATSAPP_MEDIA_MAX_BYTES)
    : DEFAULT_WHATSAPP_MEDIA_MAX_BYTES;

  return {
    ...(required as Omit<WhatsAppServerConfig, "twilioTaskAssignmentContentSid">),
    twilioTaskAssignmentContentSid:
      environment.TWILIO_TASK_ASSIGNMENT_CONTENT_SID?.trim() || undefined,
    whatsappMediaMaxBytes,
  };
}

export function createWebhookSupabaseClient(config: WhatsAppServerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export class SupabaseWhatsAppWebhookStore implements WhatsAppWebhookStore, WhatsAppProofStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async claim(messageSid: string, hasMedia: boolean): Promise<WebhookEventClaim> {
    const { error } = await this.supabase.from("whatsapp_webhook_events").insert({
      twilio_message_sid: messageSid,
      event_type: "inbound",
      processing_status: "received",
      has_media: hasMedia,
    });

    if (!error) return { kind: "claimed" };
    if (error.code !== DUPLICATE_KEY_CODE) throw new Error("event_claim_failed");

    const { data, error: lookupError } = await this.supabase
      .from("whatsapp_webhook_events")
      .select("processing_status, response_code")
      .eq("twilio_message_sid", messageSid)
      .single();

    if (lookupError || !data) throw new Error("duplicate_lookup_failed");
    return {
      kind: "duplicate",
      processingStatus: data.processing_status as WebhookProcessingStatus,
      responseCode: data.response_code as WebhookResponseCode | null,
    };
  }

  async findCollectorsByPhone(phoneE164: string): Promise<CollectorIdentity[]> {
    const { data, error } = await this.supabase
      .from("collectors")
      .select("id, organization_id")
      .eq("phone_e164", phoneE164)
      .limit(2);

    if (error) throw new Error("collector_lookup_failed");
    return (data || []).map((collector) => ({
      id: collector.id as string,
      organizationId: collector.organization_id as string,
    }));
  }

  async markProcessed(
    messageSid: string,
    status: "recognized" | "unrecognized",
    collector?: CollectorIdentity,
    responseCode?: WebhookResponseCode,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("whatsapp_webhook_events")
      .update({
        processing_status: status,
        collector_id: collector?.id || null,
        organization_id: collector?.organizationId || null,
        response_code: responseCode || null,
        error_code: null,
      })
      .eq("twilio_message_sid", messageSid);

    if (error) throw new Error("event_update_failed");
  }

  async markError(messageSid: string, errorCode: string): Promise<void> {
    const { error } = await this.supabase
      .from("whatsapp_webhook_events")
      .update({ processing_status: "error", error_code: errorCode.slice(0, 64) })
      .eq("twilio_message_sid", messageSid);

    if (error) throw new Error("event_error_update_failed");
  }

  async processTaskResponse(
    collector: CollectorIdentity,
    messageSid: string,
    body: string,
  ): Promise<WebhookResponseCode> {
    const { data, error } = await this.supabase.rpc("process_whatsapp_task_response", {
      p_collector_id: collector.id,
      p_organization_id: collector.organizationId,
      p_inbound_message_sid: messageSid,
      p_action: body.trim().toLowerCase(),
    });
    if (error) throw new Error("task_response_failed");
    const row = Array.isArray(data) ? data[0] : data;
    const result = row?.result as WebhookResponseCode | undefined;
    if (!result) throw new Error("task_response_failed");
    return result;
  }

  async findProofContext(collector: CollectorIdentity): Promise<WhatsAppProofContext | null> {
    const { data, error } = await this.supabase
      .from("whatsapp_sessions")
      .select([
        "id",
        "task_id",
        "organization_id",
        "collector_id",
        "conversation_state",
        "proof_step",
        "assignment_status",
        "expires_at",
        "before_photo_path",
        "after_photo_path",
      ].join(","))
      .eq("collector_id", collector.id)
      .eq("organization_id", collector.organizationId)
      .in("conversation_state", [
        "awaiting_before_photo",
        "awaiting_after_photo",
        "awaiting_details",
        "submitted",
      ])
      .maybeSingle();
    if (error) throw new Error("proof_context_lookup_failed");
    if (!data) return null;

    const row = data as unknown as {
      id: string;
      task_id: string;
      organization_id: string;
      collector_id: string;
      conversation_state: string;
      proof_step: string | null;
      assignment_status: string;
      expires_at: string | null;
      before_photo_path: string | null;
      after_photo_path: string | null;
    };
    if (!row.task_id) return null;

    const { data: task, error: taskError } = await this.supabase
      .from("tasks")
      .select("id")
      .eq("id", row.task_id)
      .eq("organization_id", collector.organizationId)
      .eq("collector_id", collector.id)
      .in("status", ["accepted", "in_progress"])
      .maybeSingle();
    if (taskError) throw new Error("proof_task_lookup_failed");

    return {
      sessionId: row.id,
      taskId: row.task_id,
      organizationId: row.organization_id,
      collectorId: row.collector_id,
      conversationState: row.conversation_state as ProofConversationState,
      proofStep: row.proof_step as ProofStep,
      assignmentStatus: row.assignment_status,
      expiresAt: row.expires_at,
      beforePhotoPath: row.before_photo_path,
      afterPhotoPath: row.after_photo_path,
      taskAvailable: Boolean(task),
    };
  }

  async recordProofPrompt(
    collector: CollectorIdentity,
    messageSid: string,
    responseCode: WebhookResponseCode,
  ): Promise<WebhookResponseCode> {
    const { data, error } = await this.supabase.rpc("record_whatsapp_proof_prompt", {
      p_collector_id: collector.id,
      p_organization_id: collector.organizationId,
      p_inbound_message_sid: messageSid,
      p_response_code: responseCode,
    });
    if (error || typeof data !== "string") throw new Error("proof_prompt_failed");
    return data as WebhookResponseCode;
  }

  async storeProofPhoto(input: {
    collector: CollectorIdentity;
    messageSid: string;
    kind: "before" | "after";
    objectPath: string;
  }): Promise<WebhookResponseCode> {
    const { data, error } = await this.supabase.rpc("store_whatsapp_proof_photo", {
      p_collector_id: input.collector.id,
      p_organization_id: input.collector.organizationId,
      p_inbound_message_sid: input.messageSid,
      p_photo_kind: input.kind,
      p_object_path: input.objectPath,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.result) throw new Error("proof_photo_transition_failed");
    return row.result as WebhookResponseCode;
  }

  async storeProofText(input: {
    collector: CollectorIdentity;
    messageSid: string;
    field: "waste_type" | "waste_quantity";
    value: string;
  }): Promise<WebhookResponseCode> {
    const { data, error } = await this.supabase.rpc("store_whatsapp_proof_text", {
      p_collector_id: input.collector.id,
      p_organization_id: input.collector.organizationId,
      p_inbound_message_sid: input.messageSid,
      p_field: input.field,
      p_value: input.value,
    });
    if (error || typeof data !== "string") throw new Error("proof_text_transition_failed");
    return data as WebhookResponseCode;
  }

  async submitProof(input: {
    collector: CollectorIdentity;
    messageSid: string;
    notes: string | null;
  }): Promise<WebhookResponseCode> {
    const { data, error } = await this.supabase.rpc("submit_whatsapp_proof", {
      p_collector_id: input.collector.id,
      p_organization_id: input.collector.organizationId,
      p_inbound_message_sid: input.messageSid,
      p_notes: input.notes,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.result) throw new Error("proof_submission_failed");
    return row.result as WebhookResponseCode;
  }

  async cancelProof(
    collector: CollectorIdentity,
    messageSid: string,
  ): Promise<{ responseCode: WebhookResponseCode; paths: string[] }> {
    const { data, error } = await this.supabase.rpc("cancel_whatsapp_proof_workflow", {
      p_collector_id: collector.id,
      p_organization_id: collector.organizationId,
      p_inbound_message_sid: messageSid,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.result) throw new Error("proof_cancel_failed");
    return {
      responseCode: row.result as WebhookResponseCode,
      paths: [row.before_photo_path, row.after_photo_path].filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      ),
    };
  }
}
