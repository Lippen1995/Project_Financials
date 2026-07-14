import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import {
  isRevenueClass,
  getRevenueClassLabel,
  type CompanySearchScope,
  type RevenueClass,
  type SearchHistoryRecord,
  type SearchHistorySummary,
  type StoredSearchSector,
} from "@/lib/search-history";
import { prisma } from "@/lib/prisma";

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
  const [metrics, queries, sectors, revenueClasses, locations, legalForms, statuses, activity] =
    await Promise.all([
      prisma.$queryRaw<Array<{
        total: bigint;
        recent: bigint;
        uniqueQueries: bigint;
        averageResultCount: number;
        aiSearchShare: number;
      }>>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "total",
          COUNT(*) FILTER (WHERE "searchedAt" >= NOW() - INTERVAL '30 days')::bigint AS "recent",
          COUNT(DISTINCT LOWER(TRIM("query"))) FILTER (WHERE NULLIF(TRIM("query"), '') IS NOT NULL)::bigint AS "uniqueQueries",
          COALESCE(ROUND(AVG("resultCount")), 0)::int AS "averageResultCount",
          COALESCE(ROUND(100 * AVG(CASE WHEN "aiAssisted" THEN 1 ELSE 0 END)), 0)::int AS "aiSearchShare"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId}
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT LOWER(TRIM("query")) AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND NULLIF(TRIM("query"), '') IS NOT NULL
        GROUP BY LOWER(TRIM("query"))
        ORDER BY "count" DESC, "label" ASC
        LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT COALESCE(NULLIF(sector->>'title', ''), sector->>'code') AS "label",
               COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        CROSS JOIN LATERAL jsonb_array_elements("sectors") AS sector
        WHERE "userId" = ${userId} AND NULLIF(sector->>'code', '') IS NOT NULL
        GROUP BY COALESCE(NULLIF(sector->>'title', ''), sector->>'code')
        ORDER BY "count" DESC, "label" ASC
        LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "revenueClass" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "revenueClass" IS NOT NULL
        GROUP BY "revenueClass"
        ORDER BY "count" DESC, "label" ASC
        LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "city" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "city" IS NOT NULL
        GROUP BY "city" ORDER BY "count" DESC, "label" ASC LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "legalForm" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "legalForm" IS NOT NULL
        GROUP BY "legalForm" ORDER BY "count" DESC, "label" ASC LIMIT 5
      `),
      prisma.$queryRaw<FrequencyDbRow[]>(Prisma.sql`
        SELECT "companyStatus" AS "label", COUNT(*)::bigint AS "count"
        FROM "CompanySearchEvent"
        WHERE "userId" = ${userId} AND "companyStatus" IS NOT NULL
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
         AND (events."searchedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Oslo')::date = days.day::date
        GROUP BY days.day
        ORDER BY days.day ASC
      `),
    ]);

  const metric = metrics[0];
  const total = Number(metric?.total ?? 0);
  return {
    totalSearches: total,
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
  options: { page?: number; pageSize?: number } = {},
): Promise<SearchHistoryDashboard> {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(options.pageSize ?? DEFAULT_PAGE_SIZE)));
  const offset = (page - 1) * pageSize;

  const [items, countRows, summary] = await Promise.all([
    prisma.$queryRaw<SearchHistoryDbRow[]>(Prisma.sql`
      SELECT "id", "query", "scope", "industryCode", "city", "legalForm",
             "companyStatus", "revenueClass", "aiAssisted", "resultCount", "succeeded",
             "sectors", "searchedAt"
      FROM "CompanySearchEvent"
      WHERE "userId" = ${userId}
      ORDER BY "searchedAt" DESC, "id" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "CompanySearchEvent"
      WHERE "userId" = ${userId}
    `),
    getSearchHistorySummary(userId),
  ]);

  const totalCount = Number(countRows[0]?.count ?? 0);
  return {
    items: items.map(toHistoryItem),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    totalCount,
    summary,
  };
}
