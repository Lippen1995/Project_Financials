import { type AppRole, AnnualReportFilingStatus, AnnualReportReviewStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  listPublishedAnnualReports,
  type PublishedAnnualReportMode,
} from "@/server/services/admin-published-annual-reports-service";
import { getCurrentIngestionRun } from "@/server/services/ingestion-run-service";

export type AdminHubMetric = {
  key: string;
  title: string;
  value: string;
  detail: string;
};

export type AdminHubNavigationItem = {
  key: string;
  title: string;
  description: string;
  href?: string;
  available: boolean;
  restrictionLabel?: string;
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
};

export type AdminPipelineStage = {
  status: AnnualReportFilingStatus;
  label: string;
  count: number;
  href: string;
  tone: "neutral" | "active" | "success" | "warning" | "error";
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
  pipeline: AdminPipelineStage[];
  userStats: AdminUserStats;
  navigationSections: AdminHubNavigationSection[];
  humanSteps: AdminHubHumanStep[];
  recentActivity: AdminHubActivity[];
};

function formatNumber(value: number) {
  return value.toLocaleString("nb-NO");
}

function formatTimestamp(value: Date | null | undefined) {
  if (!value) {
    return "Ingen aktivitet registrert";
  }

  return value.toLocaleString("nb-NO");
}

function findSummaryCount(
  summary: Array<{ key: PublishedAnnualReportMode; count: number }>,
  key: PublishedAnnualReportMode,
) {
  return summary.find((item) => item.key === key)?.count ?? 0;
}

export async function buildAdminHubModel(input: {
  currentUserRole: AppRole;
}): Promise<AdminHubModel> {
  const openReviewStatuses: AnnualReportReviewStatus[] = [
    "PENDING_REVIEW",
    "REPROCESS_REQUESTED",
  ];

  const [
    filingCount,
    failedCount,
    openReviewRows,
    published,
    latestPublishedFiling,
    latestReviewDecision,
    latestIngestionRun,
    totalReviewDecisions,
    pipelineStatusGroups,
    userRoleGroups,
  ] = await Promise.all([
    prisma.annualReportFiling.count(),
    prisma.annualReportFiling.count({
      where: {
        status: "FAILED",
      },
    }),
    prisma.annualReportReview.findMany({
      where: {
        status: {
          in: openReviewStatuses,
        },
      },
      select: {
        filingId: true,
      },
    }),
    listPublishedAnnualReports(),
    prisma.annualReportFiling.findFirst({
      where: {
        publishedSnapshotAt: { not: null },
      },
      orderBy: {
        publishedSnapshotAt: "desc",
      },
      select: {
        id: true,
        fiscalYear: true,
        publishedSnapshotAt: true,
        company: {
          select: {
            name: true,
            orgNumber: true,
          },
        },
      },
    }),
    prisma.annualReportReviewDecision.findFirst({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        createdAt: true,
        decisionType: true,
        fiscalYear: true,
        review: {
          select: {
            id: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    getCurrentIngestionRun(),
    prisma.annualReportReviewDecision.count(),
    prisma.annualReportFiling.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.user.groupBy({
      by: ["appRole"],
      _count: { id: true },
    }),
  ]);

  const openReviewFilingIds = Array.from(new Set(openReviewRows.map((row) => row.filingId)));
  const extraManualCount = await prisma.annualReportFiling.count({
    where: {
      status: "MANUAL_REVIEW",
      ...(openReviewFilingIds.length
        ? {
            id: {
              notIn: openReviewFilingIds,
            },
          }
        : {}),
    },
  });
  const currentManualCount = openReviewFilingIds.length + extraManualCount;

  // Build pipeline stage count map
  const statusCountMap = new Map<AnnualReportFilingStatus, number>();
  for (const group of pipelineStatusGroups) {
    statusCountMap.set(group.status, group._count.id);
  }
  const pipelineStageOrder: Array<{
    status: AnnualReportFilingStatus;
    label: string;
    tone: AdminPipelineStage["tone"];
  }> = [
    { status: "DISCOVERED", label: "Oppdaget", tone: "neutral" },
    { status: "DOWNLOADED", label: "Lastet ned", tone: "neutral" },
    { status: "PROCESSING", label: "Behandles", tone: "active" },
    { status: "PREFLIGHTED", label: "Preflight OK", tone: "active" },
    { status: "EXTRACTED", label: "Ekstrahert", tone: "active" },
    { status: "VALIDATED", label: "Validert", tone: "active" },
    { status: "MANUAL_REVIEW", label: "Manuell kontroll", tone: "warning" },
    { status: "PUBLISHED", label: "Publisert", tone: "success" },
    { status: "FAILED", label: "Feilet", tone: "error" },
  ];
  const pipeline: AdminPipelineStage[] = pipelineStageOrder.map((stage) => ({
    status: stage.status,
    label: stage.label,
    count: statusCountMap.get(stage.status) ?? 0,
    href: `/admin/filings?status=${stage.status}`,
    tone: stage.tone,
  }));

  // Build user stats
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

  const automaticPublishedCount = findSummaryCount(published.summary, "AUTOMATIC");
  const reviewedWithoutChangesCount = findSummaryCount(
    published.summary,
    "REVIEWED_WITHOUT_CHANGES",
  );
  const publishedWithoutCorrectionsCount =
    automaticPublishedCount + reviewedWithoutChangesCount;
  const manuallyCorrectedCount = findSummaryCount(
    published.summary,
    "MANUALLY_CORRECTED",
  );

  return {
    title: "Kontrollsenter",
    subtitle:
      "Oversikt over rapportpipelinens status, hva som krever tiltak, og systemets utvikling.",
    generatedAt: new Date().toISOString(),
    pipeline,
    userStats,
    metrics: [
      {
        key: "uploaded-filings",
        title: "Opplastede rapportfiler",
        value: formatNumber(filingCount),
        detail:
          latestIngestionRun
            ? `Siste bulk-opplasting startet ${formatTimestamp(latestIngestionRun.startedAt)}.`
            : "Ingen bulk-opplasting registrert ennå.",
      },
      {
        key: "manual-review-now",
        title: "Til manuell kontroll nå",
        value: formatNumber(currentManualCount),
        detail: `${formatNumber(totalReviewDecisions)} manuelle beslutninger er registrert totalt.`,
      },
      {
        key: "published-without-corrections",
        title: "Publisert uten manuell korrigering",
        value: formatNumber(publishedWithoutCorrectionsCount),
        detail: `${formatNumber(automaticPublishedCount)} helautomatiske og ${formatNumber(reviewedWithoutChangesCount)} manuelt vurderte uten endring.`,
      },
      {
        key: "published-with-corrections",
        title: "Publisert etter manuell korrigering",
        value: formatNumber(manuallyCorrectedCount),
        detail: "Rapporter der en person har endret tall før publisering.",
      },
      {
        key: "failed-or-stopped",
        title: "Feilet eller stoppet",
        value: formatNumber(failedCount),
        detail: "Rapporter som har stoppet i behandlingen og må følges opp.",
      },
    ],
    navigationSections: [
      {
        title: "Daglig drift",
        items: [
          {
            key: "overview",
            title: "Oversikt",
            description: "Start her for å se dagens situasjon og viktigste oppgaver.",
            href: "/admin",
            available: true,
          },
          {
            key: "published-annual-reports",
            title: "Godkjente årsregnskaper",
            description: "Se alle publiserte årsregnskaper og hvordan de ble godkjent.",
            href: "/admin/published-annual-reports",
            available: true,
          },
          {
            key: "review-queue",
            title: "Rapporter til manuell kontroll",
            description: "Åpne køen for rapporter som trenger en menneskelig vurdering.",
            href: "/admin/annual-report-reviews",
            available: true,
          },
          {
            key: "users",
            title: "Brukere og roller",
            description: "Finn brukere, filtrer på rolle og administrer globale tilganger.",
            href: input.currentUserRole === "ADMIN" ? "/admin/users" : undefined,
            available: input.currentUserRole === "ADMIN",
            restrictionLabel: input.currentUserRole === "ADMIN" ? undefined : "Kun admin",
          },
        ],
      },
      {
        title: "Kontroll og kvalitet",
        items: [
          {
            key: "confidence",
            title: "Datakvalitet og kontrollgrunnlag",
            description: "Se hvilke rapporter og kontroller som krever oppfølging.",
            href: "/admin/annual-report-unified-confidence",
            available: true,
          },
          {
            key: "human-steps",
            title: "Steg som krever menneskelig vurdering",
            description: "Gå rett til stegene der systemet trenger et menneske i løkken.",
            href: "/admin#human-review",
            available: true,
          },
          {
            key: "app-statistics",
            title: "App-statistikk",
            description: "Plassholder for produktstatistikk og bruksmønstre.",
            available: false,
            restrictionLabel: "Ikke tilgjengelig ennå",
          },
        ],
      },
      {
        title: "Modell og system",
        items: [
          {
            key: "ai-model",
            title: "AI-modellen",
            description: "Følg læring, kalibrering og modellrelaterte vurderinger.",
            href: "/admin/extraction-learning",
            available: true,
          },
          {
            key: "metric-mapping",
            title: "Regnskapsmapping",
            description: "Koble norske kildelabels til de standardiserte regnskapsnøklene.",
            href: "/admin/metric-mapping",
            available: true,
          },
          {
            key: "pdf-analytics",
            title: "PDF-vurdering",
            description: "Analyser hvordan systemet vurderer og ruter dokumenter.",
            href: "/admin/pdf-decision-analytics",
            available: true,
          },
          {
            key: "parser-remediation",
            title: "Feil og forbedringer",
            description: "Samle områder der parseren bør forbedres eller korrigeres.",
            href: "/admin/pdf-parser-remediation",
            available: true,
          },
        ],
      },
    ],
    humanSteps: [
      {
        key: "manual-review",
        title: "Manuell kontroll av rapporter",
        description: "Rapporter med usikre tall eller avvik må åpnes og vurderes av et menneske.",
        href: "/admin/annual-report-reviews",
        actionLabel: "Åpne kontrollkøen",
      },
      {
        key: "published-after-correction",
        title: "Rapporter publisert etter korrigering",
        description: "Disse rapportene er viktige når dere vil se hvor systemet fortsatt trenger støtte.",
        href: "/admin/published-annual-reports?mode=MANUALLY_CORRECTED",
        actionLabel: "Se korrigerte publiseringer",
      },
      {
        key: "quality-follow-up",
        title: "Datakvalitet som må vurderes",
        description: "Når kontrollgrunnlaget peker på avvik, bør de vurderes før nye publiseringer kjøres.",
        href: "/admin/annual-report-unified-confidence",
        actionLabel: "Åpne kvalitetsgrunnlag",
      },
      {
        key: "model-decisions",
        title: "Modellkandidater og læring",
        description: "Nye modellkandidater og kalibreringer trenger menneskelig godkjenning før bruk.",
        href: "/admin/pdf-model-candidates",
        actionLabel: "Se modellkandidater",
      },
    ],
    recentActivity: [
      {
        key: "latest-publication",
        title: "Siste publisering",
        description: latestPublishedFiling
          ? `${latestPublishedFiling.company.name} · ${latestPublishedFiling.fiscalYear}`
          : "Ingen publisering registrert ennå.",
        timestamp: formatTimestamp(latestPublishedFiling?.publishedSnapshotAt),
        href: latestPublishedFiling
          ? `/admin/published-annual-reports?query=${encodeURIComponent(
              latestPublishedFiling.company.orgNumber,
            )}`
          : undefined,
      },
      {
        key: "latest-review-decision",
        title: "Siste manuelle beslutning",
        description: latestReviewDecision
          ? `${latestReviewDecision.review.company.name} · ${latestReviewDecision.fiscalYear} · ${latestReviewDecision.decisionType}`
          : "Ingen manuelle beslutninger registrert ennå.",
        timestamp: formatTimestamp(latestReviewDecision?.createdAt),
        href: latestReviewDecision
          ? `/admin/annual-report-reviews/${latestReviewDecision.review.id}`
          : undefined,
      },
      {
        key: "latest-bulk-ingestion",
        title: "Siste bulk-opplasting",
        description: latestIngestionRun
          ? `${latestIngestionRun.processedFilings} rapporter behandlet · ${latestIngestionRun.publishedCount} publisert · ${latestIngestionRun.reviewCount} til kontroll`
          : "Ingen bulk-opplasting registrert ennå.",
        timestamp: formatTimestamp(latestIngestionRun?.finishedAt ?? latestIngestionRun?.startedAt),
        href: "/admin",
      },
    ],
  };
}
