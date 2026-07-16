import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { BoardReportExtractionResult } from "@/integrations/brreg/annual-report-financials/board-report-extractor";
import { prisma } from "@/lib/prisma";

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function nullableJson(value: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : json(value);
}

export async function persistBoardReportExtraction(input: {
  companyId: string;
  result: BoardReportExtractionResult;
}) {
  const { result } = input;
  if (!result.filingId || result.fiscalYear === null) {
    throw new Error("Board-report extraction requires filingId and fiscalYear before persistence.");
  }

  const reviewStatus = result.status === "MANUAL_REVIEW" ? "PENDING" : "NOT_REQUIRED";
  const data = {
    companyId: input.companyId,
    fiscalYear: result.fiscalYear,
    status: result.status,
    reviewStatus,
    title: result.title,
    text: result.text,
    normalizedText: result.normalizedText,
    textChecksum: result.text
      ? createHash("sha256").update(result.text, "utf8").digest("hex")
      : null,
    pageStart: result.pageStart,
    pageEnd: result.pageEnd,
    startBoundary: result.startBoundary ? json(result.startBoundary) : Prisma.JsonNull,
    endBoundary: result.endBoundary ? json(result.endBoundary) : Prisma.JsonNull,
    includedBlocks: json(result.includedBlocks),
    confidence: result.confidence,
    quality: json(result.quality),
    matchedStartSignals: json(result.matchedStartSignals),
    matchedStopSignals: json(result.matchedStopSignals),
    warnings: json(result.warnings),
    route: result.route,
    extractorVersion: result.extractorVersion,
    parserVersion: result.parserVersion,
    sourceSystem: result.sourceSystem,
    sourceEntityType: result.sourceEntityType,
    sourceId: result.sourceId,
    sourceUrl: result.sourceUrl,
    sourceDocumentHash: result.sourceDocumentHash,
    fetchedAt: new Date(result.fetchedAt),
    normalizedAt: new Date(result.normalizedAt),
  } satisfies Omit<Prisma.BoardReportExtractionUncheckedCreateInput, "filingId">;

  return prisma.boardReportExtraction.upsert({
    where: {
      filingId_sourceDocumentHash_extractorVersion: {
        filingId: result.filingId,
        sourceDocumentHash: result.sourceDocumentHash,
        extractorVersion: result.extractorVersion,
      },
    },
    create: { filingId: result.filingId, ...data },
    update: {},
  });
}

export async function findLatestBoardReportFilingId(orgNumber: string, fiscalYear: number) {
  const filing = await prisma.annualReportFiling.findFirst({
    where: {
      company: { orgNumber },
      fiscalYear,
      sourceSystem: "BRREG",
      sourceDocumentType: "ANNUAL_REPORT_PDF",
      isLatestForFiscalYear: true,
    },
    orderBy: { discoveredAt: "desc" },
    select: { id: true },
  });
  return filing?.id ?? null;
}

export async function getBoardReportExtraction(extractionId: string) {
  return prisma.boardReportExtraction.findUnique({
    where: { id: extractionId },
    include: {
      filing: { select: { sourceUrl: true, sourceDocumentHash: true } },
      company: { select: { id: true, orgNumber: true, name: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function listPendingBoardReportExtractions(limit = 50) {
  return prisma.boardReportExtraction.findMany({
    where: { reviewStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(limit, 200)),
    include: {
      company: { select: { orgNumber: true, name: true } },
      filing: { select: { sourceUrl: true } },
    },
  });
}

export async function publishAcceptedBoardReportExtraction(extractionId: string) {
  return prisma.$transaction(async (transaction) => {
    const extraction = await transaction.boardReportExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!extraction) throw new Error(`Board-report extraction not found: ${extractionId}`);
    if (extraction.status !== "EXTRACTED" || !extraction.text) {
      throw new Error("Only a complete EXTRACTED board report can be published.");
    }
    if (!["NOT_REQUIRED", "ACCEPTED", "CORRECTED"].includes(extraction.reviewStatus)) {
      throw new Error("Board-report extraction has not passed review policy.");
    }

    return transaction.annualReportNarrative.upsert({
      where: {
        filingId_sectionKind_statementScope: {
          filingId: extraction.filingId,
          sectionKind: "BOARD_REPORT",
          statementScope: "COMPANY",
        },
      },
      create: {
        filingId: extraction.filingId,
        companyId: extraction.companyId,
        fiscalYear: extraction.fiscalYear,
        sectionKind: "BOARD_REPORT",
        statementScope: "COMPANY",
        title: extraction.title,
        textPreview: extraction.text.slice(0, 500),
        fullText: extraction.text,
        pageStart: extraction.pageStart,
        pageEnd: extraction.pageEnd,
        confidence: extraction.confidence,
        provenance: `BOARD_REPORT_EXTRACTION:${extraction.extractorVersion}`,
        sourceExtractionId: extraction.id,
      },
      update: {
        title: extraction.title,
        textPreview: extraction.text.slice(0, 500),
        fullText: extraction.text,
        pageStart: extraction.pageStart,
        pageEnd: extraction.pageEnd,
        confidence: extraction.confidence,
        provenance: `BOARD_REPORT_EXTRACTION:${extraction.extractorVersion}`,
        sourceExtractionId: extraction.id,
      },
    });
  });
}

export async function reviewBoardReportExtraction(input: {
  extractionId: string;
  reviewerUserId: string;
  decision: "ACCEPTED" | "REJECTED";
  reason?: string | null;
}) {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.boardReportExtraction.findUnique({
      where: { id: input.extractionId },
    });
    if (!current) throw new Error(`Board-report extraction not found: ${input.extractionId}`);
    if (current.reviewStatus !== "PENDING") {
      throw new Error("Only a pending board-report extraction can be reviewed.");
    }
    if (input.decision === "ACCEPTED" && !current.text) {
      throw new Error("A board-report extraction without text cannot be accepted.");
    }
    if (input.decision === "ACCEPTED" && current.status !== "MANUAL_REVIEW") {
      throw new Error("Only a MANUAL_REVIEW proposal can be accepted.");
    }
    const reviewedAt = new Date();
    if (input.decision === "REJECTED") {
      const transition = await transaction.boardReportExtraction.updateMany({
        where: { id: input.extractionId, reviewStatus: "PENDING" },
        data: {
          reviewStatus: "REJECTED",
          reviewedByUserId: input.reviewerUserId,
          reviewedAt,
          reviewReason: input.reason ?? null,
        },
      });
      if (transition.count !== 1) {
        throw new Error("Board-report extraction was already reviewed.");
      }
      return transaction.boardReportExtraction.findUniqueOrThrow({
        where: { id: input.extractionId },
      });
    }

    const transition = await transaction.boardReportExtraction.updateMany({
      where: { id: input.extractionId, reviewStatus: "PENDING" },
      data: {
        reviewStatus: "ACCEPTED",
        reviewedByUserId: input.reviewerUserId,
        reviewedAt,
        reviewReason: input.reason ?? null,
      },
    });
    if (transition.count !== 1) {
      throw new Error("Board-report extraction was already reviewed.");
    }
    const { id: _id, createdAt: _createdAt, ...proposal } = current;
    const reviewed = await transaction.boardReportExtraction.create({
      data: {
        ...proposal,
        startBoundary: nullableJson(current.startBoundary),
        endBoundary: nullableJson(current.endBoundary),
        includedBlocks: json(current.includedBlocks),
        quality: json(current.quality),
        matchedStartSignals: json(current.matchedStartSignals),
        matchedStopSignals: json(current.matchedStopSignals),
        warnings: json(current.warnings),
        status: "EXTRACTED",
        reviewStatus: "ACCEPTED",
        extractorVersion: `${current.extractorVersion}:reviewed:${current.id}`,
        reviewedByUserId: input.reviewerUserId,
        reviewedAt,
        reviewReason: input.reason ?? null,
        machineProposalId: current.id,
      },
    });
    await transaction.pdfTrainingLabel.create({
      data: {
        filingId: reviewed.filingId,
        reviewerUserId: input.reviewerUserId,
        labelType: "BOARD_REPORT_TEXT",
        targetRef: json({ sectionType: "BOARD_REPORT", extractionId: reviewed.id }),
        proposedValue: json({
          text: current.text,
          title: current.title,
          pageStart: current.pageStart,
          pageEnd: current.pageEnd,
        }),
        acceptedValue: json({
          text: reviewed.text,
          title: reviewed.title,
          pageStart: reviewed.pageStart,
          pageEnd: reviewed.pageEnd,
        }),
        sourcePayload: json({
          decisionType: "ACCEPTED",
          machineProposalId: current.id,
          acceptedExtractionId: reviewed.id,
          sourceDocumentHash: reviewed.sourceDocumentHash,
          extractorVersion: reviewed.extractorVersion,
        }),
      },
    });
    await transaction.annualReportNarrative.upsert({
      where: {
        filingId_sectionKind_statementScope: {
          filingId: reviewed.filingId,
          sectionKind: "BOARD_REPORT",
          statementScope: "COMPANY",
        },
      },
      create: {
        filingId: reviewed.filingId,
        companyId: reviewed.companyId,
        fiscalYear: reviewed.fiscalYear,
        sectionKind: "BOARD_REPORT",
        statementScope: "COMPANY",
        title: reviewed.title,
        textPreview: reviewed.text!.slice(0, 500),
        fullText: reviewed.text!,
        pageStart: reviewed.pageStart,
        pageEnd: reviewed.pageEnd,
        confidence: reviewed.confidence,
        provenance: `BOARD_REPORT_EXTRACTION:${reviewed.extractorVersion}`,
        sourceExtractionId: reviewed.id,
      },
      update: {
        title: reviewed.title,
        textPreview: reviewed.text!.slice(0, 500),
        fullText: reviewed.text!,
        pageStart: reviewed.pageStart,
        pageEnd: reviewed.pageEnd,
        confidence: reviewed.confidence,
        provenance: `BOARD_REPORT_EXTRACTION:${reviewed.extractorVersion}`,
        sourceExtractionId: reviewed.id,
      },
    });
    return reviewed;
  });
}
