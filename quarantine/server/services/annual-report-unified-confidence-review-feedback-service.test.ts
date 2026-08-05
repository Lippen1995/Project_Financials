import {
  PdfModelArtifactKind,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, store } = vi.hoisted(() => {
  const store = {
    feedback: [] as Array<Record<string, unknown>>,
  };

  const prismaMock = {
    unifiedExtractionReviewFeedback: {
      findMany: vi.fn(async (args?: { where?: { filingId?: string } }) => {
        const filingId = args?.where?.filingId;
        const filtered = filingId
          ? store.feedback.filter((entry) => entry.filingId === filingId)
          : store.feedback;
        return [...filtered]
          .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
          .map((entry) => ({
            ...entry,
            createdAt: new Date(String(entry.createdAt)),
            updatedAt: new Date(String(entry.updatedAt)),
          }));
      }),
      findFirst: vi.fn(async (args?: { where?: { filingId?: string } }) => {
        const filingId = args?.where?.filingId;
        const match = store.feedback
          .filter((entry) => !filingId || entry.filingId === filingId)
          .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0];
        return match
          ? {
              ...match,
              createdAt: new Date(String(match.createdAt)),
              updatedAt: new Date(String(match.updatedAt)),
            }
          : null;
      }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const now = "2026-05-09T12:00:00.000Z";
        const record = {
          id: `feedback-${store.feedback.length + 1}`,
          filingId: args.data.filingId,
          orgNumber: args.data.orgNumber ?? null,
          fiscalYear: args.data.fiscalYear ?? null,
          reviewerUserId: "reviewer-1",
          confidenceGateArtifactId: args.data.confidenceGateArtifactId ?? null,
          sourceArtifactIds: args.data.sourceArtifactIds ?? null,
          action: args.data.action,
          targetType: args.data.targetType,
          targetRef: args.data.targetRef ?? null,
          proposedValue: args.data.proposedValue ?? null,
          acceptedValue: args.data.acceptedValue ?? null,
          reason: args.data.reason ?? null,
          notes: args.data.notes ?? null,
          createdAt: now,
          updatedAt: now,
        };
        store.feedback.push(record);
        return {
          ...record,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        };
      }),
    },
    pdfTrainingLabel: {
      create: vi.fn(async (args: unknown) => ({ id: "label-1", ...(args as Record<string, unknown>) })),
    },
    annualReportFiling: {
      update: vi.fn(),
    },
    financialStatement: {
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)),
  };

  return { prismaMock, store };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createUnifiedConfidenceReviewFeedback,
  getLatestUnifiedConfidenceReviewDecision,
  listUnifiedConfidenceReviewFeedbackForFiling,
  summarizeUnifiedConfidenceReviewFeedback,
  UnifiedConfidenceReviewFeedbackActionValues,
  UnifiedConfidenceReviewTargetTypeValues,
} from "@/server/services/annual-report-unified-confidence-review-feedback-service";
import type { UnifiedConfidenceFilingDrilldown } from "@/server/services/annual-report-unified-confidence-drilldown-service";

function makeDrilldown(): UnifiedConfidenceFilingDrilldown {
  return {
    detail: {
      filingId: "filing-1",
      orgNumber: "123456789",
      companyName: "Example AS",
      fiscalYear: 2024,
      status: "completed",
      gateVerdict: "WARN",
      passCount: 10,
      warnCount: 1,
      failCount: 0,
      insufficientDataCount: 0,
      blockingCheckCodes: [],
      warningCheckCodes: ["BOARD_REPORT_FOUND"],
      financialLineItemCount: 2,
      narrativeSectionCount: 1,
      comparisonMatchRate: 0.5,
      durationMs: 250,
      generatedAt: "2026-05-09T12:00:00.000Z",
      artifactId: "gate-artifact",
      artifactStatus: "CREATED",
      artifactCreatedAt: "2026-05-09T12:00:00.000Z",
      artifactUpdatedAt: "2026-05-09T12:00:00.000Z",
      artifactSourceCommand: null,
      artifactSourceCommitSha: null,
      errors: [],
      warnings: [],
      companyId: "company-1",
      artifactKind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
      fullChecks: [
        {
          checkCode: "BOARD_REPORT_FOUND",
          verdict: "WARN",
          message: "Board report missing.",
          value: null,
          threshold: null,
        },
      ],
      safety: {
        canUseForProductionRouting: false,
        productionRoutingChanged: false,
        productionFactsMutated: false,
        publishAffected: false,
      },
      shadowSummary: {
        documentPageCount: 4,
        financialStatementCount: 1,
        financialLineItemCount: 2,
        narrativeSectionCount: 1,
        comparisonFactCount: 2,
        comparisonExactMatchCount: 1,
        comparisonMismatchCount: 1,
        comparisonMatchRate: 0.5,
      },
      artifactPayload: {},
      artifactSummary: {},
    },
    artifacts: {
      availability: [],
      parserDocument: {
        kind: PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT,
        status: "available",
        artifactId: "parser-artifact",
        createdAt: "2026-05-09T12:00:00.000Z",
        summary: {},
        data: {
          summary: {},
          pageSummaries: [],
          sectionSummaries: [],
          tableSummaries: [],
          warnings: [],
          errors: [],
        },
        issues: [],
      },
      financialExtraction: {
        kind: PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION,
        status: "available",
        artifactId: "financial-artifact",
        createdAt: "2026-05-09T12:00:00.000Z",
        summary: {},
        data: {
          statements: [],
          lineItems: [
            {
              statementKind: "INCOME_STATEMENT",
              originalLabel: "Driftsinntekter",
              normalizedLabel: "driftsinntekter",
              canonicalKey: "revenue",
              fiscalYear: 2024,
              value: "1000",
              unitScale: "THOUSANDS",
              sign: "POSITIVE",
              pageNumber: 1,
              rowIndex: 0,
              columnIndex: 1,
              tableId: "table-1",
              blockIds: ["block-1"],
              confidence: 0.9,
              warnings: [],
            },
          ],
          warnings: [],
          errors: [],
        },
        issues: [],
      },
      narrativeExtraction: {
        kind: PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION,
        status: "available",
        artifactId: "narrative-artifact",
        createdAt: "2026-05-09T12:00:00.000Z",
        summary: {},
        data: {
          sections: [
            {
              sectionId: "section-1",
              kind: "AUDITOR_REPORT",
              title: "Revisors beretning",
              pageStart: 3,
              pageEnd: 4,
              confidence: 1,
              provenance: "DOCUMENT_SECTION",
              textPreview: "Auditor preview",
              warnings: [],
              signals: [],
            },
          ],
          warnings: [],
        },
        issues: [],
      },
      comparison: {
        kind: PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON,
        status: "available",
        artifactId: "comparison-artifact",
        createdAt: "2026-05-09T12:00:00.000Z",
        summary: {},
        data: {
          summary: {},
          financialComparisons: [],
          mismatches: [],
          narrativeComparisons: [],
          warnings: [],
        },
        issues: [],
      },
      confidenceGate: {
        kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
        status: "available",
        artifactId: "gate-artifact",
        createdAt: "2026-05-09T12:00:00.000Z",
        summary: {},
        data: {
          checks: [
            {
              checkCode: "BOARD_REPORT_FOUND",
              verdict: "WARN",
              message: "Board report missing.",
              value: null,
              threshold: null,
            },
          ],
        },
        issues: [],
      },
    },
    gateCheckContext: [],
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
  };
}

function resetStore() {
  store.feedback.length = 0;
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
}

describe("annual-report-unified-confidence-review-feedback-service", () => {
  beforeEach(resetStore);

  it("accept creates feedback and training label", async () => {
    const record = await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
      },
      "reviewer-1",
      {
        getDrilldown: vi.fn(async () => makeDrilldown()),
      },
    );

    expect(record.action).toBe(UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION);
    expect(prismaMock.pdfTrainingLabel.create).toHaveBeenCalledTimes(1);
  });

  it("reject requires reason", async () => {
    await expect(
      createUnifiedConfidenceReviewFeedback(
        {
          filingId: "filing-1",
          action: UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION,
          targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
        },
        "reviewer-1",
        {
          getDrilldown: vi.fn(async () => makeDrilldown()),
        },
      ),
    ).rejects.toThrow("requires a reason");
  });

  it("reject creates feedback and training label", async () => {
    const record = await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
        reason: "Mismatch is too large.",
      },
      "reviewer-1",
      {
        getDrilldown: vi.fn(async () => makeDrilldown()),
      },
    );

    expect(record.reason).toBe("Mismatch is too large.");
    expect(prismaMock.pdfTrainingLabel.create).toHaveBeenCalledTimes(1);
  });

  it("mark needs review creates feedback without production mutation", async () => {
    const record = await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
        reason: "Needs human follow-up.",
      },
      "reviewer-1",
      {
        getDrilldown: vi.fn(async () => makeDrilldown()),
      },
    );

    expect(record.action).toBe(UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW);
    expect(prismaMock.annualReportFiling.update).not.toHaveBeenCalled();
    expect(prismaMock.financialStatement.update).not.toHaveBeenCalled();
    expect(prismaMock.financialStatement.upsert).not.toHaveBeenCalled();
  });

  it("correct line item validates required fields", async () => {
    await expect(
      createUnifiedConfidenceReviewFeedback(
        {
          filingId: "filing-1",
          action: UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM,
          targetType: UnifiedConfidenceReviewTargetTypeValues.FINANCIAL_LINE_ITEM,
        },
        "reviewer-1",
        {
          getDrilldown: vi.fn(async () => makeDrilldown()),
        },
      ),
    ).rejects.toThrow("targetRef");
  });

  it("correct narrative section validates required fields", async () => {
    await expect(
      createUnifiedConfidenceReviewFeedback(
        {
          filingId: "filing-1",
          action: UnifiedConfidenceReviewFeedbackActionValues.CORRECT_SECTION_CLASSIFICATION,
          targetType: UnifiedConfidenceReviewTargetTypeValues.NARRATIVE_SECTION,
          targetRef: { sectionId: "section-1" },
        },
        "reviewer-1",
        {
          getDrilldown: vi.fn(async () => makeDrilldown()),
        },
      ),
    ).rejects.toThrow("acceptedValue");
  });

  it("feedback summary returns latest decision and correction counts", async () => {
    const getDrilldown = vi.fn(async () => makeDrilldown());

    await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
      },
      "reviewer-1",
      { getDrilldown },
    );
    await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.CORRECT_LINE_ITEM,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FINANCIAL_LINE_ITEM,
        targetRef: { canonicalKey: "revenue", fiscalYear: 2024 },
        acceptedValue: { value: "1100", unitScale: "THOUSANDS" },
      },
      "reviewer-1",
      { getDrilldown },
    );

    const summary = await summarizeUnifiedConfidenceReviewFeedback("filing-1");
    expect(summary.latestDecision?.action).toBe(UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION);
    expect(summary.correctionCount).toBe(1);
    expect(summary.totalFeedback).toBe(2);
  });

  it("duplicate accept handled safely", async () => {
    const getDrilldown = vi.fn(async () => makeDrilldown());
    await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
      },
      "reviewer-1",
      { getDrilldown },
    );

    await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
      },
      "reviewer-1",
      { getDrilldown },
    );

    const records = await listUnifiedConfidenceReviewFeedbackForFiling("filing-1");
    expect(records).toHaveLength(1);
    expect(prismaMock.pdfTrainingLabel.create).toHaveBeenCalledTimes(1);
  });

  it("safety invariants are preserved in proposed value", async () => {
    const record = await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
      },
      "reviewer-1",
      {
        getDrilldown: vi.fn(async () => makeDrilldown()),
      },
    );

    expect(record.proposedValue?.safety).toEqual({
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    });
  });

  it("detail lookup helpers return one filing and null when absent", async () => {
    expect(await getLatestUnifiedConfidenceReviewDecision("filing-1")).toBeNull();

    await createUnifiedConfidenceReviewFeedback(
      {
        filingId: "filing-1",
        action: UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
        reason: "Too risky.",
      },
      "reviewer-1",
      {
        getDrilldown: vi.fn(async () => makeDrilldown()),
      },
    );

    const latest = await getLatestUnifiedConfidenceReviewDecision("filing-1");
    expect(latest?.action).toBe(UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION);
  });
});
