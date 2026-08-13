import { z } from "zod";

import { isNorwegianCountyCode } from "@/lib/norwegian-counties";

/**
 * Numeric filters the public map exposes. The first five read a published column directly; the
 * three ratios are derived from those same columns so a filtered figure never mixes scopes.
 */
export const COMPANY_MAP_RANGE_KEYS = [
  "revenue",
  "ebit",
  "equity",
  "totalAssets",
  "employees",
  "ebitMargin",
  "returnOnEquity",
  "equityRatio",
] as const;

export type CompanyMapRangeKey = (typeof COMPANY_MAP_RANGE_KEYS)[number];

export type CompanyMapRangeSelection = {
  key: CompanyMapRangeKey;
  min: number | null;
  max: number | null;
};

const organisationFormsSchema = z
  .string()
  .default("AS,ASA")
  .transform((value, context) => {
    const values = value
      .split(",")
      .map((item) => item.trim().toLocaleUpperCase("nb-NO"))
      .filter(Boolean);
    if (values.length === 1 && values[0] === "ALL") return null;
    if (values.includes("ALL")) {
      context.addIssue({
        code: "custom",
        message: "ALL cannot be combined with organisation forms.",
      });
      return z.NEVER;
    }
    if (
      values.length === 0 ||
      values.length > 6 ||
      values.some((item) => !/^[A-ZÆØÅ0-9]{1,12}$/.test(item))
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid organisation-form filter.",
      });
      return z.NEVER;
    }
    return [...new Set(values)];
  });

const companyStatusesSchema = z
  .string()
  .default("ACTIVE")
  .transform((value, context) => {
    const allowed = new Set(["ACTIVE", "DISSOLVED", "BANKRUPT"]);
    const values = value
      .split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    if (
      values.length === 0 ||
      values.length > 3 ||
      values.some((item) => !allowed.has(item))
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid company-status filter.",
      });
      return z.NEVER;
    }
    return [...new Set(values)] as Array<"ACTIVE" | "DISSOLVED" | "BANKRUPT">;
  });

const financialSelectionSchema = {
  statementScope: z.enum(["COMPANY", "CONSOLIDATED"]).default("COMPANY"),
  currency: z
    .string()
    .default("NOK")
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
};

const searchSchema = z
  .string()
  .max(120)
  .nullable()
  .default(null)
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length === 0 ? null : trimmed;
  });

const countiesSchema = z
  .string()
  .nullable()
  .default(null)
  .transform((value, context) => {
    if (value === null) return null;
    const codes = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (
      codes.length === 0 ||
      codes.length > 20 ||
      codes.some((code) => !isNorwegianCountyCode(code))
    ) {
      context.addIssue({ code: "custom", message: "Invalid county filter." });
      return z.NEVER;
    }
    return [...new Set(codes)];
  });

/**
 * Kroner figures stay integral, ratios keep one decimal. Both bounds are optional so a filter can
 * be open-ended in either direction, which is how the panel's min/max pair is used in practice.
 */
const amountBoundSchema = z.coerce
  .number()
  .int()
  .min(-1e15)
  .max(1e15)
  .nullable()
  .default(null);
const countBoundSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(10_000_000)
  .nullable()
  .default(null);
const ratioBoundSchema = z.coerce
  .number()
  .finite()
  .min(-100_000)
  .max(100_000)
  .nullable()
  .default(null);

const rangeFilterSchema = {
  revenueMin: amountBoundSchema,
  revenueMax: amountBoundSchema,
  ebitMin: amountBoundSchema,
  ebitMax: amountBoundSchema,
  equityMin: amountBoundSchema,
  equityMax: amountBoundSchema,
  totalAssetsMin: amountBoundSchema,
  totalAssetsMax: amountBoundSchema,
  employeesMin: countBoundSchema,
  employeesMax: countBoundSchema,
  ebitMarginMin: ratioBoundSchema,
  ebitMarginMax: ratioBoundSchema,
  returnOnEquityMin: ratioBoundSchema,
  returnOnEquityMax: ratioBoundSchema,
  equityRatioMin: ratioBoundSchema,
  equityRatioMax: ratioBoundSchema,
};

const booleanFlagSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const entityFilterSchema = {
  organisationForms: organisationFormsSchema,
  companyStatuses: companyStatusesSchema,
  search: searchSchema,
  counties: countiesSchema,
  onlyGroupMembers: booleanFlagSchema,
  requirePublishedFinancials: booleanFlagSchema,
  ...rangeFilterSchema,
};

export type CompanyMapRangeQuery = {
  [Key in `${CompanyMapRangeKey}${"Min" | "Max"}`]: number | null;
};

/**
 * Collapses the flat query parameters into the bounded ranges the SQL builder consumes, dropping
 * the ones the caller left fully open so an unused filter never reaches the query plan.
 */
export function collectCompanyMapRanges(
  query: CompanyMapRangeQuery,
): CompanyMapRangeSelection[] {
  return COMPANY_MAP_RANGE_KEYS.map((key) => ({
    key,
    min: query[`${key}Min`],
    max: query[`${key}Max`],
  })).filter((range) => range.min !== null || range.max !== null);
}

/**
 * An omitted parameter and an empty one mean the same thing to the filter panel: no filter. Zod
 * defaults only fire for `undefined`, so blank values are dropped before validation.
 */
function readSearchParams(value: unknown) {
  if (!(value instanceof URLSearchParams)) return value;
  return Object.fromEntries(
    [...value.entries()].filter(([, entry]) => entry.trim() !== ""),
  );
}

const longitudeSchema = z.coerce.number().finite().min(-180).max(180);
const latitudeSchema = z.coerce.number().finite().min(-90).max(90);

export const companyMapCoverageQuerySchema = z.preprocess(
  readSearchParams,
  z.object({
    ...entityFilterSchema,
    ...financialSelectionSchema,
    metric: z
      .enum([
        "revenue",
        "ebit",
        "preTaxProfit",
        "netIncome",
        "equity",
        "totalAssets",
        "employees",
      ])
      .default("revenue"),
  }),
);

export type CompanyMapCoverageQuery = z.infer<
  typeof companyMapCoverageQuerySchema
>;

export const companyMapCompaniesQuerySchema = z.preprocess(
  readSearchParams,
  z.object({
    ...entityFilterSchema,
    ...financialSelectionSchema,
    limit: z.coerce.number().int().min(1).max(500).default(100),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    officialAddressId: z
      .string()
      .regex(/^[A-Za-z0-9:_-]{1,128}$/)
      .nullable()
      .default(null),
    west: longitudeSchema.nullable().default(null),
    south: latitudeSchema.nullable().default(null),
    east: longitudeSchema.nullable().default(null),
    north: latitudeSchema.nullable().default(null),
  })
    .superRefine((value, context) => {
      const bounds = [value.west, value.south, value.east, value.north];
      if (bounds.some((bound) => bound === null) && bounds.some((bound) => bound !== null)) {
        context.addIssue({
          code: "custom",
          message: "A viewport filter needs all four bounds.",
          path: ["north"],
        });
      }
    }),
);

export type CompanyMapCompaniesQuery = z.infer<
  typeof companyMapCompaniesQuerySchema
>;

export const companyMapViewportQuerySchema = z.preprocess(
  readSearchParams,
  z
    .object({
      ...entityFilterSchema,
      ...financialSelectionSchema,
      west: longitudeSchema,
      south: latitudeSchema,
      east: longitudeSchema,
      north: latitudeSchema,
      zoom: z.coerce.number().finite().min(3).max(20),
      limit: z.coerce.number().int().min(1).max(2_000).default(1_000),
    })
    .superRefine((value, context) => {
      if (value.west >= value.east) {
        context.addIssue({
          code: "custom",
          message: "Viewport west must be smaller than east.",
          path: ["east"],
        });
      }
      if (value.south >= value.north) {
        context.addIssue({
          code: "custom",
          message: "Viewport south must be smaller than north.",
          path: ["north"],
        });
      }
    }),
);

export type CompanyMapViewportQuery = z.infer<
  typeof companyMapViewportQuerySchema
>;
