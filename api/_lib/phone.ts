const INTERNATIONAL_PHONE_PATTERN = /^[1-9][0-9]{7,14}$/;
const ALLOWED_FORMATTING_PATTERN = /^[+0-9\s().-]+$/;

/**
 * Converts an explicitly international WhatsApp sender into canonical E.164.
 * A leading plus is added to digit-only international input, but no country
 * code is inferred or prepended.
 */
export function normalizeWhatsAppPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const withoutChannel = value.trim().replace(/^whatsapp:\s*/i, "");
  if (!withoutChannel || !ALLOWED_FORMATTING_PATTERN.test(withoutChannel)) {
    return null;
  }

  const compact = withoutChannel.replace(/[\s().-]/g, "");
  const digits = compact.startsWith("+") ? compact.slice(1) : compact;

  if (!INTERNATIONAL_PHONE_PATTERN.test(digits)) return null;
  return `+${digits}`;
}
