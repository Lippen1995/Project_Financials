export const REVENUE_CLASSES = [
  { value: "UNDER_10M", label: "Under 10 mill. kr", min: null, max: 10_000_000 },
  { value: "FROM_10M_TO_50M", label: "10–50 mill. kr", min: 10_000_000, max: 50_000_000 },
  { value: "FROM_50M_TO_250M", label: "50–250 mill. kr", min: 50_000_000, max: 250_000_000 },
  { value: "FROM_250M_TO_1B", label: "250 mill.–1 mrd. kr", min: 250_000_000, max: 1_000_000_000 },
  { value: "OVER_1B", label: "Over 1 mrd. kr", min: 1_000_000_000, max: null },
] as const;

export type RevenueClass = (typeof REVENUE_CLASSES)[number]["value"];
export type CompanySearchScope = "companies" | "industries" | "bankruptcies";

export type StoredSearchSector = {
  code: string;
  title: string | null;
};

export type SearchHistoryRecord = {
  query: string | null;
  scope?: string | null;
  industryCode?: string | null;
  city: string | null;
  legalForm: string | null;
  status: string | null;
  revenueClass: string | null;
  aiAssisted: boolean;
  resultCount: number;
  succeeded: boolean;
  sectors: StoredSearchSector[];
  searchedAt: Date;
};

export type SearchHistoryFrequency = {
  label: string;
  count: number;
  share: number;
};

export type SearchHistorySummary = {
  totalSearches: number;
  searchesLast30Days: number;
  uniqueQueries: number;
  averageResultCount: number;
  aiSearchShare: number;
  topQueries: SearchHistoryFrequency[];
  topSectors: SearchHistoryFrequency[];
  topRevenueClasses: SearchHistoryFrequency[];
  topLocations: SearchHistoryFrequency[];
  topLegalForms: SearchHistoryFrequency[];
  topStatuses: SearchHistoryFrequency[];
  dailyActivity: Array<{ date: string; count: number }>;
};

export function isRevenueClass(value: unknown): value is RevenueClass {
  return REVENUE_CLASSES.some((item) => item.value === value);
}

export function getRevenueClassLabel(value: string | null | undefined) {
  return REVENUE_CLASSES.find((item) => item.value === value)?.label ?? null;
}

export function filterRowsByRevenueClass<T extends { revenue?: number | null }>(
  rows: T[],
  revenueClass: RevenueClass | "",
) {
  if (!revenueClass) return rows;

  const selected = REVENUE_CLASSES.find((item) => item.value === revenueClass);
  if (!selected) return rows;

  return rows.filter((row) => {
    if (row.revenue == null) return false;
    if (selected.min !== null && row.revenue < selected.min) return false;
    if (selected.max !== null && row.revenue >= selected.max) return false;
    return true;
  });
}

function frequency(
  values: ReadonlyArray<string | null | undefined>,
  denominator: number,
  limit = 5,
): SearchHistoryFrequency[] {
  const counts = new Map<string, number>();
  for (const value of values.map((item) => item?.trim() ?? "").filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts, ([label, count]) => ({
    label,
    count,
    share: denominator > 0 ? Math.round((count / denominator) * 100) : 0,
  }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "nb-NO"))
    .slice(0, limit);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function summarizeSearchHistory(
  records: SearchHistoryRecord[],
  now = new Date(),
): SearchHistorySummary {
  const totalSearches = records.length;
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setUTCDate(fourteenDaysAgo.getUTCDate() - 13);
  fourteenDaysAgo.setUTCHours(0, 0, 0, 0);

  const queries = records
    .map((record) => record.query?.trim().toLocaleLowerCase("nb-NO") ?? "")
    .filter(Boolean);
  const revenueLabels = records.map((record) => getRevenueClassLabel(record.revenueClass));
  const sectors = records.flatMap((record) =>
    record.sectors.map((sector) => sector.title?.trim() || sector.code),
  );

  const activityCounts = new Map<string, number>();
  for (const record of records) {
    if (record.searchedAt >= fourteenDaysAgo && record.searchedAt <= now) {
      const key = dateKey(record.searchedAt);
      activityCounts.set(key, (activityCounts.get(key) ?? 0) + 1);
    }
  }

  const dailyActivity = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(fourteenDaysAgo);
    date.setUTCDate(date.getUTCDate() + index);
    const key = dateKey(date);
    return { date: key, count: activityCounts.get(key) ?? 0 };
  });

  return {
    totalSearches,
    searchesLast30Days: records.filter((record) => record.searchedAt >= thirtyDaysAgo).length,
    uniqueQueries: new Set(queries).size,
    averageResultCount:
      totalSearches > 0
        ? Math.round(records.reduce((sum, record) => sum + record.resultCount, 0) / totalSearches)
        : 0,
    aiSearchShare:
      totalSearches > 0
        ? Math.round((records.filter((record) => record.aiAssisted).length / totalSearches) * 100)
        : 0,
    topQueries: frequency(queries, totalSearches),
    topSectors: frequency(sectors, totalSearches),
    topRevenueClasses: frequency(revenueLabels, totalSearches),
    topLocations: frequency(
      records.map((record) => record.city ?? "").filter(Boolean),
      totalSearches,
    ),
    topLegalForms: frequency(
      records.map((record) => record.legalForm ?? "").filter(Boolean),
      totalSearches,
    ),
    topStatuses: frequency(
      records.map((record) => record.status ?? "").filter(Boolean),
      totalSearches,
    ),
    dailyActivity,
  };
}

export function buildSearchHistoryHref(input: {
  query?: string | null;
  scope?: string | null;
  industryCode?: string | null;
  city?: string | null;
  legalForm?: string | null;
  status?: string | null;
  revenueClass?: string | null;
  aiAssisted?: boolean;
  searchEventId?: string;
}) {
  const params = new URLSearchParams();
  if (input.query) params.set("query", input.query);
  if (input.scope && input.scope !== "companies") params.set("scope", input.scope);
  if (input.industryCode) params.set("industryCode", input.industryCode);
  if (input.city) params.set("city", input.city);
  if (input.legalForm) params.set("legalForm", input.legalForm);
  if (input.status) params.set("status", input.status);
  if (input.revenueClass) params.set("revenueClass", input.revenueClass);
  if (input.aiAssisted) params.set("ai", "1");
  if (input.searchEventId) params.set("searchEventId", input.searchEventId);
  return `/search?${params.toString()}`;
}
