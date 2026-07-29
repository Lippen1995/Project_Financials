import { z } from "zod";

import type { SerializableSourceMetadata } from "@/lib/types";

const nonNegativeAmount = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const optionalRange = (minimumKey: string, maximumKey: string) =>
  (value: Record<string, unknown>, context: z.RefinementCtx) => {
    const minimum = value[minimumKey];
    const maximum = value[maximumKey];
    if (
      typeof minimum === "number" &&
      typeof maximum === "number" &&
      minimum > maximum
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${minimumKey} cannot exceed ${maximumKey}.`,
        path: [minimumKey],
      });
    }
  };

export const companyUniverseQuerySchema = z
  .object({
    version: z.literal("company-universe-v1"),
    workflow: z.enum(["MNA_SCREENING", "SOURCING", "COMPETITOR_ANALYSIS"]),
    query: z.string().trim().min(1).max(200).optional(),
    industryCodePrefixes: z.array(z.string().trim().regex(/^\d{1,2}(?:\.\d{1,5})?$/)).max(25).default([]),
    municipalityNumbers: z.array(z.string().regex(/^\d{4}$/)).max(50).default([]),
    legalForms: z.array(z.string().trim().regex(/^[A-Z0-9_-]{1,20}$/)).max(25).default([]),
    statuses: z.array(z.enum(["ACTIVE", "DISSOLVED", "BANKRUPT"])).min(1).max(3),
    minEmployees: z.number().int().nonnegative().max(1_000_000).optional(),
    maxEmployees: z.number().int().nonnegative().max(1_000_000).optional(),
    minRevenue: nonNegativeAmount.optional(),
    maxRevenue: nonNegativeAmount.optional(),
    minOperatingMarginBps: z.number().int().min(-100_000).max(100_000).optional(),
    maxOperatingMarginBps: z.number().int().min(-100_000).max(100_000).optional(),
    fiscalYear: z.number().int().min(1990).max(2200).optional(),
    missingDataPolicy: z.enum(["EXCLUDE", "INCLUDE_WITH_GAP"]),
    limit: z.number().int().min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    optionalRange("minEmployees", "maxEmployees")(value, context);
    optionalRange("minRevenue", "maxRevenue")(value, context);
    optionalRange("minOperatingMarginBps", "maxOperatingMarginBps")(value, context);
  });

export type CompanyUniverseQuery = z.infer<typeof companyUniverseQuerySchema>;

export type CompanyUniverseCandidate = {
  orgNumber: string;
  name: string;
  legalForm: string | null;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  naceCode: string | null;
  municipalityNumber: string | null;
  employeeCount: number | null;
  companySource: SerializableSourceMetadata;
  financials: {
    fiscalYear: number;
    revenue: number | null;
    operatingProfit: number | null;
    operatingMarginBps: number | null;
    source: SerializableSourceMetadata;
  } | null;
};

export type ScreenedCompany = CompanyUniverseCandidate & {
  inclusionReasons: string[];
  dataGaps: string[];
};

export type ExcludedCompany = Pick<
  CompanyUniverseCandidate,
  "orgNumber" | "name" | "companySource"
> & {
  sourceBasis: SerializableSourceMetadata[];
  reasons: string[];
};

function hasPrefix(value: string | null, prefixes: string[]) {
  return prefixes.length === 0 || (value != null && prefixes.some((prefix) => value.startsWith(prefix)));
}

function inList(value: string | null, allowed: string[]) {
  return allowed.length === 0 || (value != null && allowed.includes(value));
}

function applyNullableRange(
  value: number | null,
  options: {
    minimum?: number;
    maximum?: number;
    missingDataPolicy: CompanyUniverseQuery["missingDataPolicy"];
    missingReason: string;
    belowReason: string;
    aboveReason: string;
  },
  excluded: string[],
  gaps: string[],
) {
  if (options.minimum == null && options.maximum == null) return;
  if (value == null) {
    if (options.missingDataPolicy === "EXCLUDE") excluded.push(options.missingReason);
    else gaps.push(options.missingReason);
    return;
  }
  if (options.minimum != null && value < options.minimum) excluded.push(options.belowReason);
  if (options.maximum != null && value > options.maximum) excluded.push(options.aboveReason);
}

export function screenCompanyUniverse(
  candidates: CompanyUniverseCandidate[],
  query: CompanyUniverseQuery,
) {
  const matched: ScreenedCompany[] = [];
  const excluded: ExcludedCompany[] = [];

  for (const company of [...candidates].sort((a, b) => a.orgNumber.localeCompare(b.orgNumber))) {
    const reasons: string[] = [];
    const gaps: string[] = [];
    if (!query.statuses.includes(company.status)) reasons.push("STATUS_NOT_INCLUDED");
    if (!hasPrefix(company.naceCode, query.industryCodePrefixes)) reasons.push("INDUSTRY_NOT_INCLUDED");
    if (!inList(company.municipalityNumber, query.municipalityNumbers)) {
      reasons.push("MUNICIPALITY_NOT_INCLUDED");
    }
    if (!inList(company.legalForm, query.legalForms)) reasons.push("LEGAL_FORM_NOT_INCLUDED");
    if (
      query.query &&
      !`${company.name} ${company.orgNumber}`.toLocaleLowerCase("nb-NO")
        .includes(query.query.toLocaleLowerCase("nb-NO"))
    ) {
      reasons.push("TEXT_NOT_MATCHED");
    }
    if (query.fiscalYear != null && company.financials?.fiscalYear !== query.fiscalYear) {
      if (company.financials == null && query.missingDataPolicy === "INCLUDE_WITH_GAP") {
        gaps.push("FINANCIAL_PERIOD_NOT_AVAILABLE");
      } else {
        reasons.push("FINANCIAL_PERIOD_NOT_INCLUDED");
      }
    }

    applyNullableRange(company.employeeCount, {
      minimum: query.minEmployees,
      maximum: query.maxEmployees,
      missingDataPolicy: query.missingDataPolicy,
      missingReason: "EMPLOYEE_COUNT_NOT_AVAILABLE",
      belowReason: "EMPLOYEE_COUNT_BELOW_MINIMUM",
      aboveReason: "EMPLOYEE_COUNT_ABOVE_MAXIMUM",
    }, reasons, gaps);
    applyNullableRange(company.financials?.revenue ?? null, {
      minimum: query.minRevenue,
      maximum: query.maxRevenue,
      missingDataPolicy: query.missingDataPolicy,
      missingReason: "REVENUE_NOT_AVAILABLE",
      belowReason: "REVENUE_BELOW_MINIMUM",
      aboveReason: "REVENUE_ABOVE_MAXIMUM",
    }, reasons, gaps);
    applyNullableRange(company.financials?.operatingMarginBps ?? null, {
      minimum: query.minOperatingMarginBps,
      maximum: query.maxOperatingMarginBps,
      missingDataPolicy: query.missingDataPolicy,
      missingReason: "OPERATING_MARGIN_NOT_AVAILABLE",
      belowReason: "OPERATING_MARGIN_BELOW_MINIMUM",
      aboveReason: "OPERATING_MARGIN_ABOVE_MAXIMUM",
    }, reasons, gaps);

    if (reasons.length > 0) {
      excluded.push({
        orgNumber: company.orgNumber,
        name: company.name,
        companySource: company.companySource,
        sourceBasis: [
          company.companySource,
          ...(company.financials?.source ? [company.financials.source] : []),
        ],
        reasons: [...new Set(reasons)],
      });
    } else {
      matched.push({
        ...company,
        inclusionReasons: ["MATCHED_VERSIONED_UNIVERSE_QUERY"],
        dataGaps: [...new Set(gaps)],
      });
    }
  }
  const included = matched.slice(0, query.limit);

  return {
    version: "company-screening-v1" as const,
    query,
    included,
    matched,
    excluded,
    counts: {
      evaluated: candidates.length,
      included: included.length,
      excluded: excluded.length,
      truncated: Math.max(0, matched.length - included.length),
    },
  };
}

export const rankingCriterionSchema = z.object({
  metric: z.enum(["REVENUE", "OPERATING_MARGIN_BPS", "EMPLOYEE_COUNT"]),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  weight: z.number().int().min(1).max(100),
}).strict();

export type RankingCriterion = z.infer<typeof rankingCriterionSchema>;

function metricValue(company: ScreenedCompany, metric: RankingCriterion["metric"]) {
  if (metric === "REVENUE") return company.financials?.revenue ?? null;
  if (metric === "OPERATING_MARGIN_BPS") return company.financials?.operatingMarginBps ?? null;
  return company.employeeCount;
}

export function rankScreenedCompanies(
  companies: ScreenedCompany[],
  criteria: RankingCriterion[],
) {
  const parsedCriteria = z.array(rankingCriterionSchema).min(1).max(10).parse(criteria);
  const ranges = new Map<RankingCriterion["metric"], { minimum: number; maximum: number }>();
  for (const criterion of parsedCriteria) {
    const values = companies
      .map((company) => metricValue(company, criterion.metric))
      .filter((value): value is number => value != null && Number.isFinite(value));
    if (values.length > 0) ranges.set(criterion.metric, {
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    });
  }

  const scored = companies.map((company) => {
    const trace = parsedCriteria.map((criterion) => {
      const value = metricValue(company, criterion.metric);
      const range = ranges.get(criterion.metric);
      if (value == null || !range) return { ...criterion, value: null, normalizedScore: null };
      const span = range.maximum - range.minimum;
      const ascendingScore = span === 0 ? 100 : ((value - range.minimum) / span) * 100;
      const normalizedScore =
        criterion.direction === "HIGHER_BETTER" ? ascendingScore : 100 - ascendingScore;
      return {
        ...criterion,
        value,
        normalizedScore: Math.round(normalizedScore * 100) / 100,
      };
    });
    const available = trace.filter(
      (item): item is typeof item & { normalizedScore: number } => item.normalizedScore != null,
    );
    const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
    const totalWeight = parsedCriteria.reduce((sum, item) => sum + item.weight, 0);
    const score = availableWeight === 0
      ? null
      : available.reduce((sum, item) => sum + item.normalizedScore * item.weight, 0) / availableWeight;
    return {
      ...company,
      score: score == null ? null : Math.round(score * 100) / 100,
      coveragePercent: Math.round((availableWeight / totalWeight) * 100),
      calculationTrace: trace,
      calculationVersion: "company-ranking-v1" as const,
      fiscalYear: company.financials?.fiscalYear ?? null,
      dataGaps: score == null
        ? [...new Set([...company.dataGaps, "RANKING_DATA_NOT_AVAILABLE"])]
        : company.dataGaps,
    };
  });

  scored.sort((a, b) => {
    if (a.score == null && b.score == null) return a.orgNumber.localeCompare(b.orgNumber);
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score || a.orgNumber.localeCompare(b.orgNumber);
  });
  return scored.map((company, index) => ({ ...company, rank: index + 1 }));
}
