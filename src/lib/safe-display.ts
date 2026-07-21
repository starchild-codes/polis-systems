export const ORGANIZATION_MEMBER_LABEL = "Organization member";
export const COLLECTOR_LABEL = "Collector";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const UUID_IN_TEXT_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu;
const INTERNAL_ERROR_PATTERN = /(?:\b(?:database|sql|sqlstate|postgres|postgrest|schema|relation|table|column|constraint|function|stack trace)\b|\b(?:PGRST\d+|[0-9A-Z]{5})\b|row-level security|permission denied|duplicate key|violates .* constraint|\/storage\/v1\/|(?:task|submission|collector|profile|organization|event|reviewer|user)_id\b)/iu;
const INTERNAL_DISPLAY_PATTERN = /(?:\bpublic\.[a-z_][a-z0-9_]*\b|\/storage\/v1\/|(?:task|submission|collector|profile|organization|event|reviewer|user)_id\b)/iu;

type DisplayActor = {
  fullName?: unknown;
  displayName?: unknown;
};

export function isUuidLike(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function containsUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_IN_TEXT_PATTERN.test(value);
}

function cleanDisplayValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed || normalized === "null" || normalized === "undefined" || containsUuid(trimmed)) return null;
  return trimmed;
}

/**
 * Resolve a human-facing actor label without ever falling back to an internal ID.
 */
export function getDisplayActorName(
  actor: DisplayActor | string | null | undefined,
  fallback = ORGANIZATION_MEMBER_LABEL,
): string {
  if (typeof actor === "string" || actor == null) {
    return cleanDisplayValue(actor) ?? fallback;
  }
  return cleanDisplayValue(actor.fullName)
    ?? cleanDisplayValue(actor.displayName)
    ?? fallback;
}

/** Keep database/provider details out of toasts, inline errors, and accessibility text. */
export function getUserFacingError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const message = raw.trim();
  if (!message) return fallback;
  if (/permission denied|row-level security|not authorized|forbidden/iu.test(message)) {
    return "You do not have permission to perform this action.";
  }
  if (containsUuid(message) || INTERNAL_ERROR_PATTERN.test(message)) return fallback;
  return message.length <= 240 ? message : fallback;
}

export function getSafeDisplayText(value: unknown, fallback: string): string {
  const cleaned = cleanDisplayValue(value);
  if (!cleaned || INTERNAL_DISPLAY_PATTERN.test(cleaned)) return fallback;
  return cleaned;
}
