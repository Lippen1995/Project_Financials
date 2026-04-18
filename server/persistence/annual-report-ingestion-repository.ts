import { Prisma, AnnualReportFilingStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  CanonicalFactCandidate,
  ValidationIssueDraft,
} from "@/integrations/brreg/annual-report-financials/types";

function toBigInt(value: number | null | undefined) {
  return value === null || value === undefined ? null : BigInt(Math.round(value));
}

function buildHashVersionKey(sourceDiscoveryKey: string, checksum: string) {
  return `${sourceDiscoveryKey}::${checksum}`;
}

export async function findCompanyByOrgNumber(orgNumber: string) {
  return prisma.company.findUnique({
    where: { orgNumber },
    select: {
      id: true,
      orgNumber: true,
      name: true,
      slug: true,
    },
  });
}

export async function listCompaniesForFinancialSync(options?: {
  orgNumbers?: string[];
  onlyDue?: boolean;
  limit?: number;
}) {
  const now = new Date();

  return prisma.company.findMany({
    where: {
      ...(options?.orgNumbers?.length
        ? {
            orgNumber: {
              in: options.orgNumbers,
            },
          }
        : {}),
      ...(options?.onlyDue
        ? {
            OR: [
              { financialCoverage: null },
              { financialCoverage: { nextCheckAt: null } },
              { financialCoverage: { nextCheckAt: { lte: now } } },
            ],
          }
        : {}),
    },
    take: options?.limit,
    orderBy: { orgNumber: "asc" },
    select: {
      id: true,
      orgNumber: true,
      name: true,
      financialCoverage: true,
    },
  });
}

export async function findLatestAnnualReportFilingByDiscoveryKey(input: {
  companyId: string;
  fiscalYear: number;
  sourceDiscoveryKey: string;
}) {
  return prisma.annualReportFiling.findFirst({
    where: {
      companyId: input.companyId,
      fiscalYear: input.fiscalYear,
      sourceDiscoveryKey: input.sourceDiscoveryKey,
    },
    orderBy: [{ isLatestForFiscalYear: "desc" }, { discoveredAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function findAnnualReportFilingByHashVersion(input: {
  sourceDiscoveryKey: string;
  checksum: string;
}) {
  return prisma.annualReportFiling.findUnique({
    where: {
      sourceIdempotencyKey: buildHashVersionKey(input.sourceDiscoveryKey, input.checksum),
    },
  });
}

export async function upsertAnnualReportFilingDiscovery(input: {
  companyId: string;
  fiscalYear: number;
  sourceSystem: string;
  sourceUrl: string;
  sourceDiscoveryKey: string;
  sourceIdempotencyKey: string;
  sourceDocumentType: string;
  discoveredAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.annualReportFiling.findFirst({
      where: {
        companyId: input.companyId,
        fiscalYear: input.fiscalYear,
        sourceDiscoveryKey: input.sourceDiscoveryKey,
      },
      orderBy: [{ isLatestForFiscalYear: "desc" }, { discoveredAt: "desc" }, { createdAt: "desc" }],
    });

    if (existing) {
      const updated = await tx.annualReportFiling.update({
        where: { id: existing.id },
        data: {
          sourceSystem: input.sourceSystem,
          sourceUrl: input.sourceUrl,
          sourceDocumentType: input.sourceDocumentType,
          discoveredAt: input.discoveredAt,
          isLatestForFiscalYear: true,
        },
      });

      await tx.annualReportFiling.updateMany({
        where: {
          companyId: input.companyId,
          fiscalYear: input.fiscalYear,
          NOT: { id: updated.id },
        },
        data: {
          isLatestForFiscalYear: false,
        },
      });

      return updated;
    }

    const created = await tx.annualReportFiling.create({
      data: {
        companyId: input.companyId,
        fiscalYear: input.fiscalYear,
        sourceSystem: input.sourceSystem,
        sourceUrl: input.sourceUrl,
        sourceDiscoveryKey: input.sourceDiscoveryKey,
        sourceIdempotencyKey: input.sourceIdempotencyKey,
        sourceDocumentType: input.sourceDocumentType,
        discoveredAt: input.discoveredAt,
        isLatestForFiscalYear: true,
      },
    });

    await tx.annualReportFiling.updateMany({
      where: {
        companyId: input.companyId,
        fiscalYear: input.fiscalYear,
        NOT: { id: created.id },
      },
      data: {
        isLatestForFiscalYear: false,
      },
    });

    return created;
  });
}

export async function registerAnnualReportHashVersion(input: {
  filingId: string;
  checksum: string;
  downloadedAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const filing = await tx.annualReportFiling.findUnique({
      where: { id: input.filingId },
    });

    if (!filing) {
      throw new Error(`Fant ikke filing ${input.filingId}.`);
    }

    const hashVersionKey = buildHashVersionKey(filing.sourceDiscoveryKey, input.checksum);
    const existingVersion = await tx.annualReportFiling.findUnique({
      where: {
        sourceIdempotencyKey: hashVersionKey,
      },
    });

    if (existingVersion) {
      await tx.annualReportFiling.updateMany({
        where: {
          companyId: filing.companyId,
          fiscalYear: filing.fiscalYear,
          NOT: { id: existingVersion.id },
        },
        data: {
          isLatestForFiscalYear: false,
        },
      });

      return tx.annualReportFiling.update({
        where: { id: existingVersion.id },
        data: {
          sourceUrl: filing.sourceUrl,
          sourceDocumentType: filing.sourceDocumentType,
          discoveredAt: filing.discoveredAt,
          downloadedAt: input.downloadedAt,
          sourceDocumentHash: input.checksum,
          status:
            existingVersion.status === "DISCOVERED" ? "DOWNLOADED" : existingVersion.status,
          isLatestForFiscalYear: true,
        },
      });
    }

    await tx.annualReportFiling.updateMany({
      where: {
        companyId: filing.companyId,
        fiscalYear: filing.fiscalYear,
        NOT: { id: filing.id },
      },
      data: {
        isLatestForFiscalYear: false,
      },
    });

    return tx.annualReportFiling.update({
      where: { id: filing.id },
      data: {
        sourceIdempotencyKey: hashVersionKey,
        sourceDocumentHash: input.checksum,
        downloadedAt: input.downloadedAt,
        status: filing.status === "DISCOVERED" ? "DOWNLOADED" : filing.status,
        isLatestForFiscalYear: true,
      },
    });
  });
}

export async function createAnnualReportFilingVersion(input: {
  existingFilingId: string;
  checksum: string;
  downloadedAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const filing = await tx.annualReportFiling.findUnique({
      where: { id: input.existingFilingId },
    });

    if (!filing) {
      throw new Error(`Fant ikke filing ${input.existingFilingId}.`);
    }

    const idempotencyKey = buildHashVersionKey(filing.sourceDiscoveryKey, input.checksum);
    const existingVersion = await tx.annualReportFiling.findUnique({
      where: { sourceIdempotencyKey: idempotencyKey },
    });

    if (existingVersion) {
      return existingVersion;
    }

    await tx.annualReportFiling.updateMany({
      where: {
        companyId: filing.companyId,
        fiscalYear: filing.fiscalYear,
        NOT: { id: filing.id },
      },
      data: {
        isLatestForFiscalYear: false,
      },
    });

    return tx.annualReportFiling.create({
      data: {
        companyId: filing.companyId,
        fiscalYear: filing.fiscalYear,
        sourceSystem: filing.sourceSystem,
        sourceUrl: filing.sourceUrl,
        sourceDiscoveryKey: filing.sourceDiscoveryKey,
        sourceIdempotencyKey: idempotencyKey,
        sourceDocumentHash: input.checksum,
        sourceDocumentType: filing.sourceDocumentType,
        discoveredAt: new Date(),
        downloadedAt: input.downloadedAt,
        status: "DOWNLOADED",
        isLatestForFiscalYear: true,
        metadata:
          filing.metadata === null
            ? undefined
            : (filing.metadata as Prisma.InputJsonValue | undefined),
      },
    });
  });
}

export async function updateAnnualReportFiling(
  filingId: string,
  data: Prisma.AnnualReportFilingUpdateInput,
) {
  return prisma.annualReportFiling.update({
    where: { id: filingId },
    data,
  });
}

export async function createAnnualReportArtifact(input: {
  filingId: string;
  artifactType: Prisma.AnnualReportArtifactUncheckedCreateInput["artifactType"];
  storageKey: string;
  checksum: string;
  mimeType: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const existing = await prisma.annualReportArtifact.findFirst({
    where: {
      filingId: input.filingId,
      artifactType: input.artifactType,
      checksum: input.checksum,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.annualReportArtifact.create({
    data: {
      filingId: input.filingId,
      artifactType: input.artifactType,
      storageKey: input.storageKey,
      checksum: input.checksum,
      mimeType: input.mimeType,
      metadata: input.metadata,
    },
  });
}

export async function createFinancialExtractionRun(input: {
  filingId: string;
  companyId: string;
  parserVersion: string;
  ocrEngine?: string | null;
  ocrLanguage?: string | null;
}) {
  return prisma.financialExtractionRun.create({
    data: {
      filingId: input.filingId,
      companyId: input.companyId,
      parserVersion: input.parserVersion,
      ocrEngine: input.ocrEngine,
      ocrLanguage: input.ocrLanguage,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
}

export async function completeFinancialExtractionRun(
  runId: string,
  data: Prisma.FinancialExtractionRunUpdateInput,
) {
  return prisma.financialExtractionRun.update({
    where: { id: runId },
    data,
  });
}

export async function createFinancialFacts(input: {
  extractionRunId: string;
  filingId: string;
  companyId: string;
  facts: CanonicalFactCandidate[];
}) {
  if (input.facts.length === 0) {
    return;
  }

  await prisma.financialFact.createMany({
    data: input.facts.map((fact) => ({
      extractionRunId: input.extractionRunId,
      filingId: input.filingId,
      companyId: input.companyId,
      fiscalYear: fact.fiscalYear,
      statementType: fact.statementType,
      metricKey: fact.metricKey,
      rawLabel: fact.rawLabel,
      normalizedLabel: fact.normalizedLabel,
      value: toBigInt(fact.value),
      currency: fact.currency,
      unitScale: fact.unitScale,
      sourcePage: fact.sourcePage,
      sourceSection: fact.sourceSection,
      sourceRowText: fact.sourceRowText,
      noteReference: fact.noteReference,
      confidenceScore: fact.confidenceScore,
      isDerived: fact.isDerived,
      rawPayload: fact.rawPayload as Prisma.InputJsonValue,
    })),
  });
}

export async function createFinancialValidationIssues(input: {
  extractionRunId: string;
  filingId: string;
  companyId: string;
  fiscalYear: number;
  issues: ValidationIssueDraft[];
}) {
  if (input.issues.length === 0) {
    return;
  }

  await prisma.financialValidationIssue.createMany({
    data: input.issues.map((issue) => ({
      extractionRunId: input.extractionRunId,
      filingId: input.filingId,
      companyId: input.companyId,
      fiscalYear: input.fiscalYear,
      severity: issue.severity,
      ruleCode: issue.ruleCode,
      message: issue.message,
      expectedValue: toBigInt(issue.expectedValue),
      actualValue: toBigInt(issue.actualValue),
      context: issue.context as Prisma.InputJsonValue,
    })),
  });
}

export async function getPublishedFinancialStatementSnapshot(input: {
  companyId: string;
  fiscalYear: number;
}) {
  return prisma.financialStatement.findUnique({
    where: {
      companyId_fiscalYear: {
        companyId: input.companyId,
        fiscalYear: input.fiscalYear,
      },
    },
  });
}

export async function publishFinancialStatementSnapshot(input: {
  companyId: string;
  fiscalYear: number;
  currency: string;
  revenue?: number | null;
  operatingProfit?: number | null;
  netIncome?: number | null;
  equity?: number | null;
  assets?: number | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  rawPayload: Prisma.InputJsonValue;
  sourceFilingId: string;
  sourceExtractionRunId: string;
  qualityStatus: Prisma.FinancialStatementUncheckedCreateInput["qualityStatus"];
  qualityScore: number;
  unitScale: number;
  sourcePrecedence: Prisma.FinancialStatementUncheckedCreateInput["sourcePrecedence"];
  publishedAt: Date;
}) {
  const existing = await getPublishedFinancialStatementSnapshot({
    companyId: input.companyId,
    fiscalYear: input.fiscalYear,
  });

  const canReplace =
    !existing ||
    existing.sourceFilingId === input.sourceFilingId ||
    existing.qualityStatus !== "HIGH_CONFIDENCE" ||
    (existing.qualityScore ?? 0) <= input.qualityScore;

  if (!canReplace) {
    return existing;
  }

  return prisma.financialStatement.upsert({
    where: {
      companyId_fiscalYear: {
        companyId: input.companyId,
        fiscalYear: input.fiscalYear,
      },
    },
    update: {
      currency: input.currency,
      revenue: toBigInt(input.revenue),
      operatingProfit: toBigInt(input.operatingProfit),
      netIncome: toBigInt(input.netIncome),
      equity: toBigInt(input.equity),
      assets: toBigInt(input.assets),
      sourceSystem: input.sourceSystem,
      sourceEntityType: input.sourceEntityType,
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      normalizedAt: input.normalizedAt,
      rawPayload: input.rawPayload,
      sourceFilingId: input.sourceFilingId,
      sourceExtractionRunId: input.sourceExtractionRunId,
      qualityStatus: input.qualityStatus,
      qualityScore: input.qualityScore,
      unitScale: input.unitScale,
      sourcePrecedence: input.sourcePrecedence,
      publishedAt: input.publishedAt,
    },
    create: {
      companyId: input.companyId,
      fiscalYear: input.fiscalYear,
      currency: input.currency,
      revenue: toBigInt(input.revenue),
      operatingProfit: toBigInt(input.operatingProfit),
      netIncome: toBigInt(input.netIncome),
      equity: toBigInt(input.equity),
      assets: toBigInt(input.assets),
      sourceSystem: input.sourceSystem,
      sourceEntityType: input.sourceEntityType,
      sourceId: input.sourceId,
      fetchedAt: input.fetchedAt,
      normalizedAt: input.normalizedAt,
      rawPayload: input.rawPayload,
      sourceFilingId: input.sourceFilingId,
      sourceExtractionRunId: input.sourceExtractionRunId,
      qualityStatus: input.qualityStatus,
      qualityScore: input.qualityScore,
      unitScale: input.unitScale,
      sourcePrecedence: input.sourcePrecedence,
      publishedAt: input.publishedAt,
    },
  });
}

export async function upsertCompanyFinancialCoverage(input: {
  companyId: string;
  latestDiscoveredFiscalYear?: number | null;
  latestDownloadedFiscalYear?: number | null;
  latestPublishedFiscalYear?: number | null;
  lastCheckedAt?: Date | null;
  nextCheckAt?: Date | null;
  failureCount?: number;
  coverageStatus: Prisma.CompanyFinancialCoverageUncheckedCreateInput["coverageStatus"];
  latestSuccessfulFilingId?: string | null;
}) {
  return prisma.companyFinancialCoverage.upsert({
    where: { companyId: input.companyId },
    update: {
      latestDiscoveredFiscalYear: input.latestDiscoveredFiscalYear ?? undefined,
      latestDownloadedFiscalYear: input.latestDownloadedFiscalYear ?? undefined,
      latestPublishedFiscalYear: input.latestPublishedFiscalYear ?? undefined,
      lastCheckedAt: input.lastCheckedAt ?? undefined,
      nextCheckAt: input.nextCheckAt ?? undefined,
      failureCount: input.failureCount ?? undefined,
      coverageStatus: input.coverageStatus,
      latestSuccessfulFilingId: input.latestSuccessfulFilingId ?? undefined,
    },
    create: {
      companyId: input.companyId,
      latestDiscoveredFiscalYear: input.latestDiscoveredFiscalYear ?? null,
      latestDownloadedFiscalYear: input.latestDownloadedFiscalYear ?? null,
      latestPublishedFiscalYear: input.latestPublishedFiscalYear ?? null,
      lastCheckedAt: input.lastCheckedAt ?? null,
      nextCheckAt: input.nextCheckAt ?? null,
      failureCount: input.failureCount ?? 0,
      coverageStatus: input.coverageStatus,
      latestSuccessfulFilingId: input.latestSuccessfulFilingId ?? null,
    },
  });
}

export async function listPendingAnnualReportFilings(options?: {
  orgNumbers?: string[];
  statuses?: AnnualReportFilingStatus[];
  limit?: number;
}) {
  return prisma.annualReportFiling.findMany({
    where: {
      status: {
        in: options?.statuses ?? ["DISCOVERED", "DOWNLOADED", "PREFLIGHTED"],
      },
      ...(options?.orgNumbers?.length
        ? {
            company: {
              orgNumber: {
                in: options.orgNumbers,
              },
            },
          }
        : {}),
    },
    take: options?.limit,
    orderBy: [{ companyId: "asc" }, { fiscalYear: "desc" }, { discoveredAt: "desc" }],
    include: {
      company: {
        select: {
          id: true,
          orgNumber: true,
          name: true,
        },
      },
      artifacts: true,
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        take: 3,
      },
    },
  });
}

export async function listLatestAnnualReportFilingsForCompany(companyId: string) {
  return prisma.annualReportFiling.findMany({
    where: {
      companyId,
      isLatestForFiscalYear: true,
    },
    orderBy: [{ fiscalYear: "desc" }, { discoveredAt: "desc" }],
  });
}

export async function getPublishedFinancialsForCompany(orgNumber: string) {
  return prisma.company.findUnique({
    where: { orgNumber },
    select: {
      id: true,
      orgNumber: true,
      name: true,
      financialStatements: {
        orderBy: { fiscalYear: "desc" },
      },
      annualReportFilings: {
        orderBy: [{ fiscalYear: "desc" }, { discoveredAt: "desc" }],
      },
      financialCoverage: true,
    },
  });
}

export async function getAnnualReportFilingWithArtifacts(filingId: string) {
  return prisma.annualReportFiling.findUnique({
    where: { id: filingId },
    include: {
      company: {
        select: {
          id: true,
          orgNumber: true,
          name: true,
        },
      },
      artifacts: true,
      extractionRuns: {
        orderBy: { startedAt: "desc" },
      },
    },
  });
}
