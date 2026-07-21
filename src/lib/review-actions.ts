import { supabase } from "@/integrations/supabase/client";

export const REJECTION_REASON_MAX_LENGTH = 500;

export interface ReviewNotificationDelivery {
  notificationId: string;
  status: "pending" | "sending" | "sent" | "failed";
  retryable: boolean;
  message: string;
}

export interface ReviewDecisionOutcome {
  reviewSaved: true;
  decision?: "approved" | "rejected";
  notification: ReviewNotificationDelivery;
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Please log in again.");
  }
  return data.session.access_token;
}

async function postReviewAction(
  path: string,
  body: Record<string, unknown>,
): Promise<ReviewDecisionOutcome> {
  const token = await accessToken();
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as Partial<ReviewDecisionOutcome> & {
    error?: string;
  } | null;
  if (!response.ok || payload?.reviewSaved !== true || !payload.notification) {
    throw new Error(payload?.error || "The review action could not be completed.");
  }
  return payload as ReviewDecisionOutcome;
}

export function approveSubmission(submissionId: string): Promise<ReviewDecisionOutcome> {
  return postReviewAction("/api/review/decision", { submissionId, decision: "approved" });
}

export function rejectSubmission(
  submissionId: string,
  rejectionReason: string,
): Promise<ReviewDecisionOutcome> {
  const reason = rejectionReason.trim();
  if (!reason) throw new Error("A rejection reason is required.");
  if (reason.length > REJECTION_REASON_MAX_LENGTH) {
    throw new Error(`Rejection reason must be ${REJECTION_REASON_MAX_LENGTH} characters or fewer.`);
  }
  return postReviewAction("/api/review/decision", {
    submissionId,
    decision: "rejected",
    rejectionReason: reason,
  });
}

export function retryWhatsAppReviewNotification(
  notificationId: string,
): Promise<ReviewDecisionOutcome> {
  return postReviewAction("/api/review/retry-whatsapp-notification", { notificationId });
}
