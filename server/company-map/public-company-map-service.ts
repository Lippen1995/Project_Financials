import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CompanyMapCoverageQuery } from "@/lib/company-map";
import type { CompanyMapAddressResolutionStatus } from "@/server/company-map/address-resolution";

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
  return publication;
}

export async function getPublishedCompanyMapCoverage(
  query: CompanyMapCoverageQuery,
) {
  const publication = await getPublication();
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
        status: "UNAVAILABLE" as const,
        reason:
          "Financial coverage must be read through the reported-only live-view repository.",
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
