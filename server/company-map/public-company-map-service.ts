import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  CompanyMapCompaniesQuery,
  CompanyMapCoverageQuery,
} from "@/lib/company-map";
import type { CompanyMapAddressResolutionStatus } from "@/server/company-map/address-resolution";
import { formatCompanyMapGroupLabel } from "@/server/company-map/company-list";

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

  const [groupPublication, financialPublication] = await Promise.all([
    prisma.groupRelationshipPublication.findUnique({
      where: { buildId: publication.build.groupBuildId },
    }),
    prisma.companyMapFinancialDatasetPublication.findUnique({
      where: { buildId: publication.buildId },
    }),
  ]);
  if (
    !groupPublication ||
    groupPublication.taxYear !== publication.build.groupTaxYear ||
    groupPublication.sourceImportStatus !== "COMPLETED" ||
    !financialPublication ||
    financialPublication.financialDatasetVersion !==
      publication.build.financialDatasetVersion ||
    financialPublication.status !== "VERIFIED_REPORTED" ||
    financialPublication.statementCount === 0 ||
    financialPublication.metricCount === 0
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

type CompanyMapCompanyRow = {
  orgNumber: string;
  name: string;
  organisationForm: string | null;
  employeeCount: number | null;
  municipality: string | null;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  groupRootOrgNumber: string | null;
  groupRootName: string | null;
  fiscalYear: number | null;
  currency: string | null;
  revenue: bigint | null;
  ebit: bigint | null;
  preTaxProfit: bigint | null;
  netIncome: bigint | null;
  equity: bigint | null;
  totalAssets: bigint | null;
};

function bigintString(value: bigint | null) {
  return value === null ? null : value.toString();
}

export async function getPublishedCompanyMapCompanies(
  query: CompanyMapCompaniesQuery,
) {
  const { publication } = await getPublication();
  const filters = filterExpression(query);
  const [rows, [totals]] = await Promise.all([
    prisma.$queryRaw<CompanyMapCompanyRow[]>(Prisma.sql`
      SELECT
        entity."orgNumber",
        entity."name",
        entity."organisationForm",
        entity."employeeCount",
        entity."municipality",
        entity."latitude",
        entity."longitude",
        entity."groupRootOrgNumber",
        entity."groupRootName",
        financial."fiscalYear",
        financial."currency",
        financial."revenue",
        financial."ebit",
        financial."preTaxProfit",
        financial."netIncome",
        financial."equity",
        financial."totalAssets"
      FROM "CompanyMapEntitySnapshot" entity
      LEFT JOIN "CompanyMapFinancialSnapshot" financial
        ON financial."buildId" = entity."buildId"
        AND financial."orgNumber" = entity."orgNumber"
        AND financial."statementScope" = ${query.statementScope}::"StatementScope"
        AND financial."currency" = ${query.currency}
      WHERE entity."buildId" = ${publication.buildId}::uuid
        AND entity."resolutionStatus" = 'MATCHED'
        AND ${filters}
      ORDER BY financial."revenue" DESC NULLS LAST, entity."name" ASC, entity."orgNumber" ASC
      LIMIT ${query.limit}
      OFFSET ${query.offset}
    `),
    prisma.$queryRaw<Array<{ total: bigint; withRevenue: bigint }>>(Prisma.sql`
      SELECT
        count(*)::bigint AS "total",
        count(financial."revenue")::bigint AS "withRevenue"
      FROM "CompanyMapEntitySnapshot" entity
      LEFT JOIN "CompanyMapFinancialSnapshot" financial
        ON financial."buildId" = entity."buildId"
        AND financial."orgNumber" = entity."orgNumber"
        AND financial."statementScope" = ${query.statementScope}::"StatementScope"
        AND financial."currency" = ${query.currency}
      WHERE entity."buildId" = ${publication.buildId}::uuid
        AND entity."resolutionStatus" = 'MATCHED'
        AND ${filters}
    `),
  ]);

  return {
    companies: rows.map((row) => ({
      orgNumber: row.orgNumber,
      name: row.name,
      organisationForm: row.organisationForm,
      employeeCount: row.employeeCount,
      municipality: row.municipality,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      groupRootOrgNumber: row.groupRootOrgNumber,
      groupRootName: row.groupRootName,
      groupLabel: row.groupRootName
        ? formatCompanyMapGroupLabel(row.groupRootName)
        : null,
      statementScope: query.statementScope,
      fiscalYear: row.fiscalYear,
      currency: row.currency,
      revenue: bigintString(row.revenue),
      ebit: bigintString(row.ebit),
      preTaxProfit: bigintString(row.preTaxProfit),
      netIncome: bigintString(row.netIncome),
      equity: bigintString(row.equity),
      totalAssets: bigintString(row.totalAssets),
      profileHref: `/companies/${row.orgNumber}`,
    })),
    page: {
      total: Number(totals?.total ?? 0n),
      withRevenue: Number(totals?.withRevenue ?? 0n),
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + rows.length < Number(totals?.total ?? 0n),
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
