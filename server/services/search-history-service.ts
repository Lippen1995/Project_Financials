import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  AI_SEARCH_RESERVATION_TOKENS,
  createAiSearchUsageStatus,
  getSearchHistoryCutoff,
  type AiSearchUsageStatus,
  type AiSearchBillingPeriod,
  type AiTokenUsage,
} from "@/lib/ai-search-usage";
import {
  isRevenueClass,
  getRevenueClassLabel,
  type CompanySearchScope,
  type RevenueClass,
  type SearchHistoryRecord,
  type SearchHistorySummary,
  type StoredSearchSector,
} from "@/lib/search-history";
import env from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  canReserveNjordCost,
  estimateNjordCostNok,
} from "@/server/ai-search/runtime-policy";
import {
  AI_ECONOMICS_RUNTIME_LOCK_KEY,
  canReserveWithinAllowance,
} from "@/server/ai-economics/domain";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

type SearchHistoryDbRow = {
  id: string;
  query: string | null;
  scope: string;
  industryCode: string | null;
  city: string | null;
  legalForm: string | null;
  companyStatus: string | null;
  revenueClass: string | null;
  aiAssisted: boolean;
  resultCount: number;
  succeeded: boolean;
  sectors: unknown;
  searchedAt: Date;
};

export type SearchHistoryItem = SearchHistoryRecord & {
  id: string;
  scope: CompanySearchScope;
  industryCode: string | null;
};

export type SearchHistoryDashboard = {
  items: SearchHistoryItem[];
  page: number;
  pageSize: number;
  pageCount: number;
  totalCount: number;
  summary: SearchHistorySummary;
  aiUsage: AiSearchUsageStatus & {
    aiSearches: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  };
};

export type RecordCompanySearchInput = {
  userId: string;
  eventKey?: string | null;
  query?: string | null;
  scope?: CompanySearchScope;
  industryCode?: string | null;
  city?: string | null;
  legalForm?: string | null;
  status?: string | null;
  revenueClass?: RevenueClass | "" | null;
  aiAssisted?: boolean;
  resultCount: number;
  succeeded: boolean;
  sectors?: StoredSearchSector[];
};

function normalizeOptional(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeScope(value: string): CompanySearchScope {
  return value === "industries" || value === "bankruptcies" ? value : "companies";
}

function normalizeSectors(value: unknown): StoredSearchSector[] {
  if (!Array.isArray(value)) return [];

  const sectors = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const code = "code" in item && typeof item.code === "string" ? item.code.trim() : "";
      const title =
        "title" in item && typeof item.title === "string" ? item.title.trim() || null : null;
      return code ? { code: code.slice(0, 32), title: title?.slice(0, 200) ?? null } : null;
    })
    .filter((item): item is StoredSearchSector => Boolean(item));

  return Array.from(new Map(sectors.map((sector) => [sector.code, sector])).values()).slice(0, 10);
}

function toHistoryItem(row: SearchHistoryDbRow): SearchHistoryItem {
  return {
    id: row.id,
    query: row.query,
    scope: normalizeScope(row.scope),
    industryCode: row.industryCode,
    city: row.city,
    legalForm: row.legalForm,
    status: row.companyStatus,
    revenueClass: row.revenueClass,
    aiAssisted: row.aiAssisted,
    resultCount: row.resultCount,
    succeeded: row.succeeded,
    sectors: normalizeSectors(row.sectors),
    searchedAt: row.searchedAt,
  };
}

export function hasMeaningfulCompanySearch(input: Pick<
  RecordCompanySearchInput,
  "query" | "industryCode" | "city" | "legalForm" | "status" | "revenueClass"
>) {
  return Boolean(
    input.query?.trim() ||
      input.industryCode?.trim() ||
      input.city?.trim() ||
      input.legalForm?.trim() ||
      input.status?.trim() ||
      input.revenueClass,
  );
}

export async function recordCompanySearch(input: RecordCompanySearchInput) {
  if (!hasMeaningfulCompanySearch(input)) return null;

  const id = randomUUID();
  const eventKey = normalizeOptional(input.eventKey, 64);
  const query = normalizeOptional(input.query, 200);
  const industryCode = normalizeOptional(input.industryCode, 32);
  const city = normalizeOptional(input.city, 120);
  const legalForm = normalizeOptional(input.legalForm, 32);
  const status = normalizeOptional(input.status, 32);
  const revenueClass = isRevenueClass(input.revenueClass) ? input.revenueClass : null;
  const sectors = normalizeSectors(input.sectors);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CompanySearchEvent" (
      "id", "userId", "eventKey", "query", "scope", "industryCode", "city", "legalForm",
      "companyStatus", "revenueClass", "aiAssisted", "resultCount", "succeeded", "sectors"
    ) VALUES (
      ${id}, ${input.userId}, ${eventKey}, ${query}, ${input.scope ?? "companies"}, ${industryCode}, ${city},
      ${legalForm}, ${status}, ${revenueClass}, ${Boolean(input.aiAssisted)},
      ${Math.max(0, Math.trunc(input.resultCount))}, ${input.succeeded},
      CAST(${JSON.stringify(sectors)} AS JSONB)
    )
    ON CONFLICT ("userId", "eventKey") DO NOTHING
  `);

  return id;
}

type FrequencyDbRow = { label: string; count: bigint };

function toFrequency(rows: FrequencyDbRow[], total: number, labelFor?: (value: string) => string | null) {
  return rows.flatMap((row) => {
    const label = labelFor?.(row.label) ?? row.label;
    if (!label) return [];
    const count = Number(row.count);
    return [{ label, count, share: total > 0 ? Math.round((count / total) * 100) : 0 }];
  });
}

function statusLabel(value: string) {
  if (value === "ACTIVE") return "Aktiv";
  if (value === "DISSOLVED") return "Avviklet";
  if (value === "BANKRUPT") return "Konkurs";
  return value;
}

async function getSearchHistorySummary(userId: string): Promise<SearchHistorySummary> {
  const cutoff = getSearchHistoryCutoff();
  const [metrics, queries, sectors, revenueClasses, locations, legalForms, statuses, activity] =
    await Promise.all([
      prisma.$queryRaw<Array<{
        recent: bigint;
        uniqueQueries: bigint;
        averageResultCount: number;
        aiSearchShare: number;
      }>>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "recent",
          COUNT(DISTINCT LOWER(TRIM("query"))) FILTER (WHERE NULLIF(TRIM("query"), '') IS NOT NULL)::bigint AS "uniqueQueries",
          COALESCE(ROUND(AVG("resultCount")), 0)::int AS "averageResultCount",
          COALESCE(ROUND(100 * AVG(CASE WHEN "aiAssisted" THEN 1 ELSE 0 END)), 0)::int AS "aiSearchShare"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff}
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT LOWER(TRIM("query")) AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff} AND NULLIF(TRIM("query"), '') IS NOT NULL
        GROUP BY LOWER(TRIM("query"))
        ORDER BY "count" DESC, "label" ASC
        LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(sector->>'title', ''), sector->>'code') AS "label",
               COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        CROSS JOIN LATERAL jsonb_array_elements("sectors") AS sector
        WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff} AND NULLIF(sector->>'code', '') IS NOT NULL
        GROUP BY COALESCE(NULLIF(sector->>'title', ''), sector->>'code')
        ORDER BY "count" DESC, "label" ASC
        LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "revenueClass" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff} AND "revenueClass" IS NOT NULL
        GROUP BY "revenueClass"
        ORDER BY "count" DESC, "label" ASC
        LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "city" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff} AND "city" IS NOT NULL
        GROUP BY "city" ORDER BY "count" DESC, "label" ASC LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "legalForm" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff} AND "legalForm" IS NOT NULL
        GROUP BY "legalForm" ORDER BY "count" DESC, "label" ASC LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "companyStatus" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff} AND "companyStatus" IS NOT NULL
        GROUP BY "companyStatus" ORDER BY "count" DESC, "label" ASC LIMIT 5
      `),
      prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(Prisma.sql`
        SELECT days.day AS "date", COUNT(events."id")::bigint AS "count"
        FROM generate_series(
          (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Oslo')::date - INTERVAL '13 days',
          (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Oslo')::date,
          INTERVAL '1 day'
        ) AS days(day)
        LEFT JOIN "CompanySearchEvent" events
          ON events."userId" = ${userId}
         AND events."searchedAt" >= ${cutoff}
         AND (events."searchedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Oslo')::date = days.day::date
        GROUP BY days.day
        ORDER BY days.day ASC
      `),
    ]);

  const metric = metrics[0];
  const total = Number(metric?.recent ?? 0);
  return {
    searchesLast30Days: Number(metric?.recent ?? 0),
    uniqueQueries: Number(metric?.uniqueQueries ?? 0),
    averageResultCount: metric?.averageResultCount ?? 0,
    aiSearchShare: metric?.aiSearchShare ?? 0,
    topQueries: toFrequency(queries, total),
    topSectors: toFrequency(sectors, total),
    topRevenueClasses: toFrequency(revenueClasses, total, getRevenueClassLabel),
    topLocations: toFrequency(locations, total),
    topLegalForms: toFrequency(legalForms, total),
    topStatuses: toFrequency(statuses, total, statusLabel),
    dailyActivity: activity.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      count: Number(row.count),
    })),
  };
}

export async function getSearchHistoryDashboard(
  userId: string,
  options: {
    page?: number;
    pageSize?: number;
    premium?: boolean;
    billingPeriod?: AiSearchBillingPeriod | null;
    tokenLimit?: number;
  } = {},
): Promise<SearchHistoryDashboard> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;
  const cutoff = getSearchHistoryCutoff();
  const usagePeriodStart = options.billingPeriod?.periodStart ?? new Date();
  const usagePeriodEnd = options.billingPeriod?.periodEnd ?? new Date();

  const [items, countRows, summary, usageRows] = await Promise.all([
    prisma.$queryRaw<SearchHistoryDbRow[]>(Prisma.sql`
      SELECT "id", "query", "scope", "industryCode", "city", "legalForm",
             "companyStatus", "revenueClass", "aiAssisted", "resultCount", "succeeded",
             "sectors", "searchedAt"
      FROM "CompanySearchEvent"
      WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff}
      ORDER BY "searchedAt" DESC, "id" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "CompanySearchEvent"
      WHERE "userId" = ${userId} AND "searchedAt" >= ${cutoff}
    `),
    getSearchHistorySummary(userId),
    prisma.$queryRaw<Array<{
      aiSearches: bigint;
      inputTokens: bigint;
      cachedInputTokens: bigint;
      outputTokens: bigint;
      usageTokens: bigint;
    }>>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'RECORDED')::bigint AS "aiSearches",
        COALESCE(SUM("inputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "inputTokens",
        COALESCE(SUM("cachedInputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "cachedInputTokens",
        COALESCE(SUM("outputTokens") FILTER (WHERE "status" IN ('RECORDED', 'FAILED')), 0)::bigint AS "outputTokens",
        COALESCE(SUM(
          CASE
            WHEN "status" IN ('RECORDED', 'FAILED') AND "occurredAt" >= ${usagePeriodStart} AND "occurredAt" < ${usagePeriodEnd} THEN "usageTokens"
            WHEN "status" = 'RESERVED' AND "expiresAt" > NOW() THEN "reservedTokens"
            ELSE 0
          END
        ), 0)::bigint AS "usageTokens"
      FROM "AiSearchUsageEvent"
      WHERE "userId" = ${userId}
        AND (("status" IN ('RECORDED', 'FAILED') AND "occurredAt" >= ${usagePeriodStart} AND "occurredAt" < ${usagePeriodEnd}) OR ("status" = 'RESERVED' AND "expiresAt" > NOW()))
    `),
  ]);

  const totalCount = Number(countRows[0]?.count ?? 0);
  const usage = usageRows[0];
  const aiUsage = createAiSearchUsageStatus(
    Boolean(options.premium),
    Number(usage?.usageTokens ?? 0),
    options.billingPeriod,
    options.tokenLimit,
  );
  return {
    items: items.map(toHistoryItem),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    totalCount,
    summary,
    aiUsage: {
      ...aiUsage,
      aiSearches: Number(usage?.aiSearches ?? 0),
      inputTokens: Number(usage?.inputTokens ?? 0),
      cachedInputTokens: Number(usage?.cachedInputTokens ?? 0),
      outputTokens: Number(usage?.outputTokens ?? 0),
    },
  };
}

export async function getAiSearchUsageStatus(
  userId: string,
  premium: boolean,
  billingPeriod: AiSearchBillingPeriod | null,
  tokenLimit?: number,
) {
  const periodStart = billingPeriod?.periodStart ?? new Date();
  const periodEnd = billingPeriod?.periodEnd ?? new Date();
  const rows = await prisma.$queryRaw<Array<{ usageTokens: bigint }>>(Prisma.sql`
    SELECT COALESCE(SUM(
      CASE
        WHEN "status" IN ('RECORDED', 'FAILED') AND "occurredAt" >= ${periodStart} AND "occurredAt" < ${periodEnd} THEN "usageTokens"
        WHEN "status" = 'RESERVED' AND "expiresAt" > NOW() THEN "reservedTokens"
        ELSE 0
      END
    ), 0)::bigint AS "usageTokens"
    FROM "AiSearchUsageEvent"
    WHERE "userId" = ${userId}
  `);
  return createAiSearchUsageStatus(
    premium,
    Number(rows[0]?.usageTokens ?? 0),
    billingPeriod,
    tokenLimit,
  );
}

export type AiSearchReservationPolicy = {
  settingsVersion: number;
  planEconomicsVersion: number | null;
  usageCategory: "CUSTOMER" | "INTERNAL_ADMIN" | "INTERNAL_REVIEWER";
  appRole: "USER" | "ADMIN" | "FINANCIAL_REVIEWER";
  subscriptionPlan: string | null;
  subscriptionStatus: "FREE" | "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED" | null;
  subscriptionUpdatedAt: Date | null;
};

export async function reserveAiSearchUsage(
  userId: string,
  billingPeriod: AiSearchBillingPeriod,
  policy: AiSearchReservationPolicy,
) {
  const now = new Date();
  const periodStart = billingPeriod.periodStart;
  const periodEnd = billingPeriod.periodEnd;
  const globalPeriodStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1,
  ));
  const globalPeriodEnd = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
  ));
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1_000);

  return prisma.$transaction(async (transaction) => {
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns SQL `void`, which $queryRaw cannot
    // deserialize (it throws "Failed to deserialize column of type 'void'"). We only need the lock's
    // side effect, so execute it without materializing a result set.
    // The shared economics lock is always acquired before the per-user token lock. Admin writes
    // use the same lock, so a completed pause or limit update cannot be followed by a stale
    // reservation. The fixed order also protects the remaining monthly NOK budget.
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${AI_ECONOMICS_RUNTIME_LOCK_KEY}, 0)
      )
    `);
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `);
    const [settings, currentUser] = await Promise.all([
      transaction.aiEconomicsSettings.findUnique({ where: { id: "global" } }),
      transaction.user.findUnique({
        where: { id: userId },
        select: {
          appRole: true,
          subscription: true,
        },
      }),
    ]);
    if (
      !settings?.runtimeEnabled ||
      settings.version !== policy.settingsVersion ||
      !currentUser ||
      currentUser.appRole !== policy.appRole ||
      (currentUser.subscription?.plan ?? null) !== policy.subscriptionPlan ||
      (currentUser.subscription?.status ?? null) !== policy.subscriptionStatus ||
      (currentUser.subscription?.updatedAt?.getTime() ?? null) !==
        (policy.subscriptionUpdatedAt?.getTime() ?? null)
    ) {
      return null;
    }
    const internal =
      currentUser.appRole === "ADMIN" ||
      currentUser.appRole === "FINANCIAL_REVIEWER";
    const effectiveUsageCategory = currentUser.appRole === "ADMIN"
      ? "INTERNAL_ADMIN"
      : currentUser.appRole === "FINANCIAL_REVIEWER"
        ? "INTERNAL_REVIEWER"
        : "CUSTOMER";
    const currentPlan = !internal && currentUser.subscription?.plan
      ? await transaction.aiSubscriptionPlanEconomics.findUnique({
          where: { planKey: currentUser.subscription.plan },
        })
      : null;
    if (
      (!internal &&
        (
          currentUser.subscription?.status !== "ACTIVE" ||
          !currentPlan?.active ||
          currentPlan.version !== policy.planEconomicsVersion
        )) ||
      (internal && policy.planEconomicsVersion != null) ||
      policy.usageCategory !== effectiveUsageCategory
    ) {
      return null;
    }
    const effectiveTokenLimit = internal
      ? settings.internalMonthlyTokenAllowance
      : currentPlan?.includedAiUsageTokens ?? 0;
    const effectiveUserCostLimitNok = internal
      ? null
      : Number(currentPlan?.includedAiCostNok ?? 0);
    const effectiveRequestCostLimitNok = Number(settings.requestCostLimitNok);
    const effectiveMonthlyCostLimitNok = Number(settings.globalMonthlyBudgetNok);
    const usageRows = await transaction.$queryRaw<Array<{
      usageTokens: bigint;
      costNok: Prisma.Decimal;
      dailyRequests: bigint;
    }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(CASE
          WHEN "status" IN ('RECORDED', 'FAILED') AND "occurredAt" >= ${periodStart} AND "occurredAt" < ${periodEnd} THEN "usageTokens"
          WHEN "status" = 'RESERVED' AND "expiresAt" > ${now} THEN "reservedTokens"
          ELSE 0
        END), 0)::bigint AS "usageTokens",
        COALESCE(SUM(CASE
          WHEN "status" IN ('RECORDED', 'FAILED') AND "occurredAt" >= ${periodStart} AND "occurredAt" < ${periodEnd}
            THEN COALESCE("budgetedCostNok", "estimatedCostNok", 0)
          WHEN "status" = 'RESERVED' AND "expiresAt" > ${now} THEN "reservedCostNok"
          ELSE 0
        END), 0)::numeric AS "costNok",
        COUNT(*) FILTER (
          WHERE (
            "status" IN ('RECORDED', 'FAILED')
            AND "occurredAt" >= ${new Date(now.getTime() - 24 * 60 * 60 * 1_000)}
          ) OR (
            "status" = 'RESERVED'
            AND "expiresAt" > ${now}
          )
        )::bigint AS "dailyRequests"
      FROM "AiSearchUsageEvent"
      WHERE "userId" = ${userId}
    `);
    const costRows = await transaction.$queryRaw<Array<{
      costNok: Prisma.Decimal;
    }>>(Prisma.sql`
      SELECT COALESCE(SUM(
        CASE
          WHEN "status" IN ('RECORDED', 'FAILED')
            AND "occurredAt" >= ${globalPeriodStart}
            AND "occurredAt" < ${globalPeriodEnd}
            THEN COALESCE("budgetedCostNok", "estimatedCostNok", 0)
          WHEN "status" = 'RESERVED' AND "expiresAt" > ${now}
            THEN "reservedCostNok"
          ELSE 0
        END
      ), 0)::numeric AS "costNok"
      FROM "AiSearchUsageEvent"
    `);
    const usedTokens = Number(usageRows[0]?.usageTokens ?? 0);
    if (Number(usageRows[0]?.dailyRequests ?? 0) >= settings.dailyRequestLimit) {
      return null;
    }
    if (usedTokens + AI_SEARCH_RESERVATION_TOKENS > effectiveTokenLimit) {
      return null;
    }
    const usedCostNok = Number(usageRows[0]?.costNok ?? 0);
    if (!canReserveWithinAllowance(
      usedCostNok,
      effectiveRequestCostLimitNok,
      effectiveUserCostLimitNok,
    )) {
      return null;
    }
    if (!canReserveNjordCost({
      recordedAndReservedCostNok: Number(costRows[0]?.costNok ?? 0),
      requestCostLimitNok: effectiveRequestCostLimitNok,
      monthlyCostLimitNok: effectiveMonthlyCostLimitNok,
    })) {
      return null;
    }

    const id = randomUUID();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "AiSearchUsageEvent" (
        "id", "userId", "status", "reservedTokens", "reservedCostNok", "expiresAt",
        "usageCategory", "appRoleAtUsage", "subscriptionPlanAtUsage",
        "subscriptionStatusAtUsage", "settingsVersion"
      ) VALUES (
        ${id}, ${userId}, 'RESERVED', ${AI_SEARCH_RESERVATION_TOKENS},
        ${effectiveRequestCostLimitNok}, ${expiresAt},
        ${effectiveUsageCategory}::"AiUsageCategory", ${policy.appRole}::"AppRole",
        ${policy.subscriptionPlan},
        ${policy.subscriptionStatus}::"SubscriptionStatus", ${policy.settingsVersion}
      )
    `);
    return id;
  });
}

export async function finalizeAiSearchUsage(
  userId: string,
  reservationId: string,
  usage: AiTokenUsage,
) {
  const estimatedCostNok = usage.estimatedCostNok ?? estimateNjordCostNok(usage, {
    inputNokPerMillion: env.njordInputNokPerMillion,
    cachedInputNokPerMillion: env.njordCachedInputNokPerMillion,
    outputNokPerMillion: env.njordOutputNokPerMillion,
  });
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "AiSearchUsageEvent"
    SET "status" = 'RECORDED',
        "reservedTokens" = 0,
        "reservedCostNok" = 0,
        "model" = ${usage.model},
        "inputTokens" = ${Math.max(0, Math.trunc(usage.inputTokens))},
        "cachedInputTokens" = ${Math.max(0, Math.trunc(usage.cachedInputTokens))},
        "outputTokens" = ${Math.max(0, Math.trunc(usage.outputTokens))},
        "usageTokens" = ${Math.max(0, Math.trunc(usage.usageTokens))},
        "estimatedCostNok" = ${estimatedCostNok},
        "providerCurrency" = ${usage.providerCurrency ?? null},
        "providerCostAmount" = ${usage.providerCostAmount ?? null},
        "exchangeRateNok" = ${usage.exchangeRateNok ?? null},
        "fxRiskBufferBps" = ${usage.fxRiskBufferBps ?? null},
        "budgetedCostNok" = ${usage.budgetedCostNok ?? estimatedCostNok},
        "durationMs" = ${usage.durationMs == null ? null : Math.max(0, Math.trunc(usage.durationMs))},
        "errorCode" = NULL,
        "sourceSystem" = ${usage.sourceSystem},
        "sourceEntityType" = ${usage.sourceEntityType},
        "sourceId" = ${usage.sourceId},
        "fetchedAt" = ${usage.fetchedAt},
        "normalizedAt" = ${usage.normalizedAt},
        "occurredAt" = ${usage.fetchedAt}
    WHERE "id" = ${reservationId} AND "userId" = ${userId} AND "status" = 'RESERVED'
  `);
}

export async function failAiSearchUsage(
  userId: string,
  reservationId: string,
  failure: {
    errorCode: string;
    durationMs: number;
    usage?: AiTokenUsage;
    /** Keep the full reserved allowance charged when provider usage cannot be reconciled. */
    retainReservation?: boolean;
  },
) {
  const occurredAt = new Date();
  if (failure.usage) {
    const usage = failure.usage;
    const estimatedCostNok = usage.estimatedCostNok ?? estimateNjordCostNok(usage, {
      inputNokPerMillion: env.njordInputNokPerMillion,
      cachedInputNokPerMillion: env.njordCachedInputNokPerMillion,
      outputNokPerMillion: env.njordOutputNokPerMillion,
    });
    return prisma.$executeRaw(Prisma.sql`
      UPDATE "AiSearchUsageEvent"
      SET "status" = 'FAILED',
          "reservedTokens" = 0,
          "reservedCostNok" = 0,
          "model" = ${usage.model},
          "inputTokens" = ${Math.max(0, Math.trunc(usage.inputTokens))},
          "cachedInputTokens" = ${Math.max(0, Math.trunc(usage.cachedInputTokens))},
          "outputTokens" = ${Math.max(0, Math.trunc(usage.outputTokens))},
          "usageTokens" = ${Math.max(0, Math.trunc(usage.usageTokens))},
          "estimatedCostNok" = ${estimatedCostNok},
          "providerCurrency" = ${usage.providerCurrency ?? null},
          "providerCostAmount" = ${usage.providerCostAmount ?? null},
          "exchangeRateNok" = ${usage.exchangeRateNok ?? null},
          "fxRiskBufferBps" = ${usage.fxRiskBufferBps ?? null},
          "budgetedCostNok" = ${usage.budgetedCostNok ?? estimatedCostNok},
          "durationMs" = ${Math.max(0, Math.trunc(failure.durationMs))},
          "errorCode" = ${failure.errorCode.slice(0, 100)},
          "sourceSystem" = ${usage.sourceSystem},
          "sourceEntityType" = ${usage.sourceEntityType},
          "sourceId" = ${usage.sourceId},
          "fetchedAt" = ${usage.fetchedAt},
          "normalizedAt" = ${usage.normalizedAt},
          "occurredAt" = ${usage.fetchedAt}
      WHERE "id" = ${reservationId} AND "userId" = ${userId} AND "status" = 'RESERVED'
    `);
  }
  if (failure.retainReservation) {
    return prisma.$executeRaw(Prisma.sql`
      UPDATE "AiSearchUsageEvent"
      SET "status" = 'FAILED',
          "usageTokens" = "reservedTokens",
          "budgetedCostNok" = "reservedCostNok",
          "reservedTokens" = 0,
          "reservedCostNok" = 0,
          "durationMs" = ${Math.max(0, Math.trunc(failure.durationMs))},
          "errorCode" = ${failure.errorCode.slice(0, 100)},
          "occurredAt" = ${occurredAt}
      WHERE "id" = ${reservationId} AND "userId" = ${userId} AND "status" = 'RESERVED'
    `);
  }
  return prisma.$executeRaw(Prisma.sql`
    UPDATE "AiSearchUsageEvent"
    SET "status" = 'FAILED',
        "reservedTokens" = 0,
        "reservedCostNok" = 0,
        "durationMs" = ${Math.max(0, Math.trunc(failure.durationMs))},
        "errorCode" = ${failure.errorCode.slice(0, 100)},
        "occurredAt" = ${occurredAt}
    WHERE "id" = ${reservationId} AND "userId" = ${userId} AND "status" = 'RESERVED'
  `);
}

export async function releaseAiSearchUsage(userId: string, reservationId: string) {
  return prisma.$executeRaw(Prisma.sql`
    DELETE FROM "AiSearchUsageEvent"
    WHERE "id" = ${reservationId} AND "userId" = ${userId} AND "status" = 'RESERVED'
  `);
}

export async function deleteExpiredSearchHistory(now = new Date()) {
  const cutoff = getSearchHistoryCutoff(now);
  const [history, reservations, aiJobs, backgroundJobRuns] = await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "CompanySearchEvent"
      WHERE "searchedAt" < ${cutoff}
    `),
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "AiSearchUsageEvent"
      WHERE "status" = 'RESERVED' AND "expiresAt" <= ${now}
    `),
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "AiSearchJob"
      WHERE "createdAt" < ${cutoff}
    `),
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM "BackgroundJobRun"
      WHERE "createdAt" < ${cutoff}
    `),
  ]);
  return history + reservations + aiJobs + backgroundJobRuns;
}
