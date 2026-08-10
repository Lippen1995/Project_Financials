import { DistressStatus as PrismaDistressStatus } from "@prisma/client";

import { BrregAnnouncementsProvider } from "@/integrations/brreg/brreg-announcements-provider";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { BrregDistressProvider } from "@/integrations/brreg/brreg-distress-provider";
import { mapBrregCompany } from "@/integrations/brreg/mappers";
import { SsbIndustryCodeProvider } from "@/integrations/ssb/ssb-industry-code-provider";
import {
  DISTRESS_SCORE_VERSION,
  buildDistressFinancialTrend,
  buildDistressProfileFromPayload,
  buildSectorSummary,
  calculateDaysInStatus,
  calculateDistressScore,
  calculateEquityRatio,
  calculateLiquidityRatio,
  extractAssetSnapshot,
  extractInterestBearingDebt,
  getDistressStatusLabel,
  toHealthScore,
} from "@/lib/distress";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  CompanyProfile,
  DistressCompanyDetail,
  DistressCompanyRow,
  DistressDocumentExcerpt,
  DistressFilterOptions,
  DistressFinancialSnapshotSummary,
  DistressModuleKpis,
  DistressModuleResponse,
  DistressModuleSectorRow,
  DistressOverviewResponse,
  DistressRevenueTrendPoint,
  DistressScreeningResponse,
  DistressSearchFilters,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { mapDbCompany, mapDbFinancialStatements } from "@/server/mappers/db-mappers";
import { financialsRepository } from "@/server/financials/financials-repository";
import {
  type ActiveFinancialDataset,
  countDistressProfiles,
  deleteCompanyDistressData,
  getDistressCompanyRecord,
  getDistressOverviewCounts,
  getDistressRecentAnnouncements,
  getDistressSectorOverview,
  getDistressStatusDistribution,
  getDistressTimelineByMonth,
  getDistressSyncState,
  listDistressFilterOptions,
  listDistressCompanyRecords,
  matchesActiveFinancialDataset,
  upsertCompanyDistressProfile,
  upsertDistressFinancialSnapshot,
  upsertDistressSyncState,
} from "@/server/persistence/distress-repository";
import { upsertCompanySnapshot } from "@/server/persistence/company-repository";
import { importAnnualReportsForCompany } from "@/server/importers/annual-report-importer";
import { getCompanyAnnouncements, getCompanyProfile } from "@/server/services/company-service";
import { requireWorkspaceMembership } from "@/server/services/workspace-service";

const companyProvider = new BrregCompanyProvider();
const distressProvider = new BrregDistressProvider();
const announcementsProvider = new BrregAnnouncementsProvider();
const industryCodeProvider = new SsbIndustryCodeProvider();

const DISTRESS_SYNC_KEY = "brreg-distress-enheter";
const DISTRESS_WARM_START_SIZE = 250;
const DISTRESS_SYNC_STALE_MS = 15 * 60 * 1000;
const DISTRESS_DEFAULT_BOOTSTRAP_CONCURRENCY = 16;
const DISTRESS_DEFAULT_UPDATES_CONCURRENCY = 20;
const DISTRESS_BEST_FIT_LIMIT = 500;
const DISTRESS_REVENUE_TREND_YEARS = 5;

async function getActiveDistressFinancialDataset(): Promise<ActiveFinancialDataset> {
  const snapshot = await financialsRepository.getCompaniesFinancialHeadlines({
    companyIds: [],
  });
  return {
    financialDatasetMode: snapshot.datasetMode,
    financialDatasetVersion: snapshot.financialDatasetVersion,
  };
}
/**
 * Balance-sheet total over which the module counts a company as one with something worth bidding
 * for. It deliberately keys off total assets rather than anleggsmidler + varelager: those line items
 * only exist for the ~2% of statements ingested through the structured Regnskapsregisteret path,
 * whereas total assets is present for ~78% of the universe. A KPI computed from the line items reads
 * as a permanent zero, which is worse than a coarser number that is actually true.
 */
const DISTRESS_ASSETS_THRESHOLD = 100_000_000;

let distressBootstrapPromise: Promise<unknown> | null = null;
let distressUpdatesPromise: Promise<unknown> | null = null;
let distressWarmStartPromise: Promise<unknown> | null = null;

type SortKey = NonNullable<DistressSearchFilters["sort"]>;

function resolveSort(sort?: DistressSearchFilters["sort"] | null): SortKey | null {
  switch (sort) {
    case "name_asc":
    case "name_desc":
    case "distressStatus_asc":
    case "distressStatus_desc":
    case "daysInStatus_desc":
    case "daysInStatus_asc":
    case "lastAnnouncementPublishedAt_desc":
    case "lastAnnouncementPublishedAt_asc":
    case "industryCode_asc":
    case "industryCode_desc":
    case "sector_asc":
    case "sector_desc":
    case "lastReportedYear_desc":
    case "lastReportedYear_asc":
    case "revenue_desc":
    case "revenue_asc":
    case "ebit_desc":
    case "ebit_asc":
    case "netIncome_desc":
    case "netIncome_asc":
    case "equityRatio_desc":
    case "equityRatio_asc":
    case "assets_desc":
    case "assets_asc":
    case "interestBearingDebt_desc":
    case "interestBearingDebt_asc":
    case "healthScore_desc":
    case "healthScore_asc":
    case "liquidityRatio_desc":
    case "liquidityRatio_asc":
    case "realizableAssets_desc":
    case "realizableAssets_asc":
      return sort;
    default:
      return null;
  }
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "bigint") {
    const converted = Number(value);
    return Number.isSafeInteger(converted) ? converted : null;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "object" && value && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber() as number;
  }

  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function compareNullableNumbers(left?: number | null, right?: number | null, direction: "asc" | "desc" = "desc") {
  const normalizedLeft = left ?? Number.NEGATIVE_INFINITY;
  const normalizedRight = right ?? Number.NEGATIVE_INFINITY;

  return direction === "desc" ? normalizedRight - normalizedLeft : normalizedLeft - normalizedRight;
}

/**
 * Sorts unknown values last in BOTH directions. `compareNullableNumbers` maps null to -Infinity, so
 * an ascending sort by health would open the table with every company we could not score — an
 * absence of data presented as the worst possible score.
 */
function compareNullsLast(left: number | null | undefined, right: number | null | undefined, direction: "asc" | "desc") {
  const hasLeft = left !== null && left !== undefined;
  const hasRight = right !== null && right !== undefined;

  if (!hasLeft && !hasRight) {
    return 0;
  }

  if (!hasLeft) {
    return 1;
  }

  if (!hasRight) {
    return -1;
  }

  return direction === "asc" ? left - right : right - left;
}

function compareNullableDates(left?: Date | null, right?: Date | null) {
  const leftTime = left?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightTime = right?.getTime() ?? Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}

function compareNullableStrings(left?: string | null, right?: string | null, direction: "asc" | "desc" = "asc") {
  const normalizedLeft = left ?? "";
  const normalizedRight = right ?? "";

  return direction === "asc"
    ? normalizedLeft.localeCompare(normalizedRight, "nb-NO")
    : normalizedRight.localeCompare(normalizedLeft, "nb-NO");
}

function getDistressPriorityWeight(status: DistressCompanyRow["distress"]["status"]) {
  switch (status) {
    case "RECONSTRUCTION":
      return 4000;
    case "BANKRUPTCY":
      return 3000;
    case "FOREIGN_INSOLVENCY":
      return 2500;
    case "FORCED_PROCESS":
      return 2000;
    case "LIQUIDATION":
      return 1000;
    case "OTHER_DISTRESS":
    default:
      return 500;
  }
}

function getBestFitScore(row: DistressCompanyRow) {
  let score = getDistressPriorityWeight(row.distress.status);

  if (row.dataCoverage === "FINANCIALS_AVAILABLE") {
    score += 400;
  } else if (row.dataCoverage === "FINANCIALS_PARTIAL") {
    score += 200;
  }

  if ((row.financials.revenue ?? 0) > 0) {
    score += 150;
  }

  if ((row.financials.ebit ?? Number.NEGATIVE_INFINITY) > 0) {
    score += 300;
  }

  if ((row.financials.netIncome ?? Number.NEGATIVE_INFINITY) > 0) {
    score += 200;
  }

  if ((row.financials.assets ?? 0) >= 5_000_000) {
    score += 200;
  } else if ((row.financials.assets ?? 0) >= 1_000_000) {
    score += 100;
  }

  if ((row.financials.lastReportedYear ?? 0) >= new Date().getFullYear() - 2) {
    score += 125;
  }

  if ((row.distress.daysInStatus ?? Number.POSITIVE_INFINITY) <= 365) {
    score += 175;
  } else if ((row.distress.daysInStatus ?? Number.POSITIVE_INFINITY) <= 730) {
    score += 90;
  }

  if (row.distress.lastAnnouncementPublishedAt) {
    const daysSinceAnnouncement = Math.max(
      0,
      Math.floor((Date.now() - row.distress.lastAnnouncementPublishedAt.getTime()) / (24 * 60 * 60 * 1000)),
    );

    if (daysSinceAnnouncement <= 90) {
      score += 125;
    } else if (daysSinceAnnouncement <= 365) {
      score += 60;
    }
  }

  return score;
}

function buildCoverageValue(hasStatement: boolean, hasKeyMetrics: boolean) {
  if (!hasStatement) {
    return "NO_FINANCIALS";
  }

  return hasKeyMetrics ? "FINANCIALS_AVAILABLE" : "FINANCIALS_PARTIAL";
}

async function runOrgNumberTasks(
  orgNumbers: Iterable<string> | AsyncIterable<string>,
  worker: (orgNumber: string) => Promise<void>,
  options?: {
    concurrency?: number;
    limit?: number;
  },
) {
  const concurrency = Math.max(1, options?.concurrency ?? 1);
  const inFlight = new Set<Promise<void>>();
  const seen = new Set<string>();
  let processed = 0;

  const schedule = async (orgNumber: string) => {
    if (seen.has(orgNumber)) {
      return;
    }

    seen.add(orgNumber);
    processed += 1;

    const task = worker(orgNumber).finally(() => {
      inFlight.delete(task);
    });

    inFlight.add(task);
    if (inFlight.size >= concurrency) {
      await Promise.race(inFlight);
    }
  };

  for await (const orgNumber of orgNumbers) {
    await schedule(orgNumber);

    if (options?.limit && processed >= options.limit) {
      break;
    }
  }

  await Promise.all(inFlight);
  return {
    processed,
  };
}

async function getSectorLabel(industryCode?: string | null) {
  if (!industryCode) {
    return null;
  }

  const classification = await industryCodeProvider.getIndustryCode(industryCode);
  return classification?.title ?? classification?.description ?? null;
}

/** The five most recent fiscal years, oldest first, so the sparkline reads left-to-right in time. */
function buildRevenueTrend(statements: NormalizedFinancialStatement[]): DistressRevenueTrendPoint[] {
  return [...statements]
    .sort((left, right) => right.fiscalYear - left.fiscalYear)
    .slice(0, DISTRESS_REVENUE_TREND_YEARS)
    .reverse()
    .map((statement) => ({
      fiscalYear: statement.fiscalYear,
      revenue: statement.revenue ?? null,
    }));
}

function parseRevenueTrend(value: unknown): DistressRevenueTrendPoint[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const points = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const fiscalYear = toNumber(record.fiscalYear);
    if (fiscalYear === null) {
      return [];
    }

    return [{ fiscalYear, revenue: toNumber(record.revenue) }];
  });

  return points.length > 0 ? points : null;
}

function getMargin(value?: number | null, revenue?: number | null) {
  if (value === null || value === undefined || revenue === null || revenue === undefined || revenue === 0) {
    return null;
  }

  return (value / revenue) * 100;
}

function getRevenueChange(current?: number | null, previous?: number | null) {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    previous === 0
  ) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function buildBusinessDescription(profile: CompanyProfile) {
  if (profile.company.description?.trim()) {
    return profile.company.description.trim();
  }

  const parts = [
    profile.company.legalForm ? `${profile.company.legalForm}-registrert virksomhet` : null,
    profile.company.industryCode?.title ?? null,
    profile.company.municipality ? `med registrert adresse i ${profile.company.municipality}` : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return "Kort virksomhetsbeskrivelse er ikke tilgjengelig fra kildedataene.";
  }

  return `${parts.join(", ")}.`;
}

function buildOperationsSummary(
  profile: CompanyProfile,
  assetSnapshot: ReturnType<typeof extractAssetSnapshot>,
  extractedSections?: {
    annualReportExcerpts?: DistressDocumentExcerpt[];
    notesExcerpts?: DistressDocumentExcerpt[];
    auditExcerpts?: DistressDocumentExcerpt[];
  } | null,
) {
  const orderedStatements = [...profile.financialStatements].sort((left, right) => right.fiscalYear - left.fiscalYear);
  const latestStatement = orderedStatements[0] ?? null;
  const previousStatement = orderedStatements[1] ?? null;
  const latestRevenueChange = getRevenueChange(latestStatement?.revenue ?? null, previousStatement?.revenue ?? null);
  const latestEbitMargin = getMargin(latestStatement?.operatingProfit ?? null, latestStatement?.revenue ?? null);
  const latestNetMargin = getMargin(latestStatement?.netIncome ?? null, latestStatement?.revenue ?? null);
  const profitableYearsCount = orderedStatements.filter(
    (statement) => (statement.operatingProfit ?? Number.NEGATIVE_INFINITY) > 0,
  ).length;
  const lossMakingYearsCount = orderedStatements.filter(
    (statement) => (statement.operatingProfit ?? Number.POSITIVE_INFINITY) < 0,
  ).length;
  const documentYears = profile.financialDocuments.map((document) => document.year).sort((left, right) => right - left);
  const annualReportAvailable = profile.financialDocuments.some((document) =>
    document.files.some((file) => file.type === "aarsregnskap" && Boolean(file.url)),
  );
  const operatingSignals: string[] = [];

  if (profile.company.employeeCount !== null && profile.company.employeeCount !== undefined) {
    operatingSignals.push(`Brreg registrerer ${profile.company.employeeCount} ansatte.`);
  }

  if (latestRevenueChange !== null && latestStatement && previousStatement) {
    const direction = latestRevenueChange >= 0 ? "opp" : "ned";
    operatingSignals.push(
      `Omsetningen gikk ${direction} ${Math.abs(latestRevenueChange).toFixed(1)} % fra ${previousStatement.fiscalYear} til ${latestStatement.fiscalYear}.`,
    );
  }

  if (latestEbitMargin !== null && latestStatement) {
    operatingSignals.push(`EBIT-margin i ${latestStatement.fiscalYear} var ${latestEbitMargin.toFixed(1)} %.`);
  }

  if (lossMakingYearsCount >= 2) {
    operatingSignals.push(
      `Selskapet har negative driftsresultater i ${lossMakingYearsCount} av de siste regnskapsårene som er tilgjengelige.`,
    );
  } else if (profitableYearsCount >= 2) {
    operatingSignals.push(
      `Selskapet har positive driftsresultater i ${profitableYearsCount} av de siste regnskapsårene som er tilgjengelige.`,
    );
  }

  if ((assetSnapshot.inventory ?? 0) > 0) {
    operatingSignals.push("Det finnes bokført varelager i siste tilgjengelige regnskapsår.");
  }

  if ((assetSnapshot.receivables ?? 0) > 0) {
    operatingSignals.push("Siste tilgjengelige regnskap viser kundefordringer eller andre fordringer.");
  }

  if ((assetSnapshot.cash ?? 0) > 0) {
    operatingSignals.push("Likvide midler er registrert i siste tilgjengelige regnskap.");
  }

  if (operatingSignals.length === 0) {
    operatingSignals.push(
      "Det finnes foreløpig få strukturerte driftssignaler utover formell status og grunnleggende regnskapstall.",
    );
  }

  const annualReportExcerpts = extractedSections?.annualReportExcerpts ?? [];
  const notesExcerpts = extractedSections?.notesExcerpts ?? [];
  const auditExcerpts = extractedSections?.auditExcerpts ?? [];

  const annualReportExtractStatus = !annualReportAvailable
    ? "Ingen regnskapsdokumenter er tilgjengelige for å lese årsberetning direkte i denne visningen."
    : annualReportExcerpts.length > 0
      ? `Fant ${annualReportExcerpts.length} tekstutdrag fra årsberetning i siste tilgjengelige dokument.`
      : "Fant ikke en tydelig årsberetningsseksjon i det dokumentet som er analysert.";
  const notesExtractStatus = !annualReportAvailable
    ? "Noter kan ikke vises fordi det ikke finnes tilgjengelige årsregnskapsdokumenter i kildene akkurat nå."
    : notesExcerpts.length > 0
      ? `Fant ${notesExcerpts.length} tekstutdrag fra noter i det analyserte dokumentet.`
      : "Fant ikke tydelige noteutdrag i det dokumentet som er analysert.";
  const auditReportExtractStatus = !annualReportAvailable
    ? "Revisjonsberetning kan ikke vurderes fordi dokumentgrunnlaget mangler i denne profilen."
    : auditExcerpts.length > 0
      ? `Fant ${auditExcerpts.length} tekstutdrag fra revisjonsberetning i det analyserte dokumentet.`
      : "Fant ikke en tydelig revisjonsberetning i det dokumentet som er analysert.";

  const documentNotes = [
    annualReportAvailable
      ? `Det finnes offisielle årsregnskapsdokumenter for ${documentYears.length} regnskapsår i selskapets dokumentgrunnlag.`
      : "Det finnes foreløpig ingen klikkbare årsregnskapsdokumenter i dokumentgrunnlaget.",
    "Drift-seksjonen bruker i denne versjonen dokumenttilgjengelighet og regnskapstall, men parser ikke full tekst fra årsberetning, noter eller revisjonsberetning.",
  ];

  return {
    businessDescription: buildBusinessDescription(profile),
    employeeCount: profile.company.employeeCount ?? null,
    foundedYear: profile.company.foundedAt ? profile.company.foundedAt.getFullYear() : null,
    latestRevenueChange,
    latestEbitMargin,
    latestNetMargin,
    profitableYearsCount,
    lossMakingYearsCount,
    documentYears,
    annualReportAvailable,
    annualReportExtractStatus,
    notesExtractStatus,
    auditReportExtractStatus,
    operatingSignals,
    documentNotes,
    documents: profile.financialDocuments,
    annualReportExcerpts,
    notesExcerpts,
    auditExcerpts,
  };
}

export async function refreshDistressFinancialSnapshotForCompany(orgNumber: string) {
  const record = await getDistressCompanyRecord(orgNumber);
  if (!record?.distressProfile) {
    return null;
  }

  const company = mapDbCompany(record);
  const statements = mapDbFinancialStatements(record.financialStatements ?? []);
  const latestStatement = statements[0] ?? null;
  const assetSnapshot = extractAssetSnapshot(latestStatement);
  const sectorCode = buildSectorSummary(company.industryCode)?.code ?? null;
  const sectorLabel =
    record.distressFinancialSnapshot?.sectorLabel ??
    (sectorCode ? await getSectorLabel(sectorCode) : null);
  const hasKeyMetrics = Boolean(
    latestStatement &&
      latestStatement.revenue !== null &&
      latestStatement.operatingProfit !== null &&
      latestStatement.netIncome !== null &&
      latestStatement.assets !== null,
  );

  const equityRatio = calculateEquityRatio(latestStatement?.equity ?? null, latestStatement?.assets ?? null);
  const liquidityRatio = calculateLiquidityRatio(assetSnapshot.currentAssets, assetSnapshot.currentLiabilities);
  const revenueTrend = buildRevenueTrend(statements);
  const distressScore = calculateDistressScore({
    status: record.distressProfile.distressStatus,
    daysInStatus: record.distressProfile.daysInStatus ?? null,
    equityRatio,
    liquidityRatio,
    ebit: latestStatement?.operatingProfit ?? null,
    revenueTrend,
  });

  const snapshot: DistressFinancialSnapshotSummary = {
    financialDatasetMode: record.financialDatasetMode,
    financialDatasetVersion: record.financialDatasetVersion,
    distressStatus: record.distressProfile.distressStatus,
    daysInStatus: record.distressProfile.daysInStatus ?? null,
    industryCode: company.industryCode?.code ?? null,
    sectorCode,
    sectorLabel,
    lastReportedYear: latestStatement?.fiscalYear ?? company.lastSubmittedAnnualReportYear ?? null,
    revenue: latestStatement?.revenue ?? null,
    ebit: latestStatement?.operatingProfit ?? null,
    netIncome: latestStatement?.netIncome ?? null,
    equityRatio,
    assets: latestStatement?.assets ?? null,
    interestBearingDebt:
      latestStatement && typeof latestStatement.rawPayload === "object" && latestStatement.rawPayload
        ? extractInterestBearingDebt(latestStatement.rawPayload as Record<string, unknown>)
        : assetSnapshot.interestBearingDebt ?? null,
    liquidityRatio,
    fixedAssets: assetSnapshot.fixedAssets ?? null,
    inventory: assetSnapshot.inventory ?? null,
    cash: assetSnapshot.cash ?? null,
    revenueTrend,
    distressScore,
    scoreVersion: distressScore === null ? null : DISTRESS_SCORE_VERSION,
    dataCoverage: buildCoverageValue(Boolean(latestStatement), hasKeyMetrics),
    updatedAt: new Date(),
  };

  await upsertDistressFinancialSnapshot(orgNumber, snapshot);
  return snapshot;
}

export async function syncDistressCompany(orgNumber: string) {
  const payload = await distressProvider.getCompanyPayload(orgNumber);
  const company = mapBrregCompany(payload);
  await upsertCompanySnapshot(company);

  const announcements = await announcementsProvider.getAnnouncements(orgNumber).catch(() => ({
    announcements: [],
  }));
  const latestAnnouncement = announcements.announcements
    .filter((item) => Boolean(item.publishedAt))
    .sort((left, right) => compareNullableDates(left.publishedAt ?? null, right.publishedAt ?? null))[0] ?? null;

  const distressProfile = buildDistressProfileFromPayload({
    payload,
    orgNumber,
    fetchedAt: company.fetchedAt,
    normalizedAt: company.normalizedAt,
    lastAnnouncementPublishedAt: latestAnnouncement?.publishedAt ?? null,
    lastAnnouncementTitle: latestAnnouncement?.title ?? null,
  });

  if (!distressProfile) {
    await deleteCompanyDistressData(orgNumber);
    return {
      orgNumber,
      distressStatus: null,
    };
  }

  await upsertCompanyDistressProfile(orgNumber, distressProfile);
  await refreshDistressFinancialSnapshotForCompany(orgNumber);

  return {
    orgNumber,
    distressStatus: distressProfile.distressStatus,
  };
}

export async function syncDistressBootstrap(options?: {
  limit?: number;
  concurrency?: number;
}) {
  const metadata = await distressProvider.getInventoryMetadata();
  let synced = 0;
  const { processed } = await runOrgNumberTasks(
    distressProvider.streamBootstrapOrgNumbers(),
    async (orgNumber) => {
      await syncDistressCompany(orgNumber);
      synced += 1;
    },
    {
      limit: options?.limit,
      concurrency: options?.concurrency ?? DISTRESS_DEFAULT_BOOTSTRAP_CONCURRENCY,
    },
  );

  await upsertDistressSyncState({
    key: DISTRESS_SYNC_KEY,
    lastRunAt: new Date(),
    lastBootstrapAt: new Date(),
    etag: metadata.etag,
    lastModified: metadata.lastModified,
    metadata: {
      processed,
      synced,
      bootstrapCompleted: !options?.limit,
      bootstrapLimit: options?.limit ?? null,
      concurrency: options?.concurrency ?? DISTRESS_DEFAULT_BOOTSTRAP_CONCURRENCY,
    },
  });

  return {
    processed,
    synced,
    etag: metadata.etag,
    lastModified: metadata.lastModified,
  };
}

export async function syncDistressUpdates(options?: {
  pageSize?: number;
  maxPages?: number;
  concurrency?: number;
}) {
  const state = await getDistressSyncState(DISTRESS_SYNC_KEY);
  const pageSize = options?.pageSize ?? 200;
  const maxPages = options?.maxPages ?? 20;
  let nextUpdateId = (state?.lastUpdateId ?? 0) + 1;
  let pagesRead = 0;
  let highestUpdateId = state?.lastUpdateId ?? 0;
  const companyIds = new Set<string>();

  while (pagesRead < maxPages) {
    const updates = await distressProvider.listEntityUpdates(nextUpdateId, pageSize);
    if (updates.length === 0) {
      break;
    }

    for (const update of updates) {
      companyIds.add(update.organisasjonsnummer);
      highestUpdateId = Math.max(highestUpdateId, update.oppdateringsid);
    }

    pagesRead += 1;
    if (updates.length < pageSize) {
      break;
    }

    nextUpdateId = highestUpdateId + 1;
  }

  let synced = 0;
  await runOrgNumberTasks(
    companyIds,
    async (orgNumber) => {
      await syncDistressCompany(orgNumber);
      synced += 1;
    },
    {
      concurrency: options?.concurrency ?? DISTRESS_DEFAULT_UPDATES_CONCURRENCY,
    },
  );

  await upsertDistressSyncState({
    key: DISTRESS_SYNC_KEY,
    lastUpdateId: highestUpdateId,
    lastRunAt: new Date(),
    lastBootstrapAt: state?.lastBootstrapAt ?? null,
    etag: state?.etag ?? null,
    lastModified: state?.lastModified ?? null,
    metadata: {
      pagesRead,
      synced,
      concurrency: options?.concurrency ?? DISTRESS_DEFAULT_UPDATES_CONCURRENCY,
    },
  });

  return {
    pagesRead,
    synced,
    highestUpdateId,
  };
}

/**
 * Recomputes every distress snapshot from the statements already in the database. Unlike
 * `backfillDistressFinancials` this makes no network calls and imports nothing — it exists to
 * populate columns added after the statements were ingested (liquidity, fixed assets, inventory,
 * cash, revenue trend, score) without re-hitting Brreg for data we already hold.
 */
export async function refreshAllDistressSnapshots(options?: { onProgress?: (processed: number, total: number) => void }) {
  const records = await listDistressCompanyRecords({});
  let refreshed = 0;
  let skipped = 0;

  for (const [index, record] of records.entries()) {
    const snapshot = await refreshDistressFinancialSnapshotForCompany(record.company.orgNumber);
    if (snapshot) {
      refreshed += 1;
    } else {
      skipped += 1;
    }

    options?.onProgress?.(index + 1, records.length);
  }

  return {
    total: records.length,
    refreshed,
    skipped,
  };
}

export async function backfillDistressFinancials(options?: {
  orgNumbers?: string[];
}) {
  const orgNumbers = options?.orgNumbers?.length
    ? options.orgNumbers
    : (await listDistressCompanyRecords({})).map((record) => record.company.orgNumber);

  const results: Array<{ orgNumber: string; statementsImported: number }> = [];

  for (const orgNumber of orgNumbers) {
    const result = await importAnnualReportsForCompany(orgNumber);
    await refreshDistressFinancialSnapshotForCompany(orgNumber);
    results.push({
      orgNumber,
      statementsImported: result.statementsImported,
    });
  }

  return {
    processed: results.length,
    results,
  };
}

function hasCompletedFullBootstrap(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }

  const record = metadata as Record<string, unknown>;
  return record.bootstrapCompleted === true;
}

function isSyncStale(lastRunAt?: Date | null) {
  if (!lastRunAt) {
    return true;
  }

  return Date.now() - lastRunAt.getTime() > DISTRESS_SYNC_STALE_MS;
}

function queueFullDistressBootstrap() {
  if (!distressBootstrapPromise) {
    distressBootstrapPromise = syncDistressBootstrap({
      concurrency: DISTRESS_DEFAULT_BOOTSTRAP_CONCURRENCY,
    }).finally(() => {
      distressBootstrapPromise = null;
    });
  }

  return distressBootstrapPromise;
}

function queueDistressUpdates() {
  if (!distressUpdatesPromise) {
    distressUpdatesPromise = syncDistressUpdates({
      concurrency: DISTRESS_DEFAULT_UPDATES_CONCURRENCY,
    }).finally(() => {
      distressUpdatesPromise = null;
    });
  }

  return distressUpdatesPromise;
}

function queueDistressWarmStart() {
  if (!distressWarmStartPromise) {
    distressWarmStartPromise = syncDistressBootstrap({
      limit: DISTRESS_WARM_START_SIZE,
      concurrency: DISTRESS_DEFAULT_BOOTSTRAP_CONCURRENCY,
    }).finally(() => {
      distressWarmStartPromise = null;
    });
  }

  return distressWarmStartPromise;
}

async function ensureDistressCoverage() {
  const [profileCount, syncState] = await Promise.all([
    countDistressProfiles(),
    getDistressSyncState(DISTRESS_SYNC_KEY),
  ]);

  if (profileCount === 0) {
    await queueDistressWarmStart();
    void queueFullDistressBootstrap();
    return;
  }

  if (!hasCompletedFullBootstrap(syncState?.metadata)) {
    void queueFullDistressBootstrap();
  } else if (isSyncStale(syncState?.lastRunAt)) {
    void queueDistressUpdates();
  }
}

function mapRow(
  record: Awaited<ReturnType<typeof listDistressCompanyRecords>>[number],
  activeFinancialDataset: ActiveFinancialDataset,
): DistressCompanyRow {
  const company = mapDbCompany({
    ...record.company,
    roles: [],
    financialStatements: [],
  });
  const storedSnapshot = record.company.distressFinancialSnapshot;
  const snapshot = matchesActiveFinancialDataset(
    storedSnapshot,
    activeFinancialDataset,
  )
    ? storedSnapshot
    : null;

  return {
    company: {
      orgNumber: company.orgNumber,
      slug: company.slug,
      name: company.name,
      legalForm: company.legalForm,
      status: company.status,
      industryCode: company.industryCode,
      municipality: company.municipality,
      addresses: company.addresses,
    },
    distress: {
      status: record.distressStatus,
      label: getDistressStatusLabel(record.distressStatus),
      statusStartedAt: record.statusStartedAt,
      statusObservedAt: record.statusObservedAt,
      // The stored column is frozen at sync time — a company synced the day it went bankrupt reads
      // "0 dager i status" forever. Derive from the start date so the age is true when it is read.
      daysInStatus: calculateDaysInStatus(record.statusStartedAt) ?? record.daysInStatus,
      lastAnnouncementPublishedAt: record.lastAnnouncementPublishedAt,
      lastAnnouncementTitle: record.lastAnnouncementTitle,
    },
    sector: snapshot?.sectorCode
      ? {
          code: snapshot.sectorCode,
          label: snapshot.sectorLabel,
        }
      : null,
    financials: {
      financialDatasetMode:
        snapshot?.financialDatasetMode === "reported" ||
        snapshot?.financialDatasetMode === "simulated"
          ? snapshot.financialDatasetMode
          : null,
      financialDatasetVersion:
        typeof snapshot?.financialDatasetVersion === "string" &&
        /^(?:reported:\d+|simulated:[A-Za-z0-9_-]+:\d+)$/.test(
          snapshot.financialDatasetVersion,
        )
          ? snapshot.financialDatasetVersion as DistressCompanyRow["financials"]["financialDatasetVersion"]
          : null,
      lastReportedYear: snapshot?.lastReportedYear ?? null,
      revenue: toNumber(snapshot?.revenue),
      ebit: toNumber(snapshot?.ebit),
      netIncome: toNumber(snapshot?.netIncome),
      equityRatio: toNumber(snapshot?.equityRatio),
      assets: toNumber(snapshot?.assets),
      interestBearingDebt: toNumber(snapshot?.interestBearingDebt),
      liquidityRatio: toNumber(snapshot?.liquidityRatio),
      fixedAssets: toNumber(snapshot?.fixedAssets),
      inventory: toNumber(snapshot?.inventory),
      cash: toNumber(snapshot?.cash),
      revenueTrend: parseRevenueTrend(snapshot?.revenueTrend),
    },
    distressScore: snapshot?.distressScore ?? null,
    healthScore: toHealthScore(snapshot?.distressScore ?? null),
    scoreVersion: snapshot?.scoreVersion ?? null,
    dataCoverage: snapshot?.dataCoverage ?? "NO_FINANCIALS",
  };
}

function getRealizableAssets(row: DistressCompanyRow) {
  const fixedAssets = row.financials.fixedAssets;
  const inventory = row.financials.inventory;

  if (
    (fixedAssets === null || fixedAssets === undefined) &&
    (inventory === null || inventory === undefined)
  ) {
    return null;
  }

  return (fixedAssets ?? 0) + (inventory ?? 0);
}

function sortRows(rows: DistressCompanyRow[], sort: SortKey | null) {
  const resolvedSort = sort ?? "daysInStatus_desc";

  return [...rows].sort((left, right) => {
    const defaultSort =
      compareNullableNumbers(left.distress.daysInStatus, right.distress.daysInStatus) ||
      compareNullableDates(
        left.distress.lastAnnouncementPublishedAt ?? null,
        right.distress.lastAnnouncementPublishedAt ?? null,
      ) ||
      left.company.name.localeCompare(right.company.name, "nb-NO");

    switch (resolvedSort) {
      case "name_asc":
        return compareNullableStrings(left.company.name, right.company.name, "asc") || defaultSort;
      case "name_desc":
        return compareNullableStrings(left.company.name, right.company.name, "desc") || defaultSort;
      case "distressStatus_asc":
        return compareNullableStrings(left.distress.label, right.distress.label, "asc") || defaultSort;
      case "distressStatus_desc":
        return compareNullableStrings(left.distress.label, right.distress.label, "desc") || defaultSort;
      case "daysInStatus_asc":
        return compareNullableNumbers(left.distress.daysInStatus, right.distress.daysInStatus, "asc") || defaultSort;
      case "lastAnnouncementPublishedAt_desc":
        return (
          compareNullableDates(
            left.distress.lastAnnouncementPublishedAt ?? null,
            right.distress.lastAnnouncementPublishedAt ?? null,
          ) || defaultSort
        );
      case "lastAnnouncementPublishedAt_asc":
        return (
          compareNullableDates(
            right.distress.lastAnnouncementPublishedAt ?? null,
            left.distress.lastAnnouncementPublishedAt ?? null,
          ) || defaultSort
        );
      case "industryCode_asc":
        return compareNullableStrings(left.company.industryCode?.code, right.company.industryCode?.code, "asc") || defaultSort;
      case "industryCode_desc":
        return compareNullableStrings(left.company.industryCode?.code, right.company.industryCode?.code, "desc") || defaultSort;
      case "sector_asc":
        return compareNullableStrings(left.sector?.code, right.sector?.code, "asc") || defaultSort;
      case "sector_desc":
        return compareNullableStrings(left.sector?.code, right.sector?.code, "desc") || defaultSort;
      case "lastReportedYear_desc":
        return compareNullableNumbers(left.financials.lastReportedYear, right.financials.lastReportedYear) || defaultSort;
      case "lastReportedYear_asc":
        return compareNullableNumbers(left.financials.lastReportedYear, right.financials.lastReportedYear, "asc") || defaultSort;
      case "revenue_desc":
        return compareNullableNumbers(left.financials.revenue, right.financials.revenue) || defaultSort;
      case "revenue_asc":
        return compareNullableNumbers(left.financials.revenue, right.financials.revenue, "asc") || defaultSort;
      case "ebit_desc":
        return compareNullableNumbers(left.financials.ebit, right.financials.ebit) || defaultSort;
      case "ebit_asc":
        return compareNullableNumbers(left.financials.ebit, right.financials.ebit, "asc") || defaultSort;
      case "netIncome_desc":
        return compareNullableNumbers(left.financials.netIncome, right.financials.netIncome) || defaultSort;
      case "netIncome_asc":
        return compareNullableNumbers(left.financials.netIncome, right.financials.netIncome, "asc") || defaultSort;
      case "equityRatio_desc":
        return compareNullableNumbers(left.financials.equityRatio, right.financials.equityRatio) || defaultSort;
      case "equityRatio_asc":
        return compareNullableNumbers(left.financials.equityRatio, right.financials.equityRatio, "asc") || defaultSort;
      case "assets_desc":
        return compareNullableNumbers(left.financials.assets, right.financials.assets) || defaultSort;
      case "assets_asc":
        return compareNullableNumbers(left.financials.assets, right.financials.assets, "asc") || defaultSort;
      case "interestBearingDebt_desc":
        return compareNullableNumbers(left.financials.interestBearingDebt, right.financials.interestBearingDebt) || defaultSort;
      case "interestBearingDebt_asc":
        return (
          compareNullableNumbers(left.financials.interestBearingDebt, right.financials.interestBearingDebt, "asc") ||
          defaultSort
        );
      case "healthScore_desc":
        return compareNullsLast(left.healthScore, right.healthScore, "desc") || defaultSort;
      case "healthScore_asc":
        return compareNullsLast(left.healthScore, right.healthScore, "asc") || defaultSort;
      case "liquidityRatio_desc":
        return compareNullsLast(left.financials.liquidityRatio, right.financials.liquidityRatio, "desc") || defaultSort;
      case "liquidityRatio_asc":
        return compareNullsLast(left.financials.liquidityRatio, right.financials.liquidityRatio, "asc") || defaultSort;
      case "realizableAssets_desc":
        return compareNullsLast(getRealizableAssets(left), getRealizableAssets(right), "desc") || defaultSort;
      case "realizableAssets_asc":
        return compareNullsLast(getRealizableAssets(left), getRealizableAssets(right), "asc") || defaultSort;
      case "daysInStatus_desc":
      default:
        return defaultSort;
    }
  });
}

function buildBestFitRows(rows: DistressCompanyRow[]) {
  return [...rows]
    .sort((left, right) => {
      const scoreDelta = getBestFitScore(right) - getBestFitScore(left);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return (
        compareNullableNumbers(left.distress.daysInStatus, right.distress.daysInStatus) ||
        compareNullableDates(
          left.distress.lastAnnouncementPublishedAt ?? null,
          right.distress.lastAnnouncementPublishedAt ?? null,
        ) ||
        left.company.name.localeCompare(right.company.name, "nb-NO")
      );
    })
    .slice(0, DISTRESS_BEST_FIT_LIMIT);
}

function buildDistressSearchHref(workspaceId: string, params: Record<string, string>) {
  const searchParams = new URLSearchParams(params);
  return `/workspaces/${workspaceId}/distress/search?${searchParams.toString()}`;
}

export async function listDistressCompaniesForWorkspace(
  actorUserId: string,
  workspaceId: string,
  filters: DistressSearchFilters,
): Promise<DistressScreeningResponse> {
  await requireWorkspaceMembership(actorUserId, workspaceId);
  await ensureDistressCoverage();

  const view = filters.view ?? "BEST_FIT";
  const page = Math.max(0, filters.page ?? 0);
  const size = Math.max(1, Math.min(filters.size ?? 50, 200));
  const activeFinancialDataset = await getActiveDistressFinancialDataset();
  const allRows = (
    await listDistressCompanyRecords(filters, activeFinancialDataset)
  ).map((record) => mapRow(record, activeFinancialDataset));
  const visibleRows = view === "BEST_FIT" ? buildBestFitRows(allRows) : allRows;
  const resolvedSort = resolveSort(filters.sort);
  const rows = view === "BEST_FIT" && !resolvedSort ? visibleRows : sortRows(visibleRows, resolvedSort);
  const start = page * size;

  return {
    ...activeFinancialDataset,
    items: rows.slice(start, start + size),
    totalCount: rows.length,
    totalUniverseCount: allRows.length,
    page,
    size,
    view,
  };
}

function buildModuleKpis(rows: DistressCompanyRow[]): DistressModuleKpis {
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const scored = rows.filter(
    (row): row is DistressCompanyRow & { healthScore: number } =>
      row.healthScore !== null && row.healthScore !== undefined,
  );

  return {
    newBankruptcies30d: rows.filter(
      (row) =>
        row.distress.status === "BANKRUPTCY" &&
        (row.distress.statusStartedAt?.getTime() ?? 0) >= recentCutoff,
    ).length,
    underRestructuring: rows.filter((row) => row.distress.status === "RECONSTRUCTION").length,
    withRealizableAssets: rows.filter((row) => (row.financials.assets ?? 0) >= DISTRESS_ASSETS_THRESHOLD).length,
    avgHealthScore:
      scored.length > 0
        ? Math.round(scored.reduce((total, row) => total + row.healthScore, 0) / scored.length)
        : null,
    scoredCount: scored.length,
    universeCount: rows.length,
  };
}

function buildModuleSectors(rows: DistressCompanyRow[]): DistressModuleSectorRow[] {
  const aggregate = new Map<
    string,
    {
      sectorCode: string;
      sectorLabel: string | null;
      companyCount: number;
      bankruptcyCount: number;
      healthTotal: number;
      healthCount: number;
      totalAssets: number | null;
    }
  >();

  for (const row of rows) {
    const sectorCode = row.sector?.code;
    if (!sectorCode) {
      continue;
    }

    const entry = aggregate.get(sectorCode) ?? {
      sectorCode,
      sectorLabel: row.sector?.label ?? null,
      companyCount: 0,
      bankruptcyCount: 0,
      healthTotal: 0,
      healthCount: 0,
      totalAssets: null,
    };

    entry.companyCount += 1;
    if (row.distress.status === "BANKRUPTCY") {
      entry.bankruptcyCount += 1;
    }

    if (row.healthScore !== null && row.healthScore !== undefined) {
      entry.healthTotal += row.healthScore;
      entry.healthCount += 1;
    }

    if ((row.financials.assets ?? null) !== null) {
      entry.totalAssets = (entry.totalAssets ?? 0) + (row.financials.assets as number);
    }

    aggregate.set(sectorCode, entry);
  }

  return [...aggregate.values()]
    .map((entry) => ({
      sectorCode: entry.sectorCode,
      sectorLabel: entry.sectorLabel,
      companyCount: entry.companyCount,
      bankruptcyCount: entry.bankruptcyCount,
      avgHealthScore: entry.healthCount > 0 ? Math.round(entry.healthTotal / entry.healthCount) : null,
      totalAssets: entry.totalAssets,
    }))
    // Weakest sectors first — that is the question the section header asks.
    .sort(
      (left, right) =>
        (left.avgHealthScore ?? Number.POSITIVE_INFINITY) - (right.avgHealthScore ?? Number.POSITIVE_INFINITY) ||
        right.companyCount - left.companyCount ||
        left.sectorCode.localeCompare(right.sectorCode, "nb-NO"),
    );
}

/**
 * The whole distress universe, unpaginated, with its sector aggregate. Njord answers over this:
 * ranking "the five biggest" across a paginated slice would quietly rank the wrong five.
 */
export async function getDistressUniverseForWorkspace(
  actorUserId: string,
  workspaceId: string,
): Promise<{
  financialDatasetMode: ActiveFinancialDataset["financialDatasetMode"];
  financialDatasetVersion: ActiveFinancialDataset["financialDatasetVersion"];
  rows: DistressCompanyRow[];
  sectors: DistressModuleSectorRow[];
}> {
  await requireWorkspaceMembership(actorUserId, workspaceId);
  await ensureDistressCoverage();

  const activeFinancialDataset = await getActiveDistressFinancialDataset();
  const rows = (
    await listDistressCompanyRecords({}, activeFinancialDataset)
  ).map((record) => mapRow(record, activeFinancialDataset));
  return {
    ...activeFinancialDataset,
    rows,
    sectors: buildModuleSectors(rows),
  };
}

/**
 * Everything the distress module page renders in one round trip: the filtered + sorted table page,
 * the KPI strip and the sector breakdown. KPIs and sectors are computed over the whole filtered
 * universe rather than the visible page, so paging through the table does not move them.
 */
export async function getDistressModuleForWorkspace(
  actorUserId: string,
  workspaceId: string,
  filters: DistressSearchFilters,
): Promise<DistressModuleResponse> {
  await requireWorkspaceMembership(actorUserId, workspaceId);
  await ensureDistressCoverage();

  const view = filters.view ?? "BEST_FIT";
  const page = Math.max(0, filters.page ?? 0);
  const size = Math.max(1, Math.min(filters.size ?? 50, 200));
  const activeFinancialDataset = await getActiveDistressFinancialDataset();
  const allRows = (
    await listDistressCompanyRecords(filters, activeFinancialDataset)
  ).map((record) => mapRow(record, activeFinancialDataset));
  const visibleRows = view === "BEST_FIT" ? buildBestFitRows(allRows) : allRows;
  const resolvedSort = resolveSort(filters.sort);
  const rows = view === "BEST_FIT" && !resolvedSort ? visibleRows : sortRows(visibleRows, resolvedSort);
  const start = page * size;
  const [rawFilterOptions, distressUniverseCount] = await Promise.all([
    listDistressFilterOptions(activeFinancialDataset),
    countDistressProfiles(),
  ]);

  return {
    ...activeFinancialDataset,
    items: rows.slice(start, start + size),
    totalCount: rows.length,
    totalUniverseCount: allRows.length,
    distressUniverseCount,
    page,
    size,
    view,
    kpis: buildModuleKpis(allRows),
    sectors: buildModuleSectors(allRows),
    filterOptions: mapDistressFilterOptions(rawFilterOptions),
  };
}

function mapDistressFilterOptions(
  options: DistressFilterOptions,
): DistressFilterOptions {
  return {
    financialDatasetMode: options.financialDatasetMode,
    financialDatasetVersion: options.financialDatasetVersion,
    statuses: options.statuses.map((option) => ({
      ...option,
      label: getDistressStatusLabel(
        option.value as DistressCompanyRow["distress"]["status"],
      ),
    })),
    industryCodes: options.industryCodes.map((option) => ({
      ...option,
      label:
        option.label && option.label !== option.value
          ? `${option.value} ${option.label}`
          : option.value,
    })),
    sectors: options.sectors.map((option) => ({
      ...option,
      label:
        option.label && option.label !== option.value
          ? `${option.value} ${option.label}`
          : option.value,
    })),
  };
}

export async function getDistressFilterOptionsForWorkspace(
  actorUserId: string,
  workspaceId: string,
): Promise<DistressFilterOptions> {
  await requireWorkspaceMembership(actorUserId, workspaceId);
  await ensureDistressCoverage();

  const activeFinancialDataset = await getActiveDistressFinancialDataset();
  return mapDistressFilterOptions(
    await listDistressFilterOptions(activeFinancialDataset),
  );
}

export async function getDistressOverviewForWorkspace(
  actorUserId: string,
  workspaceId: string,
): Promise<DistressOverviewResponse> {
  await requireWorkspaceMembership(actorUserId, workspaceId);
  await ensureDistressCoverage();

  const activeFinancialDataset = await getActiveDistressFinancialDataset();
  const [counts, statusDistribution, sectors, timeline, recentAnnouncements] = await Promise.all([
    getDistressOverviewCounts(activeFinancialDataset),
    getDistressStatusDistribution(),
    getDistressSectorOverview(8, activeFinancialDataset),
    getDistressTimelineByMonth(12),
    getDistressRecentAnnouncements(8),
  ]);

  const financialsCoverageRate =
    counts.totalActiveCases > 0 ? (counts.withFinancialCoverageCount / counts.totalActiveCases) * 100 : null;

  const mappedStatuses = statusDistribution.map((row) => ({
    status: row.distressStatus,
    label: getDistressStatusLabel(row.distressStatus),
    count: row._count._all,
  }));

  const mappedAnnouncements = recentAnnouncements.map((row) => ({
    orgNumber: row.company.orgNumber,
    companyName: row.company.name,
    status: row.distressStatus,
    statusLabel: getDistressStatusLabel(row.distressStatus),
    title: row.lastAnnouncementTitle,
    publishedAt: row.lastAnnouncementPublishedAt,
  }));

  const topSector = sectors[0] ?? null;
  const opportunities = [
    {
      key: "reconstruction",
      title: "Rekonstruksjonssaker",
      description: "Saker med aktiv rekonstruksjonsprosess.",
      href: buildDistressSearchHref(workspaceId, {
        status: "RECONSTRUCTION",
        view: "ALL",
      }),
      count: counts.reconstructions,
    },
    {
      key: "bankruptcy",
      title: "Konkurser",
      description: "Konkursprofiler sortert i full universvisning.",
      href: buildDistressSearchHref(workspaceId, {
        status: "BANKRUPTCY",
        view: "ALL",
      }),
      count: counts.bankruptcies,
    },
    {
      key: "forced-process",
      title: "Tvangsprosesser",
      description: "Foretak med tvangsoppløsning eller annen tvangsprosess.",
      href: buildDistressSearchHref(workspaceId, {
        status: "FORCED_PROCESS",
        view: "ALL",
      }),
      count: counts.forcedProcesses,
    },
    {
      key: "recent-signals",
      title: "Nye signaler siste 30 dager",
      description: "Siste kunngjøringer med ferske distress-hendelser.",
      href: buildDistressSearchHref(workspaceId, {
        sort: "lastAnnouncementPublishedAt_desc",
        view: "ALL",
      }),
      count: counts.recentAnnouncements30d,
    },
    {
      key: "financial-coverage",
      title: "Med regnskapsdekning",
      description: "Kandidater med tilgjengelige eller delvise finansielle signaler.",
      href: buildDistressSearchHref(workspaceId, {
        view: "BEST_FIT",
      }),
      count: counts.withFinancialCoverageCount,
    },
    {
      key: "top-sector",
      title: topSector ? `Sektor ${topSector.sectorCode}` : "Sektorinnsikt",
      description: topSector
        ? `Sektoren med flest distress-profiler akkurat nå (${topSector.sectorLabel}).`
        : "Åpne screeneren med sektorfilter.",
      href: topSector
        ? buildDistressSearchHref(workspaceId, {
            sectorCode: topSector.sectorCode,
            view: "ALL",
          })
        : buildDistressSearchHref(workspaceId, { view: "ALL" }),
      count: topSector?.companyCount ?? 0,
    },
  ];

  return {
    ...activeFinancialDataset,
    kpis: {
      totalActiveCases: counts.totalActiveCases,
      recentAnnouncements30d: counts.recentAnnouncements30d,
      bankruptcies: counts.bankruptcies,
      liquidations: counts.liquidations,
      reconstructions: counts.reconstructions,
      forcedProcesses: counts.forcedProcesses,
      financialsCoverageRate,
    },
    statusDistribution: mappedStatuses,
    sectors,
    timeline,
    recentAnnouncements: mappedAnnouncements,
    opportunities,
  };
}

export async function getDistressCompanyDetailForWorkspace(
  actorUserId: string,
  workspaceId: string,
  companySlug: string,
): Promise<DistressCompanyDetail | null> {
  await requireWorkspaceMembership(actorUserId, workspaceId);

  const record = await getDistressCompanyRecord(companySlug);
  if (!record?.distressProfile) {
    return null;
  }

  const [profile, announcementsData] = await Promise.all([
    getCompanyProfile(record.orgNumber),
    getCompanyAnnouncements(record.orgNumber),
  ]);

  if (!profile) {
    return null;
  }

  // Annual-report excerpts previously came from downloading and parsing the
  // latest PDF here, inside the request. The public source gate already returns
  // no documents in beta, so this produced nothing — but it was reachable again
  // the moment BETA_STRUCTURED_FINANCIALS_ONLY was turned off. GL-A04 requires
  // OCR to be unreachable structurally, not by environment variable, so the
  // call is gone. Excerpts stay empty until a source with a real document
  // contract replaces it.
  const extractedSections = null;

  const latestStatement = profile.financialStatements[0] ?? null;
  if (!profile.financialDatasetMode || !profile.financialDatasetVersion) {
    throw new Error("Financial dataset metadata is unavailable for distress analysis.");
  }
  const persistedSnapshot = record.distressFinancialSnapshot;
  const shouldRefreshSnapshot =
    !persistedSnapshot ||
    persistedSnapshot.financialDatasetMode !== profile.financialDatasetMode ||
    persistedSnapshot.financialDatasetVersion !== profile.financialDatasetVersion ||
    (latestStatement !== null &&
      (persistedSnapshot.lastReportedYear !== latestStatement.fiscalYear ||
        persistedSnapshot.dataCoverage === "NO_FINANCIALS" ||
        (persistedSnapshot.revenue === null && latestStatement.revenue !== null) ||
        (persistedSnapshot.ebit === null && latestStatement.operatingProfit !== null) ||
        (persistedSnapshot.netIncome === null && latestStatement.netIncome !== null) ||
        (persistedSnapshot.assets === null && latestStatement.assets !== null)));

  const snapshot = shouldRefreshSnapshot
    ? await refreshDistressFinancialSnapshotForCompany(record.orgNumber)
    : persistedSnapshot
      ? {
          financialDatasetMode: profile.financialDatasetMode,
          financialDatasetVersion: profile.financialDatasetVersion,
          distressStatus: persistedSnapshot.distressStatus as PrismaDistressStatus,
          daysInStatus: persistedSnapshot.daysInStatus,
          industryCode: persistedSnapshot.industryCode,
          sectorCode: persistedSnapshot.sectorCode,
          sectorLabel: persistedSnapshot.sectorLabel,
          lastReportedYear: persistedSnapshot.lastReportedYear,
          revenue: toNumber(persistedSnapshot.revenue),
          ebit: toNumber(persistedSnapshot.ebit),
          netIncome: toNumber(persistedSnapshot.netIncome),
          equityRatio: toNumber(persistedSnapshot.equityRatio),
          assets: toNumber(persistedSnapshot.assets),
          interestBearingDebt: toNumber(persistedSnapshot.interestBearingDebt),
          distressScore: persistedSnapshot.distressScore,
          scoreVersion: persistedSnapshot.scoreVersion,
          dataCoverage: persistedSnapshot.dataCoverage,
          updatedAt: persistedSnapshot.updatedAt,
        }
      : null;
  if (
    snapshot &&
    snapshot.financialDatasetVersion !== profile.financialDatasetVersion
  ) {
    throw new Error("Financial dataset changed while distress analysis was being prepared.");
  }
  const trends = profile.financialStatements
    .slice(0, 5)
    .map(buildDistressFinancialTrend)
    .sort((left, right) => right.fiscalYear - left.fiscalYear);
  const assetSnapshot = extractAssetSnapshot(latestStatement);
  const operations = buildOperationsSummary(profile, assetSnapshot, extractedSections);
  const sector = buildSectorSummary(profile.company.industryCode, snapshot?.sectorLabel ?? null);

  return {
    company: profile.company,
    distress: {
      status: record.distressProfile.distressStatus,
      label: getDistressStatusLabel(record.distressProfile.distressStatus),
      statusStartedAt: record.distressProfile.statusStartedAt,
      statusObservedAt: record.distressProfile.statusObservedAt,
      daysInStatus: record.distressProfile.daysInStatus,
      lastAnnouncementPublishedAt: record.distressProfile.lastAnnouncementPublishedAt,
      lastAnnouncementTitle: record.distressProfile.lastAnnouncementTitle,
    },
    sector,
    financials: {
      financialDatasetMode: profile.financialDatasetMode,
      financialDatasetVersion: profile.financialDatasetVersion,
      snapshot: snapshot ?? null,
      trends,
    },
    assetSnapshot,
    operations,
    coverage: {
      dataCoverage: snapshot?.dataCoverage ?? "NO_FINANCIALS",
      financialsAvailable: profile.financialStatements.length > 0,
      latestFinancialYear: latestStatement?.fiscalYear ?? null,
      sourceNotes: [
        "Distress-status og datoer er hentet fra Brønnøysundregistrene.",
        profile.financialStatements.length > 0
          ? "Regnskapstallene bygger på Fjord Insight sin normalisering av offisielle Brreg-kopier av årsregnskap."
          : "Ingen regnskapstall er lagret for denne distress-kandidaten ennå.",
        profile.financialDocuments.length > 0
          ? "Offisielle regnskapsdokumenter er tilgjengelige og kan brukes som dokumentgrunnlag for videre vurdering."
          : "Det finnes ikke tilgjengelige regnskapsdokumenter i dokumentgrunnlaget akkurat nå.",
        assetSnapshot.interestBearingDebt !== null
          ? "Rentebærende gjeld vises bare når den kan identifiseres eksplisitt i årsregnskapet."
          : "Rentebærende gjeld kunne ikke identifiseres sikkert og er derfor utelatt.",
      ],
    },
    announcements: announcementsData.announcements,
  };
}

export async function importAndRefreshDistressFinancials(orgNumber: string) {
  const result = await importAnnualReportsForCompany(orgNumber);
  await refreshDistressFinancialSnapshotForCompany(orgNumber);
  return result;
}

export async function seedDistressCompany(orgNumber: string) {
  const company = await companyProvider.getCompany(orgNumber);
  if (!company) {
    throw new Error(`Fant ikke virksomhet ${orgNumber}.`);
  }

  await upsertCompanySnapshot(company);
  await syncDistressCompany(orgNumber);
}
