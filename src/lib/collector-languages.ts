import { getSafeDisplayText } from "@/lib/safe-display";

export const COLLECTOR_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "ht", label: "Haitian Creole" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "other", label: "Other" },
] as const;

export type CollectorLanguageCode = (typeof COLLECTOR_LANGUAGE_OPTIONS)[number]["value"];
export type CollectorLanguageOption = { value: string; label: string };

export const DEFAULT_COLLECTOR_LANGUAGE: CollectorLanguageCode = "en";

const languageLabels = new Map<string, string>(
  COLLECTOR_LANGUAGE_OPTIONS.map((option) => [option.value, option.label]),
);

export function isCollectorLanguageCode(value: string): value is CollectorLanguageCode {
  return languageLabels.has(value);
}

/**
 * New collectors use stable codes, while legacy full-label values remain valid and visible.
 */
export function getCollectorLanguageLabel(value: string | null | undefined, fallback = "—"): string {
  const storedValue = value?.trim();
  if (!storedValue) return fallback;
  return languageLabels.get(storedValue) ?? getSafeDisplayText(storedValue, fallback);
}

/**
 * Keeps a collector's existing legacy value selectable without adding it to the new-value list.
 */
export function getCollectorLanguageOptions(currentValue?: string | null): readonly CollectorLanguageOption[] {
  const storedValue = currentValue?.trim();
  if (!storedValue || isCollectorLanguageCode(storedValue)) return COLLECTOR_LANGUAGE_OPTIONS;
  const safeLegacyLabel = getSafeDisplayText(storedValue, "");
  if (!safeLegacyLabel) return COLLECTOR_LANGUAGE_OPTIONS;
  return [
    { value: storedValue, label: `${safeLegacyLabel} (current saved value)` },
    ...COLLECTOR_LANGUAGE_OPTIONS,
  ];
}

export function isCollectorLanguageValueAllowed(
  value: string | null | undefined,
  currentValue?: string | null,
): boolean {
  const candidate = value?.trim();
  if (!candidate) return true;
  if (isCollectorLanguageCode(candidate)) return true;

  const existingLegacyValue = currentValue?.trim();
  return Boolean(
    existingLegacyValue
      && !isCollectorLanguageCode(existingLegacyValue)
      && candidate === existingLegacyValue,
  );
}

export function normalizeCollectorLanguageForStorage(
  value: string | null | undefined,
  currentValue?: string | null,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (!isCollectorLanguageValueAllowed(candidate, currentValue)) {
    throw new Error("Select an available preferred language.");
  }
  return candidate;
}
