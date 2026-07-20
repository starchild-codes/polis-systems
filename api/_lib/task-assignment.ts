import { normalizeWhatsAppPhone } from "./phone.js";

export type OrganizationRole = "admin" | "operator";

export interface AuthenticatedUser {
  id: string;
}

export interface AssignmentProfile {
  activeOrganizationId: string | null;
}

export interface AssignmentMembership {
  organizationId: string;
  role: OrganizationRole;
  isActive: boolean;
}

export interface AssignmentTask {
  id: string;
  organizationId: string;
  collectorId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  zone: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
}

export interface AssignmentCollector {
  id: string;
  organizationId: string;
  phoneE164: string | null;
}

export type PrepareAssignmentResult =
  | { result: "prepared"; sessionId: string }
  | { result: "already_sent"; sessionId: string; outboundMessageSid: string }
  | { result: "in_progress"; sessionId: string }
  | {
      result:
        | "authorization_failed"
        | "task_not_found"
        | "task_not_assignable"
        | "collector_busy"
        | "organization_mismatch"
        | "invalid_expiry";
      sessionId: null;
    };

export interface TaskAssignmentStore {
  authenticate(accessToken: string): Promise<AuthenticatedUser | null>;
  getProfile(userId: string): Promise<AssignmentProfile | null>;
  getTask(taskId: string): Promise<AssignmentTask | null>;
  getMembership(
    userId: string,
    organizationId: string,
  ): Promise<AssignmentMembership | null>;
  getCollector(collectorId: string): Promise<AssignmentCollector | null>;
  prepareAssignment(input: {
    taskId: string;
    collectorId: string;
    organizationId: string;
    actorId: string;
    expiresAt: string;
  }): Promise<PrepareAssignmentResult>;
  completeAssignment(input: {
    sessionId: string;
    outboundMessageSid: string;
    actorId: string;
  }): Promise<boolean>;
  failAssignment(sessionId: string): Promise<void>;
}

export interface OutboundAssignmentMessage {
  to: string;
  body: string;
  contentVariables: Record<string, string>;
}

export interface TaskAssignmentSender {
  send(message: OutboundAssignmentMessage): Promise<{ messageSid: string }>;
}

export interface SafeAssignmentLog {
  status: string;
  taskId?: string;
  errorCode?: string;
}

export interface AssignmentRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface AssignmentResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface TaskAssignmentDependencies {
  store: TaskAssignmentStore;
  sender: TaskAssignmentSender;
  now?: () => Date;
  log?: (entry: SafeAssignmentLog) => void;
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const TASK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, payload: Record<string, unknown>): AssignmentResponse {
  return { status, headers: JSON_HEADERS, body: JSON.stringify(payload) };
}

function firstHeaderValue(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || null;
}

function getHeader(headers: AssignmentRequest["headers"], requestedName: string): string | null {
  const key = Object.keys(headers).find(
    (headerName) => headerName.toLowerCase() === requestedName.toLowerCase(),
  );
  return key ? firstHeaderValue(headers[key]) : null;
}

function parseTaskId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const taskId = (body as Record<string, unknown>).taskId;
  return typeof taskId === "string" && TASK_ID_PATTERN.test(taskId) ? taskId : null;
}

function formatDueDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function createTaskAssignmentMessage(task: AssignmentTask): {
  body: string;
  contentVariables: Record<string, string>;
} {
  const due = formatDueDate(task.dueAt);
  const fields: Array<[string, string | null]> = [
    ["Task", task.title.trim()],
    ["Zone", task.zone?.trim() || null],
    ["Location", task.location?.trim() || null],
    ["Due", due],
    ["Priority", task.priority?.trim() || null],
  ];
  const detailLines = fields
    .filter((field): field is [string, string] => Boolean(field[1]))
    .map(([label, value]) => `${label}: ${value}`);

  return {
    body: [
      "Polis Systems Task Assignment",
      "",
      ...detailLines,
      "",
      "Reply ACCEPT to accept this task.",
      "Reply DECLINE to decline this task.",
    ].join("\n"),
    contentVariables: {
      task: task.title.trim(),
      zone: task.zone?.trim() || "Not specified",
      location: task.location?.trim() || "Not specified",
      due: due || "Not specified",
      priority: task.priority?.trim() || "Not specified",
    },
  };
}

export async function handleTaskAssignment(
  request: AssignmentRequest,
  dependencies: TaskAssignmentDependencies,
): Promise<AssignmentResponse> {
  const log = dependencies.log || (() => undefined);

  if ((request.method || "").toUpperCase() !== "POST") {
    return {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: "POST" },
      body: JSON.stringify({ error: "method_not_allowed" }),
    };
  }

  const authorization = getHeader(request.headers, "authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!accessToken) {
    log({ status: "rejected", errorCode: "unauthenticated" });
    return jsonResponse(401, { error: "Authentication required." });
  }

  const taskId = parseTaskId(request.body);
  if (!taskId) return jsonResponse(400, { error: "A valid task is required." });

  let preparedSessionId: string | null = null;
  let twilioAcceptedMessage = false;
  try {
    const user = await dependencies.store.authenticate(accessToken);
    if (!user) {
      log({ status: "rejected", taskId, errorCode: "invalid_session" });
      return jsonResponse(401, { error: "Authentication required." });
    }

    const [profile, task] = await Promise.all([
      dependencies.store.getProfile(user.id),
      dependencies.store.getTask(taskId),
    ]);
    if (!task) return jsonResponse(404, { error: "Task not found." });
    if (!profile || profile.activeOrganizationId !== task.organizationId) {
      log({ status: "rejected", taskId, errorCode: "organization_forbidden" });
      return jsonResponse(403, { error: "You do not have access to this task." });
    }

    const membership = await dependencies.store.getMembership(user.id, task.organizationId);
    if (
      !membership
      || !membership.isActive
      || membership.organizationId !== task.organizationId
      || !["admin", "operator"].includes(membership.role)
    ) {
      log({ status: "rejected", taskId, errorCode: "role_forbidden" });
      return jsonResponse(403, { error: "You are not allowed to send task assignments." });
    }

    if (task.status !== "assigned") {
      const message = task.status === "accepted"
        ? "The collector has already accepted this assignment. Refresh the task to see its current status."
        : task.status === "in_progress"
          ? "This task is already in progress and cannot be sent as a new assignment."
          : "This task is not currently ready for a WhatsApp assignment. Reassign its collector and try again.";
      return jsonResponse(409, { error: message, code: "task_not_assignable" });
    }
    if (!task.collectorId) {
      return jsonResponse(422, { error: "Assign a collector before sending through WhatsApp." });
    }

    const collector = await dependencies.store.getCollector(task.collectorId);
    if (!collector) return jsonResponse(404, { error: "Assigned collector not found." });
    if (collector.organizationId !== task.organizationId) {
      log({ status: "rejected", taskId, errorCode: "collector_organization_mismatch" });
      return jsonResponse(403, { error: "The assigned collector is outside this organization." });
    }

    const phoneE164 = normalizeWhatsAppPhone(collector.phoneE164);
    if (!phoneE164) {
      return jsonResponse(422, { error: "The assigned collector does not have a valid phone number." });
    }

    const now = dependencies.now?.() || new Date();
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const preparation = await dependencies.store.prepareAssignment({
      taskId,
      collectorId: collector.id,
      organizationId: task.organizationId,
      actorId: user.id,
      expiresAt,
    });

    if (preparation.result === "already_sent") {
      log({ status: "duplicate", taskId });
      return jsonResponse(200, { sent: false, duplicate: true, message: "Assignment already sent." });
    }
    if (preparation.result === "in_progress") {
      return jsonResponse(409, { error: "This assignment is already being sent." });
    }
    if (preparation.result === "collector_busy") {
      return jsonResponse(409, {
        error: "This collector must finish or cancel their active proof workflow before receiving another WhatsApp assignment.",
      });
    }
    if (preparation.result !== "prepared") {
      log({ status: "rejected", taskId, errorCode: preparation.result });
      return jsonResponse(409, { error: "The assignment is no longer available to send." });
    }
    preparedSessionId = preparation.sessionId;

    const message = createTaskAssignmentMessage(task);
    const sent = await dependencies.sender.send({
      to: `whatsapp:${phoneE164}`,
      body: message.body,
      contentVariables: message.contentVariables,
    });
    if (!sent.messageSid) throw new Error("missing_twilio_message_sid");
    twilioAcceptedMessage = true;

    const completed = await dependencies.store.completeAssignment({
      sessionId: preparation.sessionId,
      outboundMessageSid: sent.messageSid,
      actorId: user.id,
    });
    if (!completed) throw new Error("assignment_finalize_failed");

    log({ status: "sent", taskId });
    return jsonResponse(200, { sent: true, duplicate: false, message: "WhatsApp assignment sent." });
  } catch {
    if (preparedSessionId && !twilioAcceptedMessage) {
      try {
        await dependencies.store.failAssignment(preparedSessionId);
      } catch {
        // The original safe error is more useful than a cleanup failure.
      }
    }
    log({ status: "error", taskId, errorCode: "assignment_send_failed" });
    return jsonResponse(502, { error: "The WhatsApp assignment could not be sent. Please try again." });
  }
}
