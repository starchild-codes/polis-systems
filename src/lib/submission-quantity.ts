export const QUANTITY_NOT_PROVIDED = "Quantity not provided";

/** Preserve the collector's original free-text quantity and unit, trimming outer whitespace only. */
export function formatSubmissionQuantity(value: string | null | undefined): string {
  const quantity = value?.trim();
  return quantity || QUANTITY_NOT_PROVIDED;
}
