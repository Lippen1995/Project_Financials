import { DistressStatus, WorkspaceWatchStatus } from "@prisma/client";

import type { FinancialDisclosure } from "@/lib/financial-simulation-disclosure";
import type { FinancialDatasetVersion, FinancialValueOrigin } from "@/lib/types";
import { combineFinancialValueOrigins } from "@/lib/financial-value-origin";
import { prisma } from "@/lib/prisma";
import { getDashboardRelevantInsights } from "@/server/news/dashboard-insights-service";
import {
  watchlistFinancialsService,
  type WatchlistFinancialStatement,
} from "@/server/services/watchlist-financials-service";

const TREND_YEARS = 5;
const WATCH_LIMIT = 6;
const BANKRUPTCY_LIMIT = 6;
const BANKRUPTCY_LOOKBACK_DAYS = 60;

export type OversiktWatchRow = {
  name: string;
  slug: string;
  /** Revenue in NOK, oldest → newest. */
  revenueSeries: number[];
  revenueOrigins: Array<FinancialValueOrigin | null>;
};

export type OversiktNewsRow = {
  id: string;
  tag: string;
  head: string;
  source: string;
  time: string;
  summary: string;
  href: string;
  external: boolean;
};

export type OversiktBankruptcyRow = {
  name: string;
  slug: string;
  sector: string;
  filedDaysAgo: number | null;
  latestRevenue: number | null;
  latestRevenueOrigin: FinancialValueOrigin | null;
  /** Revenue in NOK, oldest → newest. */
  revenueSeries: number[];
  revenueOrigins: Array<FinancialValueOrigin | null>;
  /** EBIT margin in percent, oldest → newest. */
  ebitMarginSeries: number[];
  ebitMarginOrigins: Array<FinancialValueOrigin | null>;
};

export type OversiktDashboardData = {
  watch: OversiktWatchRow[];
  news: OversiktNewsRow[];
  bankruptcies: OversiktBankruptcyRow[];
  bankruptciesLastWeek: number;
  /** Which live dataset every figure on this dashboard came from. */
  financialDatasetVersion: FinancialDatasetVersion;
  /** Presentation contract for every financial figure on this dashboard. */
  financialDisclosure: FinancialDisclosure;
};

type StatementRow = Pick<WatchlistFinancialStatement, "revenue" | "operatingProfit" | "origins">;

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function relativeTimeLabel(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return `${Math.floor(days / 7)} u`;
}

/** Exported for tests: the dashboard's figure assembly, independent of Prisma. */
export function revenueSeries(statements: StatementRow[]) {
  return statements
    .map((statement) => statement.revenue)
    .filter((value): value is number => value != null)
    .slice(-TREND_YEARS);
}

export function revenueOrigins(statements: StatementRow[]) {
  return statements
    .filter((statement) => statement.revenue != null)
    .map((statement) => statement.origins.revenue)
    .slice(-TREND_YEARS);
}

export function ebitMarginSeries(statements: StatementRow[]) {
  return statements
    .map((statement) =>
      statement.revenue == null || statement.operatingProfit == null || statement.revenue === 0
        ? null
        : (statement.operatingProfit / statement.revenue) * 100,
    )
    .filter((value): value is number => value != null)
    .slice(-TREND_YEARS);
}

export function ebitMarginOrigins(statements: StatementRow[]) {
  return statements
    .filter(
      (statement) =>
        statement.revenue != null && statement.operatingProfit != null && statement.revenue !== 0,
    )
    .map((statement) =>
      combineFinancialValueOrigins(
        statement.origins.operatingProfit,
        statement.origins.revenue,
      ),
    )
    .slice(-TREND_YEARS);
}

/** Watched companies, identity only. Figures come from the live dataset afterwards. */
async function getWatchedCompanies(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastWorkspaceId: true },
  });
  if (!user?.lastWorkspaceId) return [];

  const watches = await prisma.workspaceWatch.findMany({
    where: { workspaceId: user.lastWorkspaceId, status: WorkspaceWatchStatus.ACTIVE },
    orderBy: { updatedAt: "desc" },
    take: WATCH_LIMIT,
    include: { company: { select: { id: true, name: true, slug: true } } },
  });

  return watches.map((watch) => watch.company);
}

/** Recently bankrupt companies, identity and distress context only. */
async function getBankruptCompanies() {
  return prisma.companyDistressProfile.findMany({
    where: {
      distressStatus: DistressStatus.BANKRUPTCY,
      bankruptcyDate: { gte: daysAgo(BANKRUPTCY_LOOKBACK_DAYS) },
    },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          industryCode: { select: { title: true } },
          distressFinancialSnapshot: { select: { sectorLabel: true } },
        },
      },
    },
  });
}

export type BankruptCompany = Awaited<ReturnType<typeof getBankruptCompanies>>[number];

export function toBankruptcyRows(
  profiles: BankruptCompany[],
  statementsByCompany: Record<string, WatchlistFinancialStatement[]>,
): OversiktBankruptcyRow[] {
  const now = new Date();

  return profiles
    .map((profile) => {
      const company = profile.company;
      const statements = statementsByCompany[company.id] ?? [];
      const revenue = revenueSeries(statements);
      const revenueValueOrigins = revenueOrigins(statements);
      const latestRevenue = revenue.at(-1) ?? null;

      return {
        name: company.name,
        slug: company.slug,
        sector:
          company.industryCode?.title ?? company.distressFinancialSnapshot?.sectorLabel ?? "—",
        filedDaysAgo: profile.bankruptcyDate ? daysBetween(profile.bankruptcyDate, now) : null,
        latestRevenue,
        latestRevenueOrigin: revenueValueOrigins.at(-1) ?? null,
        revenueSeries: revenue,
        revenueOrigins: revenueValueOrigins,
        ebitMarginSeries: ebitMarginSeries(statements),
        ebitMarginOrigins: ebitMarginOrigins(statements),
      } satisfies OversiktBankruptcyRow;
    })
    .filter((row) => row.latestRevenue != null && row.latestRevenue > 0)
    .sort((left, right) => (right.latestRevenue ?? 0) - (left.latestRevenue ?? 0))
    .slice(0, BANKRUPTCY_LIMIT);
}

async function getNewsRows(userId: string): Promise<OversiktNewsRow[]> {
  const insights = await getDashboardRelevantInsights(userId, 8);
  return insights.map((item) => {
    const tag = item.companyLabel ?? item.contextLabel ?? item.sourceLabel ?? "MARKED";
    return {
      id: item.id,
      tag: tag.toUpperCase(),
      head: item.title,
      source: item.sourceLabel ?? "",
      time: relativeTimeLabel(item.publishedAt),
      summary: item.summary ?? item.title,
      href: item.href,
      external: /^https?:\/\//i.test(item.href),
    };
  });
}

async function getBankruptciesLastWeek() {
  return prisma.companyDistressProfile.count({
    where: {
      distressStatus: DistressStatus.BANKRUPTCY,
      bankruptcyDate: { gte: daysAgo(7) },
    },
  });
}

export async function getOversiktDashboardData(userId: string): Promise<OversiktDashboardData> {
  const [watched, bankrupt, news, bankruptciesLastWeek] = await Promise.all([
    getWatchedCompanies(userId),
    getBankruptCompanies(),
    getNewsRows(userId),
    getBankruptciesLastWeek(),
  ]);

  // One read for both tables, so every figure on the dashboard comes from a single live
  // snapshot. Two calls could straddle a dataset pointer switch and mix versions.
  const companyIds = [
    ...new Set([...watched.map((company) => company.id), ...bankrupt.map((p) => p.company.id)]),
  ];
  const financials = await watchlistFinancialsService.load(companyIds);

  return {
    watch: watched.map((company) => ({
      name: company.name,
      slug: company.slug,
      revenueSeries: revenueSeries(financials.statementsByCompany[company.id] ?? []),
      revenueOrigins: revenueOrigins(financials.statementsByCompany[company.id] ?? []),
    })),
    news,
    bankruptcies: toBankruptcyRows(bankrupt, financials.statementsByCompany),
    bankruptciesLastWeek,
    financialDatasetVersion: financials.financialDatasetVersion,
    financialDisclosure: financials.disclosure,
  };
}
