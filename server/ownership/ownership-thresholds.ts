/**
 * Ownership semantics for the Norwegian corporate-group model.
 *
 * Thresholds follow regnskapsloven §1-3 / aksjeloven §1-3:
 *   - Datterselskap (subsidiary):  ownership > 50 %  → control, forms a konsern
 *   - Tilknyttet selskap (associated): 20 %–50 %     → significant influence
 *   - Minoritetspost (minority):   < 20 %
 *
 * All comparisons are on aggregated ownership (shares summed across share
 * classes), not per-share-class register rows.
 */

export type OwnershipRelationship = "SUBSIDIARY" | "ASSOCIATED" | "MINORITY";

/** Strictly greater than this gives control (datterselskap / konsern). */
export const CONTROL_THRESHOLD_PERCENT = 50;

/** At or above this (and at or below control) gives significant influence. */
export const ASSOCIATED_THRESHOLD_PERCENT = 20;

/**
 * Classify an owner→issuer relationship from an aggregated ownership percentage.
 * `null`/`undefined` percentages (missing total-share data) fall back to MINORITY
 * so they never imply control we cannot substantiate.
 */
export function classifyRelationship(ownershipPercent: number | null | undefined): OwnershipRelationship {
  if (ownershipPercent === null || ownershipPercent === undefined || Number.isNaN(ownershipPercent)) {
    return "MINORITY";
  }
  if (ownershipPercent > CONTROL_THRESHOLD_PERCENT) {
    return "SUBSIDIARY";
  }
  if (ownershipPercent >= ASSOCIATED_THRESHOLD_PERCENT) {
    return "ASSOCIATED";
  }
  return "MINORITY";
}

/** Whether an ownership percentage confers control (>50 %). */
export function isControlling(ownershipPercent: number | null | undefined): boolean {
  return classifyRelationship(ownershipPercent) === "SUBSIDIARY";
}

/** Human-readable Norwegian label for a relationship type. */
export function relationshipLabel(relationship: OwnershipRelationship): string {
  switch (relationship) {
    case "SUBSIDIARY":
      return "Datterselskap";
    case "ASSOCIATED":
      return "Tilknyttet selskap";
    case "MINORITY":
      return "Minoritetspost";
  }
}
