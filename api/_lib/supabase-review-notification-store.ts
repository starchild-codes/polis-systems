import type { SupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";
import type {
  ReviewNotificationClaim,
  ReviewNotificationMembership,
  ReviewNotificationMessage,
  ReviewNotificationSender,
  ReviewNotificationStore,
  ReviewSubmissionRecord,
  ReviewTransactionResult,
} from "./review-notification.js";
import type { WhatsAppServerConfig } from "./supabase-webhook-store.js";

const KNOWN_DATABASE_ERRORS = [
  "invalid_review_decision",
  "rejection_reason_required",
  "rejection_reason_too_long",
  "review_authorization_failed",
  "review_submission_not_found",
  "review_task_not_found",
  "review_decision_already_finalized",
  "review_outbox_missing",
  "review_task_not_submitted",
  "notification_authorization_failed",
  "notification_not_found",
  "notification_not_claimable",
  "notification_attempt_limit",
  "notification_context_unavailable",
  "notification_not_sending",
] as const;

function databaseError(error: { message?: string } | null, fallback: string): Error {
  const known = KNOWN_DATABASE_ERRORS.find((code) => error?.message?.includes(code));
  return new Error(known || fallback);
}

export class SupabaseReviewNotificationStore implements ReviewNotificationStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async authenticate(accessToken: string) {
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { id: data.user.id };
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("active_organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error("profile_lookup_failed");
    return data ? { activeOrganizationId: data.active_organization_id as string | null } : null;
  }

  async getMembership(userId: string, organizationId: string) {
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
          role: data.role as ReviewNotificationMembership["role"],
          isActive: Boolean(data.is_active),
        }
      : null;
  }

  async getSubmission(submissionId: string): Promise<ReviewSubmissionRecord | null> {
    const { data, error } = await this.supabase
      .from("submissions")
      .select("id, organization_id, review_status")
      .eq("id", submissionId)
      .maybeSingle();
    if (error) throw new Error("submission_lookup_failed");
    return data
      ? {
          id: data.id as string,
          organizationId: data.organization_id as string,
          reviewStatus: data.review_status as ReviewSubmissionRecord["reviewStatus"],
        }
      : null;
  }

  async reviewSubmission(input: {
    submissionId: string;
    organizationId: string;
    reviewerId: string;
    decision: "approved" | "rejected";
    rejectionReason: string | null;
  }): Promise<ReviewTransactionResult> {
    const { data, error } = await this.supabase.rpc("review_submission_with_whatsapp_outbox", {
      p_submission_id: input.submissionId,
      p_organization_id: input.organizationId,
      p_reviewer_id: input.reviewerId,
      p_decision: input.decision,
      p_rejection_reason: input.rejectionReason,
    });
    if (error) throw databaseError(error, "review_transaction_failed");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.result || !row.notification_id || !row.notification_status) {
      throw new Error("review_transaction_failed");
    }
    return {
      result: row.result as ReviewTransactionResult["result"],
      notificationId: row.notification_id as string,
      notificationStatus: row.notification_status as ReviewTransactionResult["notificationStatus"],
    };
  }

  async claimNotification(input: {
    notificationId: string;
    organizationId: string;
    actorId: string;
  }): Promise<ReviewNotificationClaim> {
    const { data, error } = await this.supabase.rpc("claim_whatsapp_review_notification", {
      p_notification_id: input.notificationId,
      p_organization_id: input.organizationId,
      p_actor_id: input.actorId,
    });
    if (error) throw databaseError(error, "notification_claim_failed");
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.result || !row.notification_id || !row.notification_type) {
      throw new Error("notification_claim_failed");
    }
    if (row.result === "already_sent") {
      return {
        result: "already_sent",
        notificationId: row.notification_id as string,
        notificationType: row.notification_type as ReviewNotificationClaim["notificationType"],
        attemptCount: Number(row.attempt_count) || 0,
      };
    }
    if (row.result !== "claimed" || !row.task_title) throw new Error("notification_claim_failed");
    return {
      result: "claimed",
      notificationId: row.notification_id as string,
      notificationType: row.notification_type as "submission_approved" | "submission_rejected",
      phoneE164: row.phone_e164 as string | null,
      taskTitle: row.task_title as string,
      rejectionReason: row.rejection_reason as string | null,
      lastInteractionAt: row.last_interaction_at as string | null,
      attemptCount: Number(row.attempt_count) || 0,
    };
  }

  async completeNotification(notificationId: string, messageSid: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("complete_whatsapp_review_notification", {
      p_notification_id: notificationId,
      p_twilio_message_sid: messageSid,
    });
    if (error) throw databaseError(error, "notification_finalize_failed");
    return data === true;
  }

  async failNotification(notificationId: string, errorCode: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("fail_whatsapp_review_notification", {
      p_notification_id: notificationId,
      p_error_code: errorCode,
    });
    if (error) throw databaseError(error, "notification_failure_record_failed");
    return data === true;
  }
}

export class TwilioReviewNotificationSender implements ReviewNotificationSender {
  private readonly client;

  constructor(private readonly config: WhatsAppServerConfig) {
    this.client = twilio(config.twilioAccountSid, config.twilioAuthToken);
  }

  async send(message: ReviewNotificationMessage): Promise<{ messageSid: string }> {
    const base = { from: this.config.twilioWhatsAppFrom, to: message.to };
    const sent = message.contentSid
      ? await this.client.messages.create({
          ...base,
          contentSid: message.contentSid,
          contentVariables: JSON.stringify(message.contentVariables),
        })
      : await this.client.messages.create({ ...base, body: message.body });
    return { messageSid: sent.sid };
  }
}
