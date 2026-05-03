import {
  PdfDecisionGoldSetReason,
  PdfDecisionGoldSetStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { PdfDecisionGoldSetItemRecord } from "@/server/persistence/pdf-decision-gold-set-repository";
import type { PdfDecisionShadowDocument } from "./annual-report-pdf-decision-shadow-evaluation";
import { runPdfDecisionGoldSetBenchmark } from "./pdf-decision-gold-set-benchmark-service";

function makeGoldSetItem(
  overrides: Partial<PdfDecisionGoldSetItemRecord> = {},
): PdfDecisionGoldSetItemRecord {
  return {
    id: "gold-1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "928846466",
    fiscalYear: 2024,
    status: PdfDecisionGoldSetStatus.APPROVED,
    reason: PdfDecisionGoldSetReason.REPRESENTATIVE_SAMPLE,
    note: null,
    decisionRoute: "TEXT_LAYER",
    riskLevel: "LOW",
    confidenceScore: 0.85,
    outcome: "PUBLISHED",
    source: "ADMIN",
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function makeDocument(overrides: Partial<PdfDecisionShadowDocument> = {}): PdfDecisionShadowDocument {
  return {
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "928846466",
    fiscalYear: 2024,
    decisionPhase: "post_validation",
    decisionRoute: "TEXT_LAYER",
    riskLevel: "LOW",
    confidenceScore: 0.86,
    manualReviewReasons: [],
    reasons: ["Reliable text layer"],
    qualityRisk: "LOW",
    recommendedRouteHint: "TEXT_LAYER",
    parserRiskReasons: [],
    extractionWarnings: [],
    hasStructuredDocument: true,
    hasPdfDecision: true,
    hasPostValidationDecision: true,
    filingStatus: "PUBLISHED",
    extractionRunStatus: "COMPLETED",
    validationScore: 0.9,
    blockingRuleCodes: [],
    warningRuleCodes: [],
    reviewStatus: null,
    latestReviewDecisionType: null,
    reviewDecisionCount: 0,
    trainingLabelCount: 0,
    outcome: "PUBLISHED",
    goldSet: null,
    ...overrides,
  };
}

async function runWith(
  goldSetItems: PdfDecisionGoldSetItemRecord[],
  documents: PdfDecisionShadowDocument[],
) {
  return runPdfDecisionGoldSetBenchmark(
    {},
    {
      listGoldSetItems: async () => goldSetItems,
      evaluateShadow: async () => ({
        documents,
      }),
    },
  );
}

describe("runPdfDecisionGoldSetBenchmark", () => {
  it("returns an empty JSON-safe result", async () => {
    const result = await runWith([], []);

    expect(result.metrics.totalItems).toBe(0);
    expect(result.metrics.matchRate).toBe(0);
    expect(result.items).toEqual([]);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("counts a matching approved item", async () => {
    const result = await runWith([makeGoldSetItem()], [makeDocument()]);

    expect(result.metrics.matchCount).toBe(1);
    expect(result.metrics.mismatchCount).toBe(0);
    expect(result.items[0].benchmarkOutcome).toBe("MATCH");
    expect(result.items[0].severity).toBe("INFO");
  });

  it("detects route mismatch", async () => {
    const result = await runWith(
      [makeGoldSetItem({ reason: PdfDecisionGoldSetReason.ROUTE_MISMATCH })],
      [makeDocument({ decisionRoute: "FORCE_OCR" })],
    );

    expect(result.items[0].benchmarkOutcome).toBe("ROUTE_MISMATCH");
    expect(result.items[0].severity).toBe("ERROR");
    expect(result.items[0].failures.join(" ")).toContain("Regression candidate");
    expect(result.metrics.routeMismatchCount).toBe(1);
    expect(result.metrics.errorCount).toBe(1);
  });

  it("detects risk mismatch", async () => {
    const result = await runWith([makeGoldSetItem()], [makeDocument({ riskLevel: "HIGH" })]);

    expect(result.items[0].benchmarkOutcome).toBe("RISK_MISMATCH");
    expect(result.metrics.riskMismatchCount).toBe(1);
  });

  it("detects outcome mismatch", async () => {
    const result = await runWith(
      [makeGoldSetItem()],
      [makeDocument({ outcome: "MANUAL_REVIEW_CORRECTED" })],
    );

    expect(result.items[0].benchmarkOutcome).toBe("OUTCOME_MISMATCH");
    expect(result.metrics.outcomeMismatchCount).toBe(1);
  });

  it("flags missing current decision as insufficient data and error for approved items", async () => {
    const result = await runWith([makeGoldSetItem()], [makeDocument({ hasPdfDecision: false })]);

    expect(result.items[0].benchmarkOutcome).toBe("INSUFFICIENT_DATA");
    expect(result.items[0].severity).toBe("ERROR");
    expect(result.metrics.insufficientDataCount).toBe(1);
  });

  it("detects confidence drift outside tolerance", async () => {
    const result = await runWith(
      [makeGoldSetItem({ confidenceScore: 0.9 })],
      [makeDocument({ confidenceScore: 0.4 })],
    );

    expect(result.items[0].benchmarkOutcome).toBe("CONFIDENCE_OUT_OF_RANGE");
    expect(result.items[0].severity).toBe("WARNING");
    expect(result.metrics.confidenceOutOfRangeCount).toBe(1);
  });

  it("ignores excluded items unless status ALL is requested by repository input", async () => {
    let capturedStatus: unknown;
    const result = await runPdfDecisionGoldSetBenchmark(
      { status: "ALL" },
      {
        listGoldSetItems: async (input) => {
          capturedStatus = input.status;
          return [
            makeGoldSetItem({
              status: PdfDecisionGoldSetStatus.EXCLUDED,
              decisionRoute: "TEXT_LAYER",
            }),
          ];
        },
        evaluateShadow: async () => ({ documents: [makeDocument({ decisionRoute: "FORCE_OCR" })] }),
      },
    );

    expect(capturedStatus).toBe("ALL");
    expect(result.items[0].severity).toBe("INFO");
  });

  it("computes mismatch rates and dimensions", async () => {
    const result = await runWith(
      [
        makeGoldSetItem({ id: "g1", filingId: "f1" }),
        makeGoldSetItem({ id: "g2", filingId: "f2", reason: PdfDecisionGoldSetReason.BALANCE_MISMATCH }),
      ],
      [
        makeDocument({ filingId: "f1" }),
        makeDocument({ filingId: "f2", riskLevel: "HIGH" }),
      ],
    );

    expect(result.metrics.matchCount).toBe(1);
    expect(result.metrics.mismatchCount).toBe(1);
    expect(result.metrics.matchRate).toBe(0.5);
    expect(result.metrics.mismatchRate).toBe(0.5);
    expect(result.metrics.mismatchesByReason.BALANCE_MISMATCH).toBe(1);
    expect(result.metrics.mismatchesByRisk.LOW).toBe(1);
  });
});
