import { normalizeWhatsAppPhone } from "./phone.js";

export const REJECTION_REASON_MAX_LENGTH = 500;
export const REVIEW_NOTIFICATION_MAX_ATTEMPTS = 5;
const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type ReviewDecision = "approved" | "rejected";
export type ReviewNotificationType = "submission_approved" | "submission_rejected";
export type ReviewNotificationStatus = "pending" | "sending" | "sent" | "failed";

export interface ReviewNotificationUser { id: string }
export interface ReviewNotificationProfile { activeOrganizationId: string | null }
export interface ReviewNotificationMembership {
  organizationId: string;
  role: "admin" | "operator";
  isActive: boolean;
}
export interface ReviewSubmissionRecord {
  id: string;
  organizationId: string;
  reviewStatus: "pending" | "approved" | "rejected";
}
export interface ReviewTransactionResult {
  result: "reviewed" | "already_reviewed";
  notificationId: string;
  notificationStatus: ReviewNotificationStatus;
}
export type ReviewNotificationClaim =
  | {
      result: "claimed";
      notificationId: string;
      notificationType: ReviewNotificationType;
      phoneE164: string | null;
      taskTitle: string;
      rejectionReason: string | null;
      lastInteractionAt: string | null;
      attemptCount: number;
    }
  | {
      result: "already_sent";
      notificationId: string;
      notificationType: ReviewNotificationType;
      attemptCount: number;
    };

export interface ReviewNotificationStore {
  authenticate(accessToken: string): Promise<ReviewNotificationUser | null>;
  getProfile(userId: string): Promise<ReviewNotificationProfile | null>;
  getMembership(userId: string, organizationId: string): Promise<ReviewNotificationMembership | null>;
  getSubmission(submissionId: string): Promise<ReviewSubmissionRecord | null>;
  reviewSubmission(input: {
    submissionId: string;
    organizationId: string;
    reviewerId: string;
    decision: ReviewDecision;
    rejectionReason: string | null;
  }): Promise<ReviewTransactionResult>;
  claimNotification(input: {
    notificationId: string;
    organizationId: string;
    actorId: string;
  }): Promise<ReviewNotificationClaim>;
  completeNotification(notificationId: string, messageSid: string): Promise<boolean>;
  failNotification(notificationId: string, errorCode: string): Promise<boolean>;
}

export interface ReviewNotificationMessage {
  to: string;
  body: string;
  contentSid?: string;
  contentVariables: Record<string, string>;
}

export interface ReviewNotificationSender {
  send(message: ReviewNotificationMessage): Promise<{ messageSid: string }>;
}

export interface ReviewNotificationRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface ReviewNotificationResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface SafeReviewNotificationLog {
  status: "rejected" | "reviewed" | "sent" | "failed" | "error";
  errorCode?: string;
}

export interface ReviewNotificationDependencies {
  store: ReviewNotificationStore;
  sender: ReviewNotificationSender;
  approvedContentSid?: string;
  rejectedContentSid?: string;
  now?: () => Date;
  log?: (entry: SafeReviewNotificationLog) => void;
}

interface DeliveryResult {
  notificationId: string;
  status: ReviewNotificationStatus;
  retryable: boolean;
  message: string;
  alreadySent?: boolean;
}

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
};

function jsonResponse(status: number, payload: Record<string, unknown>): ReviewNotificationResponse {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || null;
}

function getBearerToken(headers: ReviewNotificationRequest["headers"]): string | null {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === "authorization");
  const value = key ? firstHeaderValue(headers[key]) : null;
  return value?.match(/^Bearer\s+([^\s]+)$/iu)?.[1] || null;
}

function recordBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
}

function parseDecisionBody(body: unknown): {
  submissionId: string;
  decision: ReviewDecision;
  rejectionReason: string | null;
} | null {
  const value = recordBody(body);
  const submissionId = typeof value?.submissionId === "string" ? value.submissionId.trim() : "";
  const decision = value?.decision;
  if (!UUID_PATTERN.test(submissionId) || !["approved", "rejected"].includes(String(decision))) {
    return null;
  }
  const rejectionReason = typeof value?.rejectionReason === "string"
    ? value.rejectionReason.trim()
    : null;
  return { submissionId, decision: decision as ReviewDecision, rejectionReason };
}

function parseNotificationId(body: unknown): string | null {
  const value = recordBody(body);
  const notificationId = typeof value?.notificationId === "string" ? value.notificationId.trim() : "";
  return UUID_PATTERN.test(notificationId) ? notificationId : null;
}

function isCustomerServiceWindowOpen(lastInteractionAt: string | null, now: Date): boolean {
  if (!lastInteractionAt) return false;
  const interaction = new Date(lastInteractionAt).getTime();
  if (!Number.isFinite(interaction)) return false;
  const age = now.getTime() - interaction;
  return age >= -5 * 60 * 1000 && age <= CUSTOMER_SERVICE_WINDOW_MS;
}

export function createReviewOutcomeMessage(
  type: ReviewNotificationType,
  taskTitle: string,
  rejectionReason: string | null,
): { body: string; contentVariables: Record<string, string> } {
  const title = taskTitle.trim();
  if (type === "submission_approved") {
    return {
      body: [
        "Polis Systems Update",
        "",
        `Your proof for "${title}" has been approved.`,
        "",
        "Thank you for completing the task.",
      ].join("\n"),
      contentVariables: { 1: title },
    };
  }
  const reason = rejectionReason?.trim() || "No reason was provided.";
  return {
    body: [
      "Polis Systems Update",
      "",
      `Your proof for "${title}" was not approved.`,
      "",
      `Reason: ${reason}`,
      "",
      "Please contact your organization administrator for next steps.",
    ].join("\n"),
    contentVariables: { 1: title, 2: reason },
  };
}

function deliveryFailureMessage(errorCode: string): string {
  if (errorCode === "template_required") {
    return "Review saved, but WhatsApp requires an approved message template before this update can be sent.";
  }
  if (["missing_collector_phone", "invalid_collector_phone"].includes(errorCode)) {
    return "Review saved, but the collector does not have a valid WhatsApp phone number.";
  }
  if (errorCode === "notification_attempt_limit") {
    return "Review saved, but the WhatsApp retry limit has been reached.";
  }
  return "Review saved, but WhatsApp delivery failed.";
}

async function safelyMarkFailed(
  store: ReviewNotificationStore,
  notificationId: string,
  errorCode: string,
): Promise<void> {
  try {
    await store.failNotification(notificationId, errorCode);
  } catch {
    // The review decision remains committed. Avoid masking the delivery result.
  }
}

export async function deliverReviewNotification(
  notificationId: string,
  organizationId: string,
  actorId: string,
  dependencies: ReviewNotificationDependencies,
): Promise<DeliveryResult> {
  let claim: ReviewNotificationClaim;
  try {
    claim = await dependencies.store.claimNotification({ notificationId, organizationId, actorId });
  } catch (error) {
    const code = error instanceof Error ? error.message : "notification_claim_failed";
    if (code === "notification_attempt_limit") {
      return {
        notificationId,
        status: "failed",
        retryable: false,
        message: deliveryFailureMessage(code),
      };
    }
    if (code === "notification_not_claimable") {
      return {
        notificationId,
        status: "sending",
        retryable: false,
        message: "Review saved. WhatsApp delivery is already being processed.",
      };
    }
    throw error;
  }

  if (claim.result === "already_sent") {
    return {
      notificationId: claim.notificationId,
      status: "sent",
      retryable: false,
      message: "Review saved and WhatsApp sent.",
      alreadySent: true,
    };
  }

  const phone = normalizeWhatsAppPhone(claim.phoneE164);
  if (!claim.phoneE164) {
    await safelyMarkFailed(dependencies.store, claim.notificationId, "missing_collector_phone");
    return {
      notificationId: claim.notificationId,
      status: "failed",
      retryable: claim.attemptCount < REVIEW_NOTIFICATION_MAX_ATTEMPTS,
      message: deliveryFailureMessage("missing_collector_phone"),
    };
  }
  if (!phone) {
    await safelyMarkFailed(dependencies.store, claim.notificationId, "invalid_collector_phone");
    return {
      notificationId: claim.notificationId,
      status: "failed",
      retryable: claim.attemptCount < REVIEW_NOTIFICATION_MAX_ATTEMPTS,
      message: deliveryFailureMessage("invalid_collector_phone"),
    };
  }

  const contentSid = claim.notificationType === "submission_approved"
    ? dependencies.approvedContentSid
    : dependencies.rejectedContentSid;
  const now = dependencies.now?.() || new Date();
  if (!contentSid && !isCustomerServiceWindowOpen(claim.lastInteractionAt, now)) {
    await safelyMarkFailed(dependencies.store, claim.notificationId, "template_required");
    return {
      notificationId: claim.notificationId,
      status: "failed",
      retryable: claim.attemptCount < REVIEW_NOTIFICATION_MAX_ATTEMPTS,
      message: deliveryFailureMessage("template_required"),
    };
  }

  if (claim.notificationType === "submission_rejected" && !claim.rejectionReason?.trim()) {
    await safelyMarkFailed(dependencies.store, claim.notificationId, "notification_context_invalid");
    return {
      notificationId: claim.notificationId,
      status: "failed",
      retryable: false,
      message: deliveryFailureMessage("notification_context_invalid"),
    };
  }

  const message = createReviewOutcomeMessage(
    claim.notificationType,
    claim.taskTitle,
    claim.rejectionReason,
  );
  let sent: { messageSid: string };
  try {
    sent = await dependencies.sender.send({
      to: `whatsapp:${phone}`,
      body: message.body,
      ...(contentSid ? { contentSid } : {}),
      contentVariables: message.contentVariables,
    });
    if (!sent.messageSid) throw new Error("missing_twilio_message_sid");
  } catch {
    await safelyMarkFailed(dependencies.store, claim.notificationId, "twilio_send_failed");
    dependencies.log?.({ status: "failed", errorCode: "twilio_send_failed" });
    return {
      notificationId: claim.notificationId,
      status: "failed",
      retryable: claim.attemptCount < REVIEW_NOTIFICATION_MAX_ATTEMPTS,
      message: deliveryFailureMessage("twilio_send_failed"),
    };
  }

  try {
    const completed = await dependencies.store.completeNotification(claim.notificationId, sent.messageSid);
    if (!completed) throw new Error("notification_finalize_failed");
  } catch {
    dependencies.log?.({ status: "error", errorCode: "notification_finalize_failed" });
    return {
      notificationId: claim.notificationId,
      status: "sending",
      retryable: false,
      message: "Review saved and WhatsApp accepted the message, but delivery confirmation is still pending.",
    };
  }

  dependencies.log?.({ status: "sent" });
  return {
    notificationId: claim.notificationId,
    status: "sent",
    retryable: false,
    message: "Review saved and WhatsApp sent.",
  };
}

async function authenticateReviewer(
  request: ReviewNotificationRequest,
  store: ReviewNotificationStore,
): Promise<
  | { user: ReviewNotificationUser; profile: ReviewNotificationProfile; membership: ReviewNotificationMembership }
  | ReviewNotificationResponse
> {
  const token = getBearerToken(request.headers);
  if (!token) return jsonResponse(401, { code: "unauthenticated", error: "Authentication required." });
  const user = await store.authenticate(token);
  if (!user) return jsonResponse(401, { code: "unauthenticated", error: "Authentication required." });
  const profile = await store.getProfile(user.id);
  if (!profile?.activeOrganizationId) {
    return jsonResponse(403, { code: "active_organization_required", error: "An active organization is required." });
  }
  const membership = await store.getMembership(user.id, profile.activeOrganizationId);
  if (
    !membership
    || !membership.isActive
    || membership.organizationId !== profile.activeOrganizationId
    || !["admin", "operator"].includes(membership.role)
  ) {
    return jsonResponse(403, { code: "forbidden", error: "Review access is required." });
  }
  return { user, profile, membership };
}

function isResponse(value: unknown): value is ReviewNotificationResponse {
  return Boolean(value && typeof value === "object" && "status" in value && "headers" in value);
}

export async function handleReviewDecision(
  request: ReviewNotificationRequest,
  dependencies: ReviewNotificationDependencies,
): Promise<ReviewNotificationResponse> {
  if ((request.method || "").toUpperCase() !== "POST") {
    return { ...jsonResponse(405, { error: "method_not_allowed" }), headers: { ...JSON_HEADERS, Allow: "POST" } };
  }
  const parsed = parseDecisionBody(request.body);
  if (!parsed) return jsonResponse(400, { code: "invalid_review", error: "A valid submission and review decision are required." });
  if (parsed.decision === "rejected" && !parsed.rejectionReason) {
    return jsonResponse(400, { code: "rejection_reason_required", error: "A rejection reason is required." });
  }
  if ((parsed.rejectionReason?.length || 0) > REJECTION_REASON_MAX_LENGTH) {
    return jsonResponse(400, { code: "rejection_reason_too_long", error: `Rejection reason must be ${REJECTION_REASON_MAX_LENGTH} characters or fewer.` });
  }

  try {
    const auth = await authenticateReviewer(request, dependencies.store);
    if (isResponse(auth)) return auth;
    const organizationId = auth.profile.activeOrganizationId as string;
    const submission = await dependencies.store.getSubmission(parsed.submissionId);
    if (!submission || submission.organizationId !== organizationId) {
      return jsonResponse(404, { code: "submission_not_found", error: "Submission not found." });
    }

    const reviewed = await dependencies.store.reviewSubmission({
      submissionId: submission.id,
      organizationId,
      reviewerId: auth.user.id,
      decision: parsed.decision,
      rejectionReason: parsed.decision === "rejected" ? parsed.rejectionReason : null,
    });

    let delivery: DeliveryResult;
    if (reviewed.notificationStatus === "sent") {
      delivery = {
        notificationId: reviewed.notificationId,
        status: "sent",
        retryable: false,
        message: "Review saved and WhatsApp sent.",
      };
    } else if (reviewed.notificationStatus === "failed") {
      delivery = {
        notificationId: reviewed.notificationId,
        status: "failed",
        retryable: true,
        message: "Review saved, but WhatsApp delivery failed.",
      };
    } else if (reviewed.notificationStatus === "sending") {
      delivery = {
        notificationId: reviewed.notificationId,
        status: "sending",
        retryable: false,
        message: "Review saved. WhatsApp delivery is already being processed.",
      };
    } else {
      try {
        delivery = await deliverReviewNotification(
          reviewed.notificationId,
          organizationId,
          auth.user.id,
          dependencies,
        );
      } catch {
        // The transactional review has already committed. A claim or provider
        // failure must never be presented as a failed approval/rejection.
        dependencies.log?.({ status: "failed", errorCode: "notification_delivery_failed" });
        delivery = {
          notificationId: reviewed.notificationId,
          status: "failed",
          retryable: true,
          message: "Review saved, but WhatsApp delivery could not be started. You can retry the notification.",
        };
      }
    }
    dependencies.log?.({ status: "reviewed" });
    return jsonResponse(200, {
      reviewSaved: true,
      decision: parsed.decision,
      notification: delivery,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "review_decision_failed";
    if (code === "review_authorization_failed") {
      return jsonResponse(403, { code: "forbidden", error: "Review access is required." });
    }
    if (code === "review_submission_not_found") {
      return jsonResponse(404, { code: "submission_not_found", error: "Submission not found." });
    }
    if (["review_decision_already_finalized", "review_task_not_submitted", "review_task_not_found"].includes(code)) {
      return jsonResponse(409, { code: "not_reviewable", error: "This submission has already been reviewed or is no longer reviewable." });
    }
    if (["rejection_reason_required", "rejection_reason_too_long", "invalid_review_decision"].includes(code)) {
      return jsonResponse(400, { code: "invalid_review", error: "The review decision or rejection reason is invalid." });
    }
    dependencies.log?.({ status: "error", errorCode: "review_decision_failed" });
    return jsonResponse(500, { code: "database_transition_failed", error: "The review could not be saved. Please try again." });
  }
}

export async function handleReviewNotificationRetry(
  request: ReviewNotificationRequest,
  dependencies: ReviewNotificationDependencies,
): Promise<ReviewNotificationResponse> {
  if ((request.method || "").toUpperCase() !== "POST") {
    return { ...jsonResponse(405, { error: "method_not_allowed" }), headers: { ...JSON_HEADERS, Allow: "POST" } };
  }
  const notificationId = parseNotificationId(request.body);
  if (!notificationId) return jsonResponse(400, { error: "A valid notification is required." });

  try {
    const auth = await authenticateReviewer(request, dependencies.store);
    if (isResponse(auth)) return auth;
    const delivery = await deliverReviewNotification(
      notificationId,
      auth.profile.activeOrganizationId as string,
      auth.user.id,
      dependencies,
    );
    if (delivery.alreadySent) {
      return jsonResponse(409, { error: "This WhatsApp notification was already sent." });
    }
    return jsonResponse(200, { reviewSaved: true, notification: delivery });
  } catch (error) {
    const code = error instanceof Error ? error.message : "notification_retry_failed";
    if (["notification_not_found", "notification_authorization_failed"].includes(code)) {
      return jsonResponse(404, { error: "Notification not found." });
    }
    if (["notification_not_claimable", "notification_attempt_limit"].includes(code)) {
      return jsonResponse(409, { error: "This notification cannot be retried." });
    }
    dependencies.log?.({ status: "error", errorCode: "notification_retry_failed" });
    return jsonResponse(500, { error: "The WhatsApp notification could not be retried." });
  }
}
