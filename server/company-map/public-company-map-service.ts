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
import type { LatestReportedCompanyMetrics } from "@/server/financials/live-financials-contract";

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

async function getCurrentReportedFinancials(financialDatasetVersion: string) {
  const financials =
    await financialsRepository.listLatestReportedCompanyMetrics();
  if (financials.financialDatasetVersion !== financialDatasetVersion) {
    throw new CompanyMapNotPublishedError();
  }
  return financials;
}

export async function getPublishedCompanyMapCoverage(
  query: CompanyMapCoverageQuery,
) {
  const { publication, financialPublication } = await getPublication();
  const financials = await getCurrentReportedFinancials(
    publication.build.financialDatasetVersion,
  );
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
  const metricStatements = financials.statements.filter(
    (statement) =>
      statement.statementScope === query.statementScope &&
      statement.currency === query.currency &&
      statement[query.metric] !== null,
  );
  const financialEntities =
    metricStatements.length === 0
      ? []
      : await prisma.companyMapEntitySnapshot.findMany({
          where: {
            buildId: publication.buildId,
            orgNumber: {
              in: metricStatements.map((statement) => statement.orgNumber),
            },
            organisationForm: query.organisationForms
              ? { in: query.organisationForms }
              : undefined,
            companyStatus: { in: query.companyStatuses },
          },
          select: { resolutionStatus: true },
        });
  const withMetric = financialEntities.length;
  const plottedWithMetric = financialEntities.filter(
    (entity) => entity.resolutionStatus === "MATCHED",
  ).length;

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
        plottedWithMetric,
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

function compareNullableBigIntDescending(
  left: bigint | null,
  right: bigint | null,
) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left > right ? -1 : 1;
}

export async function getPublishedCompanyMapCompanies(
  query: CompanyMapCompaniesQuery,
) {
  const { publication } = await getPublication();
  const financials = await getCurrentReportedFinancials(
    publication.build.financialDatasetVersion,
  );
  const selectedFinancials = financials.statements.filter(
    (statement) =>
      statement.statementScope === query.statementScope &&
      statement.currency === query.currency,
  );
  const entityWhere = {
    buildId: publication.buildId,
    organisationForm: query.organisationForms
      ? { in: query.organisationForms }
      : undefined,
    companyStatus: { in: query.companyStatuses },
    resolutionStatus: "MATCHED" as const,
    officialAddressId: query.officialAddressId ?? undefined,
  };
  const financialByOrgNumber = new Map(
    selectedFinancials.map((financial) => [financial.orgNumber, financial]),
  );
  const revenueFinancials = selectedFinancials.filter(
    (financial) => financial.revenue !== null,
  );
  const revenueEntities =
    revenueFinancials.length === 0
      ? []
      : await prisma.companyMapEntitySnapshot.findMany({
          where: {
            ...entityWhere,
            orgNumber: {
              in: revenueFinancials.map((statement) => statement.orgNumber),
            },
          },
          select: {
            orgNumber: true,
            name: true,
            organisationForm: true,
            employeeCount: true,
            municipality: true,
            officialAddressId: true,
            latitude: true,
            longitude: true,
            groupRootOrgNumber: true,
            groupRootName: true,
          },
        });
  const revenueFinancialByOrgNumber = new Map(
    revenueFinancials.map((financial) => [financial.orgNumber, financial]),
  );
  const rankedRevenueRows = revenueEntities
    .flatMap((entity) => {
      const financial = revenueFinancialByOrgNumber.get(entity.orgNumber);
      return entity ? [{ entity, financial }] : [];
    })
    .filter(
      (
        row,
      ): row is {
        entity: (typeof revenueEntities)[number];
        financial: LatestReportedCompanyMetrics;
      } => row.financial !== undefined,
    )
    .sort((left, right) => {
      const revenueOrder = compareNullableBigIntDescending(
        left.financial.revenue,
        right.financial.revenue,
      );
      return (
        revenueOrder ||
        left.entity.name.localeCompare(right.entity.name, "nb-NO") ||
        left.entity.orgNumber.localeCompare(right.entity.orgNumber)
      );
    });
  const total = await prisma.companyMapEntitySnapshot.count({
    where: entityWhere,
  });
  const rows: Array<{
    entity: (typeof revenueEntities)[number];
    financial: LatestReportedCompanyMetrics | null;
  }> = rankedRevenueRows.slice(query.offset, query.offset + query.limit);
  const remaining = query.limit - rows.length;
  if (remaining > 0) {
    const nullRevenueOffset = Math.max(
      0,
      query.offset - rankedRevenueRows.length,
    );
    const nullRevenueEntities = await prisma.companyMapEntitySnapshot.findMany({
      where: {
        ...entityWhere,
        orgNumber:
          rankedRevenueRows.length === 0
            ? undefined
            : {
                notIn: rankedRevenueRows.map((row) => row.entity.orgNumber),
              },
      },
      select: {
        orgNumber: true,
        name: true,
        organisationForm: true,
        employeeCount: true,
        municipality: true,
        officialAddressId: true,
        latitude: true,
        longitude: true,
        groupRootOrgNumber: true,
        groupRootName: true,
      },
      orderBy: [{ name: "asc" }, { orgNumber: "asc" }],
      skip: nullRevenueOffset,
      take: remaining,
    });
    rows.push(
      ...nullRevenueEntities.map((entity) => ({
        entity,
        financial: financialByOrgNumber.get(entity.orgNumber) ?? null,
      })),
    );
  }
  const withRevenue = rankedRevenueRows.length;

  return {
    companies: rows.map(({ entity, financial }) => ({
      orgNumber: entity.orgNumber,
      name: entity.name,
      organisationForm: entity.organisationForm,
      employeeCount: entity.employeeCount,
      municipality: entity.municipality,
      officialAddressId: entity.officialAddressId,
      latitude: Number(entity.latitude),
      longitude: Number(entity.longitude),
      groupRootOrgNumber: entity.groupRootOrgNumber,
      groupRootName: entity.groupRootName,
      groupLabel: entity.groupRootName
        ? formatCompanyMapGroupLabel(entity.groupRootName)
        : null,
      statementScope: financial ? query.statementScope : null,
      fiscalYear: financial?.fiscalYear ?? null,
      currency: financial?.currency ?? null,
      revenue: bigintString(financial?.revenue ?? null),
      ebit: bigintString(financial?.ebit ?? null),
      preTaxProfit: bigintString(financial?.preTaxProfit ?? null),
      preTaxProfitStatus: financial?.preTaxProfitStatus ?? null,
      netIncome: bigintString(financial?.netIncome ?? null),
      equity: bigintString(financial?.equity ?? null),
      totalAssets: bigintString(financial?.totalAssets ?? null),
      financialSource: financial
        ? {
            sourceSystem: financial.reportedSourceSystem,
            sourceId: financial.reportedSourceId,
            sourceFilingId: financial.sourceFilingId,
            publishedAt: financial.publishedAt,
            fetchedAt: financial.financialFetchedAt,
            normalizedAt: financial.financialNormalizedAt,
          }
        : null,
      profileHref: `/companies/${entity.orgNumber}`,
    })),
    page: {
      total,
      withRevenue,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + rows.length < total,
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
