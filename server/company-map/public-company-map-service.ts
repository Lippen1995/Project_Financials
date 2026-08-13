import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  collectCompanyMapRanges,
  type CompanyMapCompaniesQuery,
  type CompanyMapCoverageQuery,
  type CompanyMapRangeQuery,
  type CompanyMapViewportQuery,
} from "@/lib/company-map";
import {
  companyMapEntityPredicate,
  companyMapFinancialRangePredicate,
  type CompanyMapFilterSelection,
} from "@/server/company-map/company-map-filters";
import type { CompanyMapAddressResolutionStatus } from "@/server/company-map/address-resolution";
import { formatCompanyMapGroupLabel } from "@/server/company-map/company-list";
import { COMPANY_MAP_FINANCIAL_PROJECTION_VERSION } from "@/server/company-map/financial-projection";
import {
  getCompanyMapGridCellSize,
  getCompanyMapViewportMode,
} from "@/server/company-map/viewport";
import {
  CompanyMapFinancialDatasetInactiveError,
  financialsRepository,
} from "@/server/financials/financials-repository";

export class CompanyMapNotPublishedError extends Error {
  constructor() {
    super("No complete company-map snapshot has been published.");
    this.name = "CompanyMapNotPublishedError";
  }
}

type OmissionStatus = Exclude<CompanyMapAddressResolutionStatus, "MATCHED">;

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

async function requireActiveCompanyMapFinancials<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    if (error instanceof CompanyMapFinancialDatasetInactiveError) {
      throw new CompanyMapNotPublishedError();
    }
    throw error;
  }
}

const ENTITY_ALIAS = Prisma.raw("entity");
const RANGE_ALIAS = Prisma.raw("range_financial");

type CompanyMapQueryFilters = CompanyMapRangeQuery &
  Pick<
    CompanyMapCoverageQuery,
    | "organisationForms"
    | "companyStatuses"
    | "search"
    | "counties"
    | "onlyGroupMembers"
    | "requirePublishedFinancials"
    | "statementScope"
    | "currency"
  >;

/**
 * The coverage and viewport queries read the entity snapshot directly, so a financial range has to
 * be answered by a matching published statement rather than a column on the row in hand. The
 * dataset version is pinned to the publication the caller already validated.
 */
function filterSelection(
  query: CompanyMapQueryFilters,
): CompanyMapFilterSelection {
  return {
    organisationForms: query.organisationForms,
    companyStatuses: query.companyStatuses,
    search: query.search,
    counties: query.counties,
    onlyGroupMembers: query.onlyGroupMembers,
    requirePublishedFinancials: query.requirePublishedFinancials,
    ranges: collectCompanyMapRanges(query),
  };
}

function filterExpression(
  query: CompanyMapQueryFilters,
  build: { buildId: string; financialDatasetVersion: string },
): Prisma.Sql {
  const filters = filterSelection(query);
  const rangePredicate = companyMapFinancialRangePredicate({
    alias: RANGE_ALIAS,
    filters,
  });
  const rangeFilter = rangePredicate
    ? Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM "CompanyMapFinancialSnapshot" ${RANGE_ALIAS}
          WHERE ${RANGE_ALIAS}."buildId" = ${build.buildId}::uuid
            AND ${RANGE_ALIAS}."orgNumber" = entity."orgNumber"
            AND ${RANGE_ALIAS}."statementScope" = ${query.statementScope}::"StatementScope"
            AND ${RANGE_ALIAS}."currency" = ${query.currency}
            AND ${RANGE_ALIAS}."valueOrigin" = 'reported'
            AND ${RANGE_ALIAS}."financialDatasetVersion" = ${build.financialDatasetVersion}
            AND ${rangePredicate}
        )
      `
    : Prisma.empty;
  return Prisma.sql`
    ${companyMapEntityPredicate({ alias: ENTITY_ALIAS, filters })}
    ${rangeFilter}
  `;
}

type CompanyMapClusterRow = {
  id: string;
  latitude: number;
  longitude: number;
  companyCount: bigint;
  addressCount: bigint;
};

type CompanyMapAddressRow = {
  officialAddressId: string;
  latitude: number;
  longitude: number;
  companyCount: bigint;
};

export function buildCompanyMapClusterQuery({
  buildId,
  filters,
  viewport,
  cellSize,
  rowLimit,
}: {
  buildId: string;
  filters: Prisma.Sql;
  viewport: Pick<
    CompanyMapViewportQuery,
    "south" | "north" | "west" | "east"
  >;
  cellSize: number;
  rowLimit: number;
}) {
  return Prisma.sql`
    SELECT
      concat(
        'grid:',
        floor(entity."latitude"::double precision / ${cellSize}),
        ':',
        floor(entity."longitude"::double precision / ${cellSize})
      ) AS "id",
      avg(entity."latitude"::double precision) AS "latitude",
      avg(entity."longitude"::double precision) AS "longitude",
      count(*)::bigint AS "companyCount",
      count(DISTINCT entity."officialAddressId")::bigint AS "addressCount"
    FROM "CompanyMapEntitySnapshot" entity
    WHERE entity."buildId" = ${buildId}::uuid
      AND entity."resolutionStatus" = 'MATCHED'
      AND entity."latitude" BETWEEN ${viewport.south} AND ${viewport.north}
      AND entity."longitude" BETWEEN ${viewport.west} AND ${viewport.east}
      AND ${filters}
    GROUP BY 1
    ORDER BY count(*) DESC, "id" ASC
    LIMIT ${rowLimit}
  `;
}

async function getPublication() {
  const publication = await prisma.companyMapPublication.findUnique({
    where: { channel: "public" },
    include: {
      build: { include: { addressDataset: true, registryImport: true } },
    },
  });
  if (
    !publication ||
    publication.build.status !== "PUBLISHED" ||
    publication.build.addressDataset.status !== "READY" ||
    !publication.build.addressDataset.isComplete ||
    !publication.build.registryImport ||
    publication.build.registryImport.status !== "COMPLETED" ||
    !publication.build.registryImport.isUnfiltered ||
    !publication.build.registryImport.reachedEof ||
    publication.build.registryImport.rowCount !==
      publication.build.entityCount ||
    publication.build.financialDatasetVersion ===
      "reported-only:pending-live-view" ||
    !publication.build.groupBuildId ||
    publication.build.groupTaxYear === null
  ) {
    throw new CompanyMapNotPublishedError();
  }

  const [groupPublication, financialPublication, financialRevision] =
    await Promise.all([
      prisma.groupRelationshipPublication.findUnique({
        where: { buildId: publication.build.groupBuildId },
      }),
      prisma.companyMapFinancialDatasetPublication.findUnique({
        where: { buildId: publication.buildId },
      }),
      prisma.financialDatasetRevision.findUnique({
        where: { id: "global" },
        select: { reportedRevision: true },
      }),
    ]);
  const activeFinancialDatasetVersion = `reported:${financialRevision?.reportedRevision ?? 0n}`;
  if (
    !groupPublication ||
    groupPublication.taxYear !== publication.build.groupTaxYear ||
    groupPublication.sourceImportStatus !== "COMPLETED" ||
    !financialPublication ||
    financialPublication.financialDatasetVersion !==
      publication.build.financialDatasetVersion ||
    financialPublication.status !== "VERIFIED_REPORTED" ||
    financialPublication.verificationRepositoryVersion !==
      COMPANY_MAP_FINANCIAL_PROJECTION_VERSION ||
    financialPublication.statementCount === 0 ||
    financialPublication.metricCount === 0 ||
    publication.build.financialDatasetVersion !== activeFinancialDatasetVersion
  ) {
    throw new CompanyMapNotPublishedError();
  }
  return { publication, financialPublication };
}

export async function getPublishedCompanyMapCoverage(
  query: CompanyMapCoverageQuery,
) {
  const { publication, financialPublication } = await getPublication();
  const filters = filterExpression(query, {
    buildId: publication.buildId,
    financialDatasetVersion: publication.build.financialDatasetVersion,
  });
  const [totals] = await prisma.$queryRaw<
    Array<{ eligible: bigint; plotted: bigint }>
  >(
    Prisma.sql`
      SELECT
        count(*)::bigint AS "eligible",
        count(*) FILTER (WHERE entity."resolutionStatus" = 'MATCHED')::bigint AS "plotted"
      FROM "CompanyMapEntitySnapshot" entity
      WHERE entity."buildId" = ${publication.buildId}::uuid
        AND ${filters}
    `,
  );
  const omissionRows = await prisma.$queryRaw<
    Array<{ reason: OmissionStatus; count: bigint }>
  >(
    Prisma.sql`
      SELECT entity."resolutionStatus"::text AS "reason", count(*)::bigint AS "count"
      FROM "CompanyMapEntitySnapshot" entity
      WHERE entity."buildId" = ${publication.buildId}::uuid
        AND entity."resolutionStatus" <> 'MATCHED'
        AND ${filters}
      GROUP BY entity."resolutionStatus"
      ORDER BY count(*) DESC, entity."resolutionStatus" ASC
    `,
  );
  const eligible = Number(totals?.eligible ?? 0n);
  const plotted = Number(totals?.plotted ?? 0n);
  const metricCoverage = await requireActiveCompanyMapFinancials(() =>
    financialsRepository.getCompanyMapMetricCoverage({
      buildId: publication.buildId,
      ...filterSelection(query),
      statementScope: query.statementScope,
      currency: query.currency,
      metric: query.metric,
    }),
  );
  if (
    metricCoverage.financialDatasetVersion !==
    publication.build.financialDatasetVersion
  ) {
    throw new CompanyMapNotPublishedError();
  }
  const { withMetric, plottedWithMetric } = metricCoverage;

  return {
    coverage: {
      eligible,
      plotted,
      omitted: eligible - plotted,
      coveragePercent: percentage(plotted, eligible),
      omissions: omissionRows.map((row) => ({
        reason: row.reason,
        count: Number(row.count),
      })),
      financialCoverage: {
        status: "AVAILABLE" as const,
        metric: query.metric,
        statementScope: query.statementScope,
        currency: query.currency,
        withMetric,
        withoutMetric: eligible - withMetric,
        plottedWithMetric,
        plottedWithoutMetric: plotted - plottedWithMetric,
        eligibleCoveragePercent: percentage(withMetric, eligible),
        plottedCoveragePercent: percentage(plottedWithMetric, plotted),
        snapshotAudit: {
          financialEntityCount: financialPublication.financialEntityCount,
          statementCount: financialPublication.statementCount,
          companyStatementCount: financialPublication.companyStatementCount,
          consolidatedStatementCount:
            financialPublication.consolidatedStatementCount,
          metricCount: financialPublication.metricCount,
          sourceStatementCount: financialPublication.sourceStatementCount,
          excludedStatementCount: financialPublication.excludedStatementCount,
          excludedEntityCount: financialPublication.excludedEntityCount,
        },
      },
    },
    filters: query,
    provenance: {
      buildId: publication.buildId,
      publishedAt: publication.publishedAt,
      completedAt: publication.build.completedAt,
      registrySnapshotAt: publication.build.registrySnapshotAt,
      registryImportChecksumSha256:
        publication.build.registryImport!.checksumSha256,
      addressDatasetVersion: publication.build.addressDataset.datasetVersion,
      addressDatasetUpdatedAt: publication.build.addressDataset.sourceUpdatedAt,
      addressDatasetSourceUrl: publication.build.addressDataset.sourceUrl,
      matcherVersion: publication.build.matcherVersion,
      groupBuildId: publication.build.groupBuildId,
      groupTaxYear: publication.build.groupTaxYear,
      financialDatasetVersion: publication.build.financialDatasetVersion,
    },
  };
}

function bigintString(value: bigint | null) {
  return value === null ? null : value.toString();
}

export async function getPublishedCompanyMapCompanies(
  query: CompanyMapCompaniesQuery,
) {
  const { publication } = await getPublication();
  const ranking = await requireActiveCompanyMapFinancials(() =>
    financialsRepository.listCompanyMapFinancialRanking({
      buildId: publication.buildId,
      ...filterSelection(query),
      statementScope: query.statementScope,
      currency: query.currency,
      officialAddressId: query.officialAddressId,
      viewport:
        query.west !== null &&
        query.south !== null &&
        query.east !== null &&
        query.north !== null
          ? {
              west: query.west,
              south: query.south,
              east: query.east,
              north: query.north,
            }
          : null,
      limit: query.limit,
      offset: query.offset,
    }),
  );
  if (
    ranking.financialDatasetVersion !==
    publication.build.financialDatasetVersion
  ) {
    throw new CompanyMapNotPublishedError();
  }

  return {
    companies: ranking.rows.map((row) => ({
      orgNumber: row.orgNumber,
      name: row.name,
      organisationForm: row.organisationForm,
      employeeCount: row.employeeCount,
      municipality: row.municipality,
      officialAddressId: row.officialAddressId,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      groupRootOrgNumber: row.groupRootOrgNumber,
      groupRootName: row.groupRootName,
      groupLabel: row.groupRootName
        ? formatCompanyMapGroupLabel(row.groupRootName)
        : null,
      statementScope: row.financial ? query.statementScope : null,
      fiscalYear: row.financial?.fiscalYear ?? null,
      currency: row.financial?.currency ?? null,
      revenue: bigintString(row.financial?.revenue ?? null),
      ebit: bigintString(row.financial?.ebit ?? null),
      preTaxProfit: bigintString(row.financial?.preTaxProfit ?? null),
      preTaxProfitStatus: row.financial?.preTaxProfitStatus ?? null,
      netIncome: bigintString(row.financial?.netIncome ?? null),
      equity: bigintString(row.financial?.equity ?? null),
      totalAssets: bigintString(row.financial?.totalAssets ?? null),
      financialSource: row.financial
        ? {
            sourceSystem: row.financial.reportedSourceSystem,
            sourceId: row.financial.reportedSourceId,
            sourceFilingId: row.financial.sourceFilingId,
            publishedAt: row.financial.publishedAt,
            fetchedAt: row.financial.financialFetchedAt,
            normalizedAt: row.financial.financialNormalizedAt,
          }
        : null,
      profileHref: `/companies/${row.orgNumber}`,
    })),
    page: {
      total: ranking.total,
      withRevenue: ranking.withRevenue,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + ranking.rows.length < ranking.total,
    },
    filters: query,
    provenance: {
      buildId: publication.buildId,
      financialDatasetVersion: publication.build.financialDatasetVersion,
      groupBuildId: publication.build.groupBuildId,
      groupTaxYear: publication.build.groupTaxYear,
      publishedAt: publication.publishedAt,
    },
  };
}

export async function getPublishedCompanyMapViewport(
  query: CompanyMapViewportQuery,
) {
  const { publication } = await getPublication();
  const filters = filterExpression(query, {
    buildId: publication.buildId,
    financialDatasetVersion: publication.build.financialDatasetVersion,
  });
  const mode = getCompanyMapViewportMode(query.zoom);
  const rowLimit = query.limit + 1;

  if (mode === "CLUSTERS") {
    const cellSize = getCompanyMapGridCellSize(query.zoom);
    const rows = await prisma.$queryRaw<CompanyMapClusterRow[]>(
      buildCompanyMapClusterQuery({
        buildId: publication.buildId,
        filters,
        viewport: query,
        cellSize,
        rowLimit,
      }),
    );
    const truncated = rows.length > query.limit;

    return {
      mode,
      features: rows.slice(0, query.limit).map((row) => ({
        kind: "CLUSTER" as const,
        id: row.id,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        companyCount: Number(row.companyCount),
        addressCount: Number(row.addressCount),
      })),
      page: { limit: query.limit, truncated },
      viewport: query,
      provenance: {
        buildId: publication.buildId,
        publishedAt: publication.publishedAt,
      },
    };
  }

  const rows = await prisma.$queryRaw<CompanyMapAddressRow[]>(Prisma.sql`
    SELECT
      entity."officialAddressId" AS "officialAddressId",
      avg(entity."latitude"::double precision) AS "latitude",
      avg(entity."longitude"::double precision) AS "longitude",
      count(*)::bigint AS "companyCount"
    FROM "CompanyMapEntitySnapshot" entity
    WHERE entity."buildId" = ${publication.buildId}::uuid
      AND entity."resolutionStatus" = 'MATCHED'
      AND entity."officialAddressId" IS NOT NULL
      AND entity."latitude" BETWEEN ${query.south} AND ${query.north}
      AND entity."longitude" BETWEEN ${query.west} AND ${query.east}
      AND ${filters}
    GROUP BY entity."officialAddressId"
    ORDER BY count(*) DESC, entity."officialAddressId" ASC
    LIMIT ${rowLimit}
  `);
  const truncated = rows.length > query.limit;

  return {
    mode,
    features: rows.slice(0, query.limit).map((row) => ({
      kind: "ADDRESS" as const,
      id: row.officialAddressId,
      officialAddressId: row.officialAddressId,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      companyCount: Number(row.companyCount),
    })),
    page: { limit: query.limit, truncated },
    viewport: query,
    provenance: {
      buildId: publication.buildId,
      publishedAt: publication.publishedAt,
    },
  };
}
