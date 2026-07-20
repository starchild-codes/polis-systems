import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CollectorIdentity,
  WebhookEventClaim,
  WebhookProcessingStatus,
  WebhookResponseCode,
  WhatsAppWebhookStore,
} from "./whatsapp-webhook.js";

const DUPLICATE_KEY_CODE = "23505";

export interface WhatsAppServerConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioWhatsAppFrom: string;
  twilioTaskAssignmentContentSid?: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
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

  return {
    ...(required as Omit<WhatsAppServerConfig, "twilioTaskAssignmentContentSid">),
    twilioTaskAssignmentContentSid:
      environment.TWILIO_TASK_ASSIGNMENT_CONTENT_SID?.trim() || undefined,
  };
}

export function createWebhookSupabaseClient(config: WhatsAppServerConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export class SupabaseWhatsAppWebhookStore implements WhatsAppWebhookStore {
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
}
