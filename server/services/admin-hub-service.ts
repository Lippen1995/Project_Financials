/**
 * Admin hub model.
 *
 * Rebuilt around the structured Brønnøysund ingestion, which is the beta's
 * only production data path for regnskap (see docs/go-live-sprint-plan.md,
 * "OCR tas ut av den produksjonskritiske dataflyten"). The previous model was
 * a control console for the PDF/OCR extraction pipeline; every panel read
 * AnnualReportFiling / AnnualReportReview. Those surfaces are being retired,
 * so the hub now answers the questions that matter for a DB-backed product:
 *
 *  - how much of the company base actually has official financials;
 *  - what is queued for refresh, and what has never been fetched at all;
 *  - what failed against the source, and when we last heard from it.
 *
 * Navigation and action items are data-driven so the view holds no hardcoded
 * links to retired admin surfaces.
 */
import { type AppRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildBackgroundJobControlCenter,
  type BackgroundJobControlCenterItem,
} from "@/server/services/background-job-control-center-service";
import { getCurrentIngestionRun } from "@/server/services/ingestion-run-service";

export type AdminHubTone = "neutral" | "active" | "success" | "warning" | "error";

export type AdminHubMetric = {
  key: string;
  title: string;
  value: string;
  detail: string;
  /** Drives the figure colour in the hub sidebar. Defaults to neutral ink. */
  tone?: AdminHubTone;
};

export type AdminHubNavigationItem = {
  key: string;
  title: string;
  description: string;
  href?: string;
  available: boolean;
  restrictionLabel?: string;
  actionLabel?: string;
  eyebrow?: string;
};

export type AdminHubNavigationSection = {
  title: string;
  items: AdminHubNavigationItem[];
};

export type AdminHubHumanStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
};

export type AdminHubActivity = {
  key: string;
  title: string;
  description: string;
  timestamp: string;
  href?: string;
  /** Drives the timeline dot colour. Defaults to neutral. */
  tone?: AdminHubTone;
};

export type AdminHubActionItem = {
  key: string;
  title: string;
  value: number;
  detail: string;
  href?: string;
  urgent: boolean;
};

/** One band of the ingestion coverage funnel, from registry down to published. */
export type AdminCoverageStage = {
  key: string;
  label: string;
  count: number;
  detail: string;
  href?: string;
  tone: AdminHubTone;
};

export type AdminUserStats = {
  total: number;
  admins: number;
  reviewers: number;
  regularUsers: number;
};

export type AdminHubModel = {
  title: string;
  subtitle: string;
  generatedAt: string;
  metrics: AdminHubMetric[];
  coverage: AdminCoverageStage[];
  coverageTotals: {
    companies: number;
    withFinancials: number;
    coveragePercent: number;
    neverFetched: number;
  };
  backgroundJobs: BackgroundJobControlCenterItem[];
  actionItems: AdminHubActionItem[];
  userStats: AdminUserStats;
  navigationSections: AdminHubNavigationSection[];
  humanSteps: AdminHubHumanStep[];
  recentActivity: AdminHubActivity[];
};

const STRUCTURED_SOURCE_SYSTEM = "BRREG";
const STRUCTURED_SOURCE_ENTITY_TYPE = "structuredAnnualAccounts";

function formatNumber(value: number) {
  return value.toLocaleString("nb-NO");
}

function formatPercent(value: number) {
  return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
}

function formatTimestamp(value: Date | null | undefined) {
  if (!value) {
    return "Ingen aktivitet registrert";
  }

  return value.toLocaleString("nb-NO");
}

export async function buildAdminHubModel(input: {
  currentUserRole: AppRole;
}): Promise<AdminHubModel> {
  const now = new Date();
  const isAdmin = input.currentUserRole === "ADMIN";

  const [
    companyCount,
    companiesWithFinancials,
    fetchStateCount,
    fetchStateByStatus,
    dueForRefresh,
    failingFetches,
    latestAvailable,
    latestError,
    latestIngestionRun,
    statementsByYear,
    metricAliasCount,
    userRoleGroups,
    backgroundJobs,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.financialStatement
      .groupBy({
        by: ["companyId"],
        where: {
          sourceSystem: STRUCTURED_SOURCE_SYSTEM,
          sourceEntityType: STRUCTURED_SOURCE_ENTITY_TYPE,
        },
      })
      .then((rows) => rows.length),
    prisma.structuredFinancialFetchState.count(),
    prisma.structuredFinancialFetchState.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.structuredFinancialFetchState.count({
      where: { nextCheckAt: { lt: now } },
    }),
    prisma.structuredFinancialFetchState.count({
      where: { failureCount: { gt: 0 } },
    }),
    prisma.structuredFinancialFetchState.findFirst({
      where: { status: "AVAILABLE" },
      orderBy: { fetchedAt: "desc" },
      select: {
        fetchedAt: true,
        latestFiscalYear: true,
        company: { select: { name: true, orgNumber: true, slug: true } },
      },
    }),
    prisma.structuredFinancialFetchState.findFirst({
      where: { status: "ERROR" },
      orderBy: { lastCheckedAt: "desc" },
      select: {
        lastCheckedAt: true,
        lastErrorCode: true,
        failureCount: true,
        company: { select: { name: true, orgNumber: true, slug: true } },
      },
    }),
    getCurrentIngestionRun(),
    prisma.financialStatement.groupBy({
      by: ["fiscalYear"],
      where: {
        sourceSystem: STRUCTURED_SOURCE_SYSTEM,
        sourceEntityType: STRUCTURED_SOURCE_ENTITY_TYPE,
      },
      _count: { id: true },
      orderBy: { fiscalYear: "desc" },
      take: 3,
    }),
    prisma.metricAlias.count(),
    prisma.user.groupBy({
      by: ["appRole"],
      _count: { id: true },
    }),
    buildBackgroundJobControlCenter({ now }),
  ]);

  const statusCountMap = new Map<string, number>();
  for (const group of fetchStateByStatus) {
    statusCountMap.set(group.status, group._count.id);
  }
  const availableCount = statusCountMap.get("AVAILABLE") ?? 0;
  const unavailableCount = statusCountMap.get("UNAVAILABLE") ?? 0;
  const errorCount = statusCountMap.get("ERROR") ?? 0;
  const neverFetched = Math.max(0, companyCount - fetchStateCount);
  const coveragePercent =
    companyCount === 0 ? 0 : (companiesWithFinancials / companyCount) * 100;
  // The newest fiscal year on its own is misleading: a handful of early filers
  // can put a year on the board that has almost no coverage. Report the year
  // that actually carries the most statements alongside it.
  const latestFiscalYear = statementsByYear[0]?.fiscalYear ?? null;
  const bestCoveredYear = statementsByYear.reduce<
    { fiscalYear: number; count: number } | null
  >((best, row) => {
    const count = row._count.id;
    return best === null || count > best.count
      ? { fiscalYear: row.fiscalYear, count }
      : best;
  }, null);

  const userRoleCountMap = new Map<string, number>();
  for (const group of userRoleGroups) {
    userRoleCountMap.set(group.appRole, group._count.id);
  }
  const userStats: AdminUserStats = {
    total: [...userRoleCountMap.values()].reduce((sum, n) => sum + n, 0),
    admins: userRoleCountMap.get("ADMIN") ?? 0,
    reviewers: userRoleCountMap.get("FINANCIAL_REVIEWER") ?? 0,
    regularUsers: userRoleCountMap.get("USER") ?? 0,
  };

  const actionItems: AdminHubActionItem[] = [];
  if (errorCount > 0) {
    actionItems.push({
      key: "fetch-errors",
      title: "Kildefeil mot Brreg",
      value: errorCount,
      detail: "Virksomheter der siste henting mot Brreg feilet.",
      urgent: true,
    });
  }
  if (neverFetched > 0) {
    actionItems.push({
      key: "never-fetched",
      title: "Aldri hentet",
      value: neverFetched,
      detail: "Virksomheter i basen som aldri har vært gjennom regnskapshenting.",
      urgent: false,
    });
  }
  if (dueForRefresh > 0) {
    actionItems.push({
      key: "due-for-refresh",
      title: "Klar for oppdatering",
      value: dueForRefresh,
      detail: "Hentetilstander som har passert neste kontrolltidspunkt.",
      urgent: false,
    });
  }
  for (const job of backgroundJobs) {
    if (job.health === "error") {
      actionItems.push({
        key: `background-job-error:${job.jobKey}`,
        title: `${job.title}: feil`,
        value: Math.max(job.errorCount, job.latestRun?.failedCount ?? 0),
        detail: job.latestFailure?.errorMessage ?? "Siste kjøring feilet eller køen har feil som krever tiltak.",
        urgent: true,
      });
    } else if (job.health === "warning" && job.dueCount > 0) {
      actionItems.push({
        key: `background-job-backlog:${job.jobKey}`,
        title: `${job.title}: etterslep`,
        value: job.dueCount,
        detail: "Forfalte jobber har ventet lenger enn planlagt intervall.",
        urgent: false,
      });
    }
  }

  const coverage: AdminCoverageStage[] = [
    {
      key: "companies",
      label: "Virksomheter i basen",
      count: companyCount,
      detail: "Selskaper vi har normalisert fra Brreg.",
      tone: "neutral",
    },
    {
      key: "with-financials",
      label: "Har offisielt regnskap",
      count: companiesWithFinancials,
      detail: bestCoveredYear
        ? `Best dekkede år er ${bestCoveredYear.fiscalYear} med ${formatNumber(bestCoveredYear.count)} regnskap. Nyeste registrerte år er ${latestFiscalYear}.`
        : "Ingen strukturerte regnskapsår er registrert.",
      tone: "success",
    },
    {
      key: "available",
      label: "Henting: tilgjengelig",
      count: availableCount,
      detail: "Siste henting fant strukturert regnskap.",
      tone: "success",
    },
    {
      key: "unavailable",
      label: "Henting: ikke tilgjengelig",
      count: unavailableCount,
      detail: "Ærlig tomtilstand — Brreg har ikke regnskap for disse.",
      tone: "neutral",
    },
    {
      key: "due-for-refresh",
      label: "Klar for oppdatering",
      count: dueForRefresh,
      detail: "Passert neste kontrolltidspunkt og venter på ny henting.",
      tone: "active",
    },
    {
      key: "never-fetched",
      label: "Aldri hentet",
      count: neverFetched,
      detail: "Ingen hentetilstand registrert ennå.",
      tone: "warning",
    },
    {
      key: "errors",
      label: "Kildefeil",
      count: errorCount,
      detail: "Siste henting mot Brreg feilet.",
      tone: "error",
    },
  ];

  const humanSteps: AdminHubHumanStep[] = [
    {
      key: "metric-mapping",
      title: "Regnskapsmapping",
      description:
        "Koble kildelabels fra Brreg til de standardiserte regnskapsnøklene. Grunnlaget for at nøkkeltall kan sammenlignes på tvers av virksomheter.",
      href: "/admin/metric-mapping",
      actionLabel: "Åpne mapping",
    },
    {
      key: "company-events",
      title: "Vurdering av selskapshendelser",
      description:
        "Gå gjennom hendelser fra nyhetsmotoren, fjern støy og bygg treningsgrunnlag.",
      href: "/admin/company-events",
      actionLabel: "Åpne hendelseskø",
    },
  ];

  return {
    title: "Kontrollsenter",
    subtitle:
      "Køer, bakgrunnskjøringer, datadekning og feil for Fjord Insights produksjonsnære dataflyter.",
    generatedAt: now.toISOString(),
    backgroundJobs,
    coverage,
    coverageTotals: {
      companies: companyCount,
      withFinancials: companiesWithFinancials,
      coveragePercent,
      neverFetched,
    },
    actionItems,
    userStats,
    metrics: [
      {
        key: "financial-coverage",
        title: "Regnskapsdekning",
        tone: "neutral",
        value: formatPercent(coveragePercent),
        detail: `${formatNumber(companiesWithFinancials)} av ${formatNumber(companyCount)} virksomheter har minst ett offisielt regnskapsår.`,
      },
      {
        key: "never-fetched",
        title: "Aldri hentet",
        tone: "warning",
        value: formatNumber(neverFetched),
        detail: "Virksomheter uten hentetilstand. Disse må gjennom en populeringsjobb.",
      },
      {
        key: "due-for-refresh",
        title: "Klar for oppdatering",
        tone: "neutral",
        value: formatNumber(dueForRefresh),
        detail: `${formatNumber(fetchStateCount)} hentetilstander finnes totalt.`,
      },
      {
        key: "fetch-errors",
        title: "Kildefeil",
        tone: "error",
        value: formatNumber(errorCount),
        detail:
          failingFetches > 0
            ? `${formatNumber(failingFetches)} hentetilstander har minst ett registrert feilforsøk.`
            : "Ingen registrerte feilforsøk mot kilden.",
      },
    ],
    navigationSections: [
      {
        title: "Data og dekning",
        items: [
          {
            key: "metric-mapping",
            title: "Regnskapsmapping",
            eyebrow: "Data",
            description:
              "Koble kildelabels til standardiserte regnskapsnøkler. Klargjør også for komplett linjepostleveranse fra Brreg.",
            href: "/admin/metric-mapping",
            actionLabel: "Åpne mapping",
            available: true,
          },
          {
            key: "company-events",
            title: "Selskapshendelser",
            eyebrow: "Nyhetsmotor",
            description:
              "Vurder hendelser, rydd bort støy og bygg treningsgrunnlag for shadow mode.",
            href: "/admin/company-events",
            actionLabel: "Åpne hendelseskø",
            available: true,
          },
          {
            key: "ingestion-coverage",
            title: "Dekningsrapport",
            eyebrow: "Rapport",
            description:
              "Detaljert dekningsrapport per organisasjonsform og regnskapsår kjøres i dag som skript.",
            available: false,
            restrictionLabel: "Kjøres som skript",
          },
        ],
      },
      {
        title: "System og tilgang",
        items: [
          {
            key: "ai-economics",
            title: "AI-økonomi",
            eyebrow: "Njord",
            description:
              "Styr AI-budsjett, valutarisiko, abonnementskvoter og inntektsallokering.",
            href: isAdmin ? "/admin/ai-economics" : undefined,
            actionLabel: "Åpne AI-økonomi",
            available: isAdmin,
            restrictionLabel: isAdmin ? undefined : "Kun admin",
          },
          {
            key: "users",
            title: "Brukere og roller",
            eyebrow: "Tilgang",
            description: `${formatNumber(userStats.total)} brukere · ${formatNumber(userStats.admins)} admins · ${formatNumber(userStats.reviewers)} reviewere.`,
            href: isAdmin ? "/admin/users" : undefined,
            actionLabel: "Administrer brukere",
            available: isAdmin,
            restrictionLabel: isAdmin ? undefined : "Kun admin",
          },
          {
            key: "health-score",
            title: "Finansiell helse",
            eyebrow: "Modell",
            description:
              "Vedlikehold vektene og kurvene bak helsescoren som vises på selskapsprofilen.",
            href: isAdmin ? "/admin/health-score" : undefined,
            actionLabel: "Åpne modellen",
            available: isAdmin,
            restrictionLabel: isAdmin ? undefined : "Kun admin",
          },
        ],
      },
    ],
    humanSteps,
    recentActivity: [
      {
        key: "latest-available-fetch",
        title: "Siste vellykkede henting",
        tone: "success",
        description: latestAvailable
          ? `${latestAvailable.company.name}${
              latestAvailable.latestFiscalYear
                ? ` · ${latestAvailable.latestFiscalYear}`
                : ""
            }`
          : "Ingen vellykket henting registrert ennå.",
        timestamp: formatTimestamp(latestAvailable?.fetchedAt),
        href: latestAvailable ? `/companies/${latestAvailable.company.slug}` : undefined,
      },
      {
        key: "latest-fetch-error",
        title: "Siste kildefeil",
        tone: "error",
        description: latestError
          ? `${latestError.company.name} · ${latestError.lastErrorCode ?? "ukjent feil"} · ${formatNumber(latestError.failureCount)} forsøk`
          : "Ingen kildefeil registrert.",
        timestamp: formatTimestamp(latestError?.lastCheckedAt),
        href: latestError ? `/companies/${latestError.company.slug}` : undefined,
      },
      {
        key: "latest-ingestion-run",
        title: "Siste populeringsjobb",
        tone: "active",
        description: latestIngestionRun
          ? `${formatNumber(latestIngestionRun.processedFilings)} behandlet · ${formatNumber(latestIngestionRun.publishedCount)} publisert · ${formatNumber(latestIngestionRun.failedCount)} feilet`
          : "Ingen populeringsjobb registrert ennå.",
        timestamp: formatTimestamp(
          latestIngestionRun?.finishedAt ?? latestIngestionRun?.startedAt,
        ),
      },
      {
        key: "metric-aliases",
        title: "Regnskapsmapping",
        tone: "neutral",
        description: `${formatNumber(metricAliasCount)} kildelabels er mappet til standardiserte nøkler.`,
        timestamp: "Løpende",
        href: "/admin/metric-mapping",
      },
    ],
  };
}
