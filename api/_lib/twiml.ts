export const RECOGNIZED_COLLECTOR_MESSAGE =
  "Welcome to Polis Systems. WhatsApp setup is working.";

export const UNRECOGNIZED_COLLECTOR_MESSAGE =
  "This number is not registered with Polis Systems. Please contact your organization administrator.";

export const GENERIC_ERROR_MESSAGE =
  "We could not process your message. Please try again later.";

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
