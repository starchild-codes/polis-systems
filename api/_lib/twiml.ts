export const RECOGNIZED_COLLECTOR_MESSAGE =
  "Welcome to Polis Systems. WhatsApp setup is working.";

export const UNRECOGNIZED_COLLECTOR_MESSAGE =
  "This number is not registered with Polis Systems. Please contact your organization administrator.";

export const GENERIC_ERROR_MESSAGE =
  "We could not process your message. Please try again later.";

export const TASK_ACCEPTED_MESSAGE =
  "Task accepted. Please send a BEFORE photo of the location before work begins.";

export const TASK_DECLINED_MESSAGE =
  "Task declined. Your organization has been notified.";

export const NO_ACTIVE_ASSIGNMENT_MESSAGE =
  "There is no active task awaiting your response. Please contact your organization administrator.";

export const AMBIGUOUS_ASSIGNMENT_MESSAGE =
  "More than one task is awaiting your response. Please contact your organization administrator.";

export const INVALID_ASSIGNMENT_COMMAND_MESSAGE =
  "Please reply ACCEPT to accept the task or DECLINE to decline it.";

export const BEFORE_PHOTO_RECEIVED_MESSAGE =
  "Before photo received. Complete the task, then send an AFTER photo.";

export const AFTER_PHOTO_RECEIVED_MESSAGE =
  "After photo received. What type of waste was collected? For example: plastic, paper, mixed waste, organic waste, or metal.";

export const WASTE_TYPE_RECEIVED_MESSAGE =
  "How much waste was collected? Reply with a quantity and unit, for example: 12 kg or 3 bags.";

export const QUANTITY_RECEIVED_MESSAGE =
  "Add any final notes about the work, or reply SKIP.";

export const PROOF_SUBMITTED_MESSAGE =
  "Proof submitted successfully. Your organization will review the work.";

export const EXPECTED_BEFORE_PHOTO_MESSAGE = "Please send one BEFORE photo.";
export const EXPECTED_AFTER_PHOTO_MESSAGE = "Please send one AFTER photo.";
export const EXPECTED_WASTE_TYPE_MESSAGE =
  "Please reply with the type of waste collected.";
export const EXPECTED_QUANTITY_MESSAGE =
  "Please reply with the amount collected, such as 12 kg or 3 bags.";
export const EXPECTED_NOTES_MESSAGE = "Reply with final notes or SKIP.";

export const PROOF_EXPIRED_MESSAGE =
  "This proof session has expired. Please contact your organization administrator.";

export const TASK_UNAVAILABLE_MESSAGE =
  "This task is no longer available for proof submission. Please contact your organization administrator.";

export const PROOF_CANCELLED_MESSAGE =
  "The proof workflow has been cancelled. Please contact your organization administrator if you need to restart it.";

export const MEDIA_RETRY_MESSAGE =
  "We could not securely save that image. Please try sending it again.";

export const PROOF_RETRY_MESSAGE =
  "We could not save that proof step. Please try sending it again.";

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
