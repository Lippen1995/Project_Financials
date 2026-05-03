import { prisma } from "@/lib/prisma";

export type AnnualReportDecisionShadowRow = {
  filingId: string;
  fiscalYear: number;
  filingStatus: string;
  orgNumber: string | null;
  pdfDecisionArtifacts: Array<{ storageKey: string; metadata: unknown }>;
  hasStructuredDocument: boolean;
  latestExtractionRun: {
    id: string;
    status: string;
    validationScore: number | null;
    confidenceScore: number | null;
  } | null;
  latestReview: {
    id: string;
    extractionRunId: string | null;
    status: string;
    blockingRuleCodes: string[];
    qualityScore: number | null;
    decisions: Array<{ decisionType: string; createdAt: Date }>;
  } | null;
  reviewedFactCount: number;
  trainingLabelCount: number;
};

export async function listAnnualReportDecisionShadowRows(input: {
  limit: number;
  fiscalYear?: number;
  orgNumber?: string;
  filingIds?: string[];
}): Promise<AnnualReportDecisionShadowRow[]> {
  const filings = await prisma.annualReportFiling.findMany({
    where: {
      ...(input.filingIds ? { id: { in: input.filingIds } } : {}),
      ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
      ...(input.orgNumber
        ? { company: { orgNumber: input.orgNumber } }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: input.limit,
    select: {
      id: true,
      fiscalYear: true,
      status: true,
      updatedAt: true,
      company: { select: { orgNumber: true } },
      artifacts: {
        where: {
          artifactType: { in: ["PDF_DECISION_JSON", "STRUCTURED_DOCUMENT_JSON"] },
        },
        select: { artifactType: true, storageKey: true, metadata: true },
        orderBy: { createdAt: "desc" },
      },
      extractionRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true, status: true, validationScore: true, confidenceScore: true },
      },
      reviews: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          extractionRunId: true,
          status: true,
          blockingRuleCodes: true,
          qualityScore: true,
          decisions: {
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { decisionType: true, createdAt: true },
          },
        },
      },
      _count: { select: { reviewedFacts: true } },
    },
  });

  const filingIds = filings.map((f) => f.id);

  const labelCountRows =
    filingIds.length > 0
      ? await prisma.pdfTrainingLabel.groupBy({
          by: ["filingId"],
          where: { filingId: { in: filingIds } },
          _count: { _all: true },
        })
      : [];

  const labelCountByFilingId = new Map<string, number>(
    labelCountRows.map((row) => [row.filingId, row._count._all]),
  );

  return filings.map((filing) => ({
    filingId: filing.id,
    fiscalYear: filing.fiscalYear,
    filingStatus: filing.status,
    orgNumber: filing.company?.orgNumber ?? null,
    pdfDecisionArtifacts: filing.artifacts
      .filter((a) => a.artifactType === "PDF_DECISION_JSON")
      .map((a) => ({ storageKey: a.storageKey, metadata: a.metadata })),
    hasStructuredDocument: filing.artifacts.some(
      (a) => a.artifactType === "STRUCTURED_DOCUMENT_JSON",
    ),
    latestExtractionRun: filing.extractionRuns[0]
      ? {
          id: filing.extractionRuns[0].id,
          status: filing.extractionRuns[0].status,
          validationScore: filing.extractionRuns[0].validationScore,
          confidenceScore: filing.extractionRuns[0].confidenceScore,
        }
      : null,
    latestReview: filing.reviews[0]
      ? {
          id: filing.reviews[0].id,
          extractionRunId: filing.reviews[0].extractionRunId,
          status: filing.reviews[0].status,
          blockingRuleCodes: filing.reviews[0].blockingRuleCodes,
          qualityScore: filing.reviews[0].qualityScore,
          decisions: filing.reviews[0].decisions.map((d) => ({
            decisionType: d.decisionType,
            createdAt: d.createdAt,
          })),
        }
      : null,
    reviewedFactCount: filing._count.reviewedFacts,
    trainingLabelCount: labelCountByFilingId.get(filing.id) ?? 0,
  }));
}
