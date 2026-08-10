/**
 * Controlled generator failures, from spec section 10.
 *
 * A generator that cannot produce a statement must say which rule it could not satisfy. It must
 * never resolve the conflict by moving a reported anchor, and it must never hide a material
 * difference inside a plausible operating line — an invented cost line that happens to make the
 * accounts balance is indistinguishable from a real one once it is on screen.
 */

export const FI_SIM_ERROR_CODES = [
  "CONTRADICTORY_REPORTED_ANCHORS",
  "UNSOLVABLE_STATEMENT_IDENTITY",
  "UNSUPPORTED_SIMULATION_PROFILE",
  "INVALID_PERIOD",
  "INVALID_UNIT_OR_CURRENCY",
  "MISSING_REPORTED_ANCHOR_REFERENCE",
] as const;

export type FiSimErrorCode = (typeof FI_SIM_ERROR_CODES)[number];

export class FiSimGenerationError extends Error {
  readonly code: FiSimErrorCode;
  readonly fiscalYear: number | null;

  constructor(code: FiSimErrorCode, message: string, fiscalYear: number | null = null) {
    super(message);
    this.name = "FiSimGenerationError";
    this.code = code;
    this.fiscalYear = fiscalYear;
  }
}

export type FiSimGenerationFailure = {
  fiscalYear: number | null;
  code: FiSimErrorCode;
  message: string;
};

export function toGenerationFailure(error: unknown): FiSimGenerationFailure {
  if (error instanceof FiSimGenerationError) {
    return { fiscalYear: error.fiscalYear, code: error.code, message: error.message };
  }
  throw error;
}
