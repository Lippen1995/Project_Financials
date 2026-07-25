import { z } from "zod";

import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";

const routeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);

const companyReferenceSchema = z.string().trim().min(1).max(128).transform((value, ctx) => {
  const organizationNumber = norwegianOrganizationNumberSchema.safeParse(value);
  if (organizationNumber.success) {
    return organizationNumber.data;
  }

  if (!/^\d[\d\s]*$/.test(value) && routeIdSchema.safeParse(value).success) {
    return value;
  }

  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ugyldig selskapsreferanse." });
  return z.NEVER;
});

export const queryYearSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  },
  z
    .string()
    .regex(/^\d{4}$/)
    .transform(Number)
    .refine((year) => year >= 1800 && year <= 2100)
    .optional(),
);

export const queryDateTimeSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    return value;
  },
  z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional(),
);

function createRouteIdsSchema<Key extends string>(keys: readonly Key[]) {
  return z.object(Object.fromEntries(keys.map((key) => [key, routeIdSchema]))).strict();
}

export function parseRouteIds<const Key extends string>(
  params: Record<Key, unknown>,
  keys: readonly Key[],
): Record<Key, string> {
  return createRouteIdsSchema(keys).parse(params) as Record<Key, string>;
}

export function tryParseRouteIds<const Key extends string>(
  params: Record<Key, unknown>,
  keys: readonly Key[],
): Record<Key, string> | null {
  const parsed = createRouteIdsSchema(keys).safeParse(params);
  return parsed.success ? (parsed.data as Record<Key, string>) : null;
}

export function tryParseCompanyReference(value: unknown): string | null {
  const parsed = companyReferenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
