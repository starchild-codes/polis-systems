export const RECOGNIZED_COLLECTOR_MESSAGE =
  "Welcome to Polis Systems. WhatsApp setup is working.";

export const UNRECOGNIZED_COLLECTOR_MESSAGE =
  "This number is not registered with Polis Systems. Please contact your organization administrator.";

export const GENERIC_ERROR_MESSAGE =
  "We could not process your message. Please try again later.";

export const TASK_ACCEPTED_MESSAGE =
  "Task accepted. Thank you. You can now begin the work.";

export const TASK_DECLINED_MESSAGE =
  "Task declined. Your organization has been notified.";

export const NO_ACTIVE_ASSIGNMENT_MESSAGE =
  "There is no active task awaiting your response. Please contact your organization administrator.";

export const AMBIGUOUS_ASSIGNMENT_MESSAGE =
  "More than one task is awaiting your response. Please contact your organization administrator.";

export const INVALID_ASSIGNMENT_COMMAND_MESSAGE =
  "Please reply ACCEPT to accept the task or DECLINE to decline it.";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createMessagingTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}
