import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  CompanyMapCompaniesQuery,
  CompanyMapCoverageQuery,
} from "@/lib/company-map";
import type { CompanyMapAddressResolutionStatus } from "@/server/company-map/address-resolution";
import { formatCompanyMapGroupLabel } from "@/server/company-map/company-list";
import { COMPANY_MAP_FINANCIAL_PROJECTION_VERSION } from "@/server/company-map/financial-projection";
import { financialsRepository } from "@/server/financials/financials-repository";

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

function filterExpression(query: CompanyMapCoverageQuery): Prisma.Sql {
  const organisationFormFilter = query.organisationForms
    ? Prisma.sql`entity."organisationForm" IN (${Prisma.join(query.organisationForms)})`
    : Prisma.sql`TRUE`;
  return Prisma.sql`
    ${organisationFormFilter}
    AND entity."companyStatus"::text IN (${Prisma.join(query.companyStatuses)})
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
  const filters = filterExpression(query);
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
  const metricCoverage = await financialsRepository.getCompanyMapMetricCoverage(
    {
      buildId: publication.buildId,
      organisationForms: query.organisationForms,
      companyStatuses: query.companyStatuses,
      statementScope: query.statementScope,
      currency: query.currency,
      metric: query.metric,
    },
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
  const ranking = await financialsRepository.listCompanyMapFinancialRanking({
    buildId: publication.buildId,
    organisationForms: query.organisationForms,
    companyStatuses: query.companyStatuses,
    statementScope: query.statementScope,
    currency: query.currency,
    officialAddressId: query.officialAddressId,
    limit: query.limit,
    offset: query.offset,
  });
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
