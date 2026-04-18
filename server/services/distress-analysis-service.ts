import { DistressStatus as PrismaDistressStatus } from "@prisma/client";

import { BrregAnnouncementsProvider } from "@/integrations/brreg/brreg-announcements-provider";
import { extractDocumentSectionsFromFinancialDocument } from "@/integrations/brreg/annual-report-document-extractor";
import { BrregCompanyProvider } from "@/integrations/brreg/brreg-company-provider";
import { BrregDistressProvider } from "@/integrations/brreg/brreg-distress-provider";
import { mapBrregCompany } from "@/integrations/brreg/mappers";
import { SsbIndustryCodeProvider } from "@/integrations/ssb/ssb-industry-code-provider";
import {
  buildDistressFinancialTrend,
  buildDistressProfileFromPayload,
  buildSectorSummary,
  calculateEquityRatio,
  extractAssetSnapshot,
  extractInterestBearingDebt,
  getDistressStatusLabel,
} from "@/lib/distress";
import { logRecoverableError } from "@/lib/recoverable-error";
import {
  CompanyProfile,
  DistressCompanyDetail,
  DistressCompanyRow,
  DistressFilterOptions,
  DistressFinancialSnapshotSummary,
  DistressOverviewResponse,
  DistressScreeningResponse,
  DistressSearchFilters,
} from "@/lib/types";
import { mapDbCompany, mapDbFinancialStatements } from "@/server/mappers/db-mappers";
import {
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
  extractedSections?: Awaited<ReturnType<typeof extractDocumentSectionsFromFinancialDocument>> | null,
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

  const snapshot: DistressFinancialSnapshotSummary = {
    distressStatus: record.distressProfile.distressStatus,
    daysInStatus: record.distressProfile.daysInStatus ?? null,
    industryCode: company.industryCode?.code ?? null,
    sectorCode,
    sectorLabel,
    lastReportedYear: latestStatement?.fiscalYear ?? company.lastSubmittedAnnualReportYear ?? null,
    revenue: latestStatement?.revenue ?? null,
    ebit: latestStatement?.operatingProfit ?? null,
    netIncome: latestStatement?.netIncome ?? null,
    equityRatio: calculateEquityRatio(latestStatement?.equity ?? null, latestStatement?.assets ?? null),
    assets: latestStatement?.assets ?? null,
    interestBearingDebt:
      latestStatement && typeof latestStatement.rawPayload === "object" && latestStatement.rawPayload
        ? extractInterestBearingDebt(latestStatement.rawPayload as Record<string, unknown>)
        : assetSnapshot.interestBearingDebt ?? null,
    distressScore: null,
    scoreVersion: null,
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

function mapRow(record: Awaited<ReturnType<typeof listDistressCompanyRecords>>[number]): DistressCompanyRow {
  const company = mapDbCompany({
    ...record.company,
    roles: [],
    financialStatements: [],
  });
  const snapshot = record.company.distressFinancialSnapshot;

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
      daysInStatus: record.daysInStatus,
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
      lastReportedYear: snapshot?.lastReportedYear ?? null,
      revenue: toNumber(snapshot?.revenue),
      ebit: toNumber(snapshot?.ebit),
      netIncome: toNumber(snapshot?.netIncome),
      equityRatio: toNumber(snapshot?.equityRatio),
      assets: toNumber(snapshot?.assets),
      interestBearingDebt: toNumber(snapshot?.interestBearingDebt),
    },
    distressScore: snapshot?.distressScore ?? null,
    scoreVersion: snapshot?.scoreVersion ?? null,
    dataCoverage: snapshot?.dataCoverage ?? "NO_FINANCIALS",
  };
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
  const allRows = (await listDistressCompanyRecords(filters)).map(mapRow);
  const visibleRows = view === "BEST_FIT" ? buildBestFitRows(allRows) : allRows;
  const resolvedSort = resolveSort(filters.sort);
  const rows = view === "BEST_FIT" && !resolvedSort ? visibleRows : sortRows(visibleRows, resolvedSort);
  const start = page * size;

  return {
    items: rows.slice(start, start + size),
    totalCount: rows.length,
    totalUniverseCount: allRows.length,
    page,
    size,
    view,
  };
}

export async function getDistressFilterOptionsForWorkspace(
  actorUserId: string,
  workspaceId: string,
): Promise<DistressFilterOptions> {
  await requireWorkspaceMembership(actorUserId, workspaceId);
  await ensureDistressCoverage();

  const options = await listDistressFilterOptions();

  return {
    statuses: options.statuses.map((option) => ({
      ...option,
      label: getDistressStatusLabel(option.value as DistressCompanyRow["distress"]["status"]),
    })),
    industryCodes: options.industryCodes.map((option) => ({
      ...option,
      label: option.label && option.label !== option.value ? `${option.value} ${option.label}` : option.value,
    })),
    sectors: options.sectors.map((option) => ({
      ...option,
      label: option.label && option.label !== option.value ? `${option.value} ${option.label}` : option.value,
    })),
  };
}

export async function getDistressOverviewForWorkspace(
  actorUserId: string,
  workspaceId: string,
): Promise<DistressOverviewResponse> {
  await requireWorkspaceMembership(actorUserId, workspaceId);
  await ensureDistressCoverage();

  const [counts, statusDistribution, sectors, timeline, recentAnnouncements] = await Promise.all([
    getDistressOverviewCounts(),
    getDistressStatusDistribution(),
    getDistressSectorOverview(),
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

  const latestDocumentWithUrl =
    [...profile.financialDocuments]
      .sort((left, right) => right.year - left.year)
      .find((document) => document.files.some((file) => Boolean(file.url))) ?? null;
  const extractedSections = latestDocumentWithUrl
    ? await extractDocumentSectionsFromFinancialDocument(latestDocumentWithUrl).catch((error) => {
        logRecoverableError("distress-analysis.extractDocumentSections", error, {
          orgNumber: record.orgNumber,
          documentYear: latestDocumentWithUrl.year,
        });
        return null;
      })
    : null;

  const latestStatement = profile.financialStatements[0] ?? null;
  const persistedSnapshot = record.distressFinancialSnapshot;
  const shouldRefreshSnapshot =
    !persistedSnapshot ||
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
          ? "Regnskapstallene bygger på ProjectX sin normalisering av offisielle Brreg-kopier av årsregnskap."
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
