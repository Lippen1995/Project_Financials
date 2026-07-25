import { z } from "zod";

const MOD_11_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

export function normalizeNorwegianOrganizationNumber(value: string): string {
  return value.replace(/\s/g, "");
}

export function isValidNorwegianOrganizationNumber(value: string): boolean {
  const normalized = normalizeNorwegianOrganizationNumber(value);
  if (!/^\d{9}$/.test(normalized)) return false;
  const weightedSum = MOD_11_WEIGHTS.reduce(
    (sum, weight, index) => sum + Number(normalized[index]) * weight,
    0,
  );
  const remainder = weightedSum % 11;
  const controlDigit = remainder === 0 ? 0 : 11 - remainder;
  return controlDigit !== 10 && controlDigit === Number(normalized[8]);
}

export const norwegianOrganizationNumberSchema = z
  .string()
  .transform(normalizeNorwegianOrganizationNumber)
  .refine(isValidNorwegianOrganizationNumber, "Ugyldig organisasjonsnummer.");
