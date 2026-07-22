import type { SupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";
import type {
  AssignmentCollector,
  AssignmentMembership,
  AssignmentProfile,
  AssignmentTask,
  AuthenticatedUser,
  OutboundAssignmentMessage,
  PrepareAssignmentResult,
  TaskAssignmentSender,
  TaskAssignmentStore,
} from "./task-assignment.js";
import { AssignmentDeliveryError } from "./task-assignment.js";
import type { WhatsAppServerConfig } from "./supabase-webhook-store.js";

interface TaskRow {
  id: string;
  organization_id: string;
  collector_id: string | null;
  zone_id: string | null;
  title: string;
  description: string | null;
  address: string | null;
  due_at: string | null;
  priority: string;
  status: string;
}

export class SupabaseTaskAssignmentStore implements TaskAssignmentStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async authenticate(accessToken: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { id: data.user.id };
  }

  async getProfile(userId: string): Promise<AssignmentProfile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("active_organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error("profile_lookup_failed");
    return data
      ? { activeOrganizationId: data.active_organization_id as string | null }
      : null;
  }

  async getTask(taskId: string): Promise<AssignmentTask | null> {
    const { data, error } = await this.supabase
      .from("tasks")
      .select(
        "id, organization_id, collector_id, zone_id, title, description, address, due_at, priority, status",
      )
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw new Error("task_lookup_failed");
    if (!data) return null;

    const task = data as TaskRow;
    let zone: string | null = null;
    if (task.zone_id) {
      const { data: zoneRow, error: zoneError } = await this.supabase
        .from("zones")
        .select("name, organization_id")
        .eq("id", task.zone_id)
        .eq("organization_id", task.organization_id)
        .maybeSingle();
      if (zoneError) throw new Error("zone_lookup_failed");
      zone = (zoneRow?.name as string | undefined) || null;
    }

    return {
      id: task.id,
      organizationId: task.organization_id,
      collectorId: task.collector_id,
      title: task.title,
      description: task.description,
      location: task.address,
      zone,
      dueAt: task.due_at,
      priority: task.priority,
      status: task.status,
    };
  }

  async getMembership(
    userId: string,
    organizationId: string,
  ): Promise<AssignmentMembership | null> {
    const { data, error } = await this.supabase
      .from("organization_members")
      .select("organization_id, role, is_active")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("membership_lookup_failed");
    return data
      ? {
          organizationId: data.organization_id as string,
          role: data.role as AssignmentMembership["role"],
          isActive: Boolean(data.is_active),
        }
      : null;
  }

  async getCollector(collectorId: string): Promise<AssignmentCollector | null> {
    const { data, error } = await this.supabase
      .from("collectors")
      .select("id, organization_id, phone_e164")
      .eq("id", collectorId)
      .maybeSingle();
    if (error) throw new Error("collector_lookup_failed");
    return data
      ? {
          id: data.id as string,
          organizationId: data.organization_id as string,
          phoneE164: data.phone_e164 as string | null,
        }
      : null;
  }

  async getLastInboundAt(collectorId: string, organizationId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("whatsapp_webhook_events")
      .select("created_at")
      .eq("collector_id", collectorId)
      .eq("organization_id", organizationId)
      .eq("event_type", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("collector_interaction_lookup_failed");
    return (data?.created_at as string | undefined) || null;
  }

  async prepareAssignment(input: {
    taskId: string;
    collectorId: string;
    organizationId: string;
    actorId: string;
    expiresAt: string;
  }): Promise<PrepareAssignmentResult> {
    const { data, error } = await this.supabase.rpc("prepare_whatsapp_task_assignment", {
      p_task_id: input.taskId,
      p_collector_id: input.collectorId,
      p_organization_id: input.organizationId,
      p_actor_id: input.actorId,
      p_expires_at: input.expiresAt,
    });
    if (error) throw new Error("assignment_prepare_failed");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.result) throw new Error("assignment_prepare_failed");
    if (row.result === "prepared") {
      return { result: "prepared", sessionId: row.session_id as string };
    }
    if (row.result === "already_sent") {
      return {
        result: "already_sent",
        sessionId: row.session_id as string,
        outboundMessageSid: row.outbound_message_sid as string,
      };
    }
    if (row.result === "in_progress") {
      return { result: "in_progress", sessionId: row.session_id as string };
    }
    return { result: row.result as Exclude<PrepareAssignmentResult["result"], "prepared" | "already_sent" | "in_progress">, sessionId: null };
  }

  async completeAssignment(input: {
    sessionId: string;
    outboundMessageSid: string;
    actorId: string;
  }): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("complete_whatsapp_task_assignment", {
      p_session_id: input.sessionId,
      p_outbound_message_sid: input.outboundMessageSid,
      p_actor_id: input.actorId,
    });
    if (error) throw new Error("assignment_finalize_failed");
    return data === true;
  }

  async failAssignment(sessionId: string): Promise<void> {
    const { error } = await this.supabase.rpc("fail_whatsapp_task_assignment", {
      p_session_id: sessionId,
    });
    if (error) throw new Error("assignment_cleanup_failed");
  }
}

export class TwilioTaskAssignmentSender implements TaskAssignmentSender {
  private readonly client: TwilioTaskAssignmentClient;

  constructor(
    private readonly config: WhatsAppServerConfig,
    client?: TwilioTaskAssignmentClient,
  ) {
    this.client = client
      || (twilio(config.twilioAccountSid, config.twilioAuthToken) as unknown as TwilioTaskAssignmentClient);
  }

  async send(message: OutboundAssignmentMessage): Promise<{ messageSid: string }> {
    const base = {
      from: this.config.twilioWhatsAppFrom,
      to: message.to,
    };
    try {
      if (message.deliveryMode === "template") {
        if (!this.config.twilioTaskAssignmentContentSid) {
          throw new AssignmentDeliveryError("assignment_template_required");
        }
        const sent = await this.client.messages.create({
          ...base,
          contentSid: this.config.twilioTaskAssignmentContentSid,
          contentVariables: JSON.stringify({
            1: message.contentVariables.task,
            2: message.contentVariables.zone,
            3: message.contentVariables.location,
            4: message.contentVariables.due,
            5: message.contentVariables.priority,
          }),
        });
        return { messageSid: sent.sid };
      }

      const sent = await this.client.messages.create({ ...base, body: message.body });
      return { messageSid: sent.sid };
    } catch (error) {
      if (error instanceof AssignmentDeliveryError) throw error;
      const twilioCode = Number((error as { code?: unknown } | null)?.code);
      if (twilioCode === 63016) {
        throw new AssignmentDeliveryError("assignment_template_required");
      }
      if ([63027, 63028, 63040, 63041, 63042].includes(twilioCode)) {
        throw new AssignmentDeliveryError("assignment_template_invalid");
      }
      if (twilioCode === 63007) {
        throw new AssignmentDeliveryError("assignment_sender_unavailable");
      }
      throw new AssignmentDeliveryError("assignment_send_failed");
    }
  }
}

export interface TwilioTaskAssignmentClient {
  messages: {
    create(input: Record<string, unknown>): Promise<{ sid: string }>;
  };
}
