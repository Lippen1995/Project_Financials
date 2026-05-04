import { describe, expect, it } from "vitest";

import type {
  PdfDecisionOutcomeDataset,
  PdfDecisionOutcomeDatasetRecord,
} from "./pdf-decision-outcome-dataset-service";
import {
  evaluatePdfDecisionDatasetQuality,
  validatePdfDecisionDatasetForMlReadiness,
} from "./pdf-decision-dataset-quality-service";

function makeRecord(overrides: Partial<PdfDecisionOutcomeDatasetRecord> = {}): PdfDecisionOutcomeDatasetRecord {
  return {
    version: "pdf-decision-outcome-dataset-v1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    orgNumber: "928846466",
    fiscalYear: 2024,
    features: {
      decisionRoute: "TEXT_LAYER",
      riskLevel: "LOW",
      confidenceScore: 0.85,
      ruleConfigVersion: "pdf-decision-rules-v1",
      qualityRisk: "LOW",
      recommendedRouteHint: "TEXT_LAYER",
      parserRiskReasonCount: 0,
      extractionWarningCount: 0,
      manualReviewReasonCount: 0,
      blockingRuleCount: 0,
      warningRuleCount: 0,
      hasStructuredDocument: true,
      hasPdfDecision: true,
      hasPostValidationDecision: true,
      hasGoldSet: false,
      goldSetStatus: null,
      trainingLabelCount: 0,
      reviewedFactCount: 0,
    },
    labels: {
      outcome: "PUBLISHED",
      latestReviewDecisionType: null,
      published: true,
      corrected: false,
      unreadable: false,
      reprocessRequested: false,
      failed: false,
    },
    diagnostics: {
      manualReviewReasons: [],
      blockingRuleCodes: [],
      parserRiskReasons: [],
    },
    ...overrides,
  };
}

function makeDataset(records: PdfDecisionOutcomeDatasetRecord[]): PdfDecisionOutcomeDataset {
  return {
    version: "pdf-decision-outcome-dataset-v1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    input: { limit: records.length, includeText: false },
    recordCount: records.length,
    records,
  };
}

describe("evaluatePdfDecisionDatasetQuality", () => {
  it("reports ERROR for empty dataset", () => {
    const report = evaluatePdfDecisionDatasetQuality(makeDataset([]));
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.issues.some((i) => i.code === "EMPTY_DATASET")).toBe(true);
  });

  it("computes distributions for non-empty dataset", () => {
    const records = [
      makeRecord({ filingId: "a", features: { ...makeRecord().features, decisionRoute: "TEXT_LAYER", riskLevel: "LOW" } }),
      makeRecord({ filingId: "b", features: { ...makeRecord().features, decisionRoute: "OCR", riskLevel: "HIGH" }, labels: { ...makeRecord().labels, outcome: "FAILED", published: false, failed: true } }),
    ];
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(report.distributions.route["TEXT_LAYER"]).toBe(1);
    expect(report.distributions.route["OCR"]).toBe(1);
    expect(report.distributions.risk["LOW"]).toBe(1);
    expect(report.distributions.risk["HIGH"]).toBe(1);
    expect(report.distributions.outcome["PUBLISHED"]).toBe(1);
    expect(report.distributions.outcome["FAILED"]).toBe(1);
  });

  it("reports ERROR for missing outcome", () => {
    const record = makeRecord({
      labels: { outcome: "", latestReviewDecisionType: null, published: false, corrected: false, unreadable: false, reprocessRequested: false, failed: false },
    });
    const report = evaluatePdfDecisionDatasetQuality(makeDataset([record]));
    expect(report.issues.some((i) => i.code === "MISSING_OUTCOME")).toBe(true);
    expect(report.errorCount).toBeGreaterThan(0);
  });

  it("reports WARNING for missing decisionRoute", () => {
    const record = makeRecord({
      features: { ...makeRecord().features, decisionRoute: null },
    });
    const report = evaluatePdfDecisionDatasetQuality(makeDataset([record]));
    expect(report.issues.some((i) => i.code === "MISSING_DECISION")).toBe(true);
  });

  it("reports WARNING for duplicate filingId", () => {
    const records = [
      makeRecord({ filingId: "dup" }),
      makeRecord({ filingId: "dup" }),
    ];
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(report.issues.some((i) => i.code === "DUPLICATE_FILING" && i.filingId === "dup")).toBe(true);
  });

  it("reports WARNING for class imbalance when dataset >= 10", () => {
    // 10 PUBLISHED, 1 FAILED
    const records = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeRecord({ filingId: `pub-${i}` }),
      ),
      makeRecord({
        filingId: "failed-1",
        labels: { outcome: "FAILED", latestReviewDecisionType: null, published: false, corrected: false, unreadable: false, reprocessRequested: false, failed: true },
      }),
    ];
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(report.issues.some((i) => i.code === "CLASS_IMBALANCE")).toBe(true);
  });

  it("does NOT report class imbalance when dataset < 10", () => {
    const records = [
      makeRecord({ filingId: "a" }),
      makeRecord({ filingId: "b", labels: { outcome: "FAILED", latestReviewDecisionType: null, published: false, corrected: false, unreadable: false, reprocessRequested: false, failed: true } }),
    ];
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(report.issues.some((i) => i.code === "CLASS_IMBALANCE")).toBe(false);
  });

  it("reports INFO for low gold-set coverage when n >= 50", () => {
    const records = Array.from({ length: 50 }, (_, i) =>
      makeRecord({ filingId: `r-${i}` }),
    );
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(report.issues.some((i) => i.code === "LOW_GOLD_SET_COVERAGE")).toBe(true);
  });

  it("does NOT report low gold-set coverage when n < 50", () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      makeRecord({ filingId: `r-${i}` }),
    );
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(report.issues.some((i) => i.code === "LOW_GOLD_SET_COVERAGE")).toBe(false);
  });

  it("returns JSON-safe output", () => {
    const records = [makeRecord()];
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(() => JSON.stringify(report)).not.toThrow();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("NaN");
    expect(serialized).not.toContain("Infinity");
  });

  it("reports coverage metrics", () => {
    const records = [
      makeRecord({ filingId: "pub", labels: { outcome: "PUBLISHED", latestReviewDecisionType: null, published: true, corrected: false, unreadable: false, reprocessRequested: false, failed: false } }),
      makeRecord({ filingId: "corr", labels: { outcome: "MANUAL_REVIEW_CORRECTED", latestReviewDecisionType: "CORRECTED", published: false, corrected: true, unreadable: false, reprocessRequested: false, failed: false } }),
    ];
    const report = evaluatePdfDecisionDatasetQuality(makeDataset(records));
    expect(report.coverage.publishedCoverage).toBe(0.5);
    expect(report.coverage.correctedCoverage).toBe(0.5);
  });
});

describe("validatePdfDecisionDatasetForMlReadiness", () => {
  it("returns ready=true for clean dataset", () => {
    const records = [makeRecord()];
    const { ready } = validatePdfDecisionDatasetForMlReadiness(makeDataset(records));
    expect(ready).toBe(true);
  });

  it("returns ready=false when errors exist", () => {
    const { ready } = validatePdfDecisionDatasetForMlReadiness(makeDataset([]));
    expect(ready).toBe(false);
  });
});
