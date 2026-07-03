import { DistressStatus, StatementScope, WorkspaceWatchStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getDashboardRelevantInsights } from "@/server/news/dashboard-insights-service";

const TREND_YEARS = 5;
const WATCH_LIMIT = 6;
const BANKRUPTCY_LIMIT = 6;
const BANKRUPTCY_LOOKBACK_DAYS = 60;

export type OversiktWatchRow = {
  name: string;
  slug: string;
  /** Revenue in NOK, oldest → newest. */
  revenueSeries: number[];
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
  /** Revenue in NOK, oldest → newest. */
  revenueSeries: number[];
  /** EBIT margin in percent, oldest → newest. */
  ebitMarginSeries: number[];
};

export type OversiktDashboardData = {
  watch: OversiktWatchRow[];
  news: OversiktNewsRow[];
  bankruptcies: OversiktBankruptcyRow[];
  bankruptciesLastWeek: number;
};

type StatementRow = {
  revenue: bigint | null;
  operatingProfit: bigint | null;
};

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

function revenueSeries(statements: StatementRow[]) {
  return statements
    .map((statement) => (statement.revenue == null ? null : Number(statement.revenue)))
    .filter((value): value is number => value != null)
    .slice(-TREND_YEARS);
}

function ebitMarginSeries(statements: StatementRow[]) {
  return statements
    .map((statement) =>
      statement.revenue == null || statement.operatingProfit == null || statement.revenue === 0n
        ? null
        : (Number(statement.operatingProfit) / Number(statement.revenue)) * 100,
    )
    .filter((value): value is number => value != null)
    .slice(-TREND_YEARS);
}

async function getWatchRows(userId: string): Promise<OversiktWatchRow[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastWorkspaceId: true },
  });
  if (!user?.lastWorkspaceId) return [];

  const watches = await prisma.workspaceWatch.findMany({
    where: { workspaceId: user.lastWorkspaceId, status: WorkspaceWatchStatus.ACTIVE },
    orderBy: { updatedAt: "desc" },
    take: WATCH_LIMIT,
    include: {
      company: {
        select: {
          name: true,
          slug: true,
          financialStatements: {
            where: { statementScope: StatementScope.COMPANY },
            orderBy: { fiscalYear: "asc" },
            select: { revenue: true, operatingProfit: true },
          },
        },
      },
    },
  });

  return watches.map((watch) => ({
    name: watch.company.name,
    slug: watch.company.slug,
    revenueSeries: revenueSeries(watch.company.financialStatements),
  }));
}

async function getBankruptcyRows(): Promise<OversiktBankruptcyRow[]> {
  const profiles = await prisma.companyDistressProfile.findMany({
    where: {
      distressStatus: DistressStatus.BANKRUPTCY,
      bankruptcyDate: { gte: daysAgo(BANKRUPTCY_LOOKBACK_DAYS) },
    },
    include: {
      company: {
        select: {
          name: true,
          slug: true,
          industryCode: { select: { title: true } },
          distressFinancialSnapshot: { select: { revenue: true, sectorLabel: true } },
          financialStatements: {
            where: { statementScope: StatementScope.COMPANY },
            orderBy: { fiscalYear: "asc" },
            select: { revenue: true, operatingProfit: true },
          },
        },
      },
    },
  });

  const now = new Date();

  return profiles
    .map((profile) => {
      const company = profile.company;
      const revenue = revenueSeries(company.financialStatements);
      const snapshotRevenue =
        company.distressFinancialSnapshot?.revenue == null
          ? null
          : Number(company.distressFinancialSnapshot.revenue);
      const latestRevenue = revenue.at(-1) ?? snapshotRevenue;

      return {
        name: company.name,
        slug: company.slug,
        sector:
          company.industryCode?.title ?? company.distressFinancialSnapshot?.sectorLabel ?? "—",
        filedDaysAgo: profile.bankruptcyDate ? daysBetween(profile.bankruptcyDate, now) : null,
        latestRevenue,
        revenueSeries: revenue,
        ebitMarginSeries: ebitMarginSeries(company.financialStatements),
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
  const [watch, news, bankruptcies, bankruptciesLastWeek] = await Promise.all([
    getWatchRows(userId),
    getNewsRows(userId),
    getBankruptcyRows(),
    getBankruptciesLastWeek(),
  ]);

  return { watch, news, bankruptcies, bankruptciesLastWeek };
}
