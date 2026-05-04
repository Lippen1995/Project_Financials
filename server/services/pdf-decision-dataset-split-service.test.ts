import { describe, expect, it } from "vitest";

import type {
  PdfDecisionOutcomeDataset,
  PdfDecisionOutcomeDatasetRecord,
} from "./pdf-decision-outcome-dataset-service";
import { splitPdfDecisionOutcomeDataset } from "./pdf-decision-dataset-split-service";

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

function makeRecords(count: number): PdfDecisionOutcomeDatasetRecord[] {
  return Array.from({ length: count }, (_, i) =>
    makeRecord({ filingId: `filing-${i}`, extractionRunId: `run-${i}` }),
  );
}

describe("splitPdfDecisionOutcomeDataset", () => {
  it("is deterministic with the same seed", () => {
    const records = makeRecords(30);
    const dataset = makeDataset(records);
    const result1 = splitPdfDecisionOutcomeDataset({ dataset, seed: "test-seed" });
    const result2 = splitPdfDecisionOutcomeDataset({ dataset, seed: "test-seed" });
    expect(result1.records.map((r) => `${r.filingId}:${r.split}`)).toEqual(
      result2.records.map((r) => `${r.filingId}:${r.split}`),
    );
  });

  it("produces different splits with different seeds", () => {
    const records = makeRecords(30);
    const dataset = makeDataset(records);
    const result1 = splitPdfDecisionOutcomeDataset({ dataset, seed: "seed-a" });
    const result2 = splitPdfDecisionOutcomeDataset({ dataset, seed: "seed-b" });
    const splits1 = result1.records.map((r) => r.split).join(",");
    const splits2 = result2.records.map((r) => r.split).join(",");
    expect(splits1).not.toEqual(splits2);
  });

  it("split records sum to original count", () => {
    const records = makeRecords(20);
    const result = splitPdfDecisionOutcomeDataset({ dataset: makeDataset(records) });
    const total = result.splitCounts.train + result.splitCounts.validation + result.splitCounts.test;
    expect(total).toBe(20);
    expect(result.recordCount).toBe(20);
    expect(result.records).toHaveLength(20);
  });

  it("no filing appears in more than one split", () => {
    const records = makeRecords(50);
    const result = splitPdfDecisionOutcomeDataset({ dataset: makeDataset(records) });
    const filingToSplits = new Map<string, Set<string>>();
    for (const record of result.records) {
      const splits = filingToSplits.get(record.filingId) ?? new Set();
      splits.add(record.split);
      filingToSplits.set(record.filingId, splits);
    }
    for (const [filingId, splits] of filingToSplits) {
      expect(splits.size, `${filingId} appears in multiple splits`).toBe(1);
    }
    expect(result.leakageIssues).toHaveLength(0);
  });

  it("deduplicates filings before splitting", () => {
    const records = [
      makeRecord({ filingId: "dup" }),
      makeRecord({ filingId: "dup" }),
      makeRecord({ filingId: "unique" }),
    ];
    const result = splitPdfDecisionOutcomeDataset({ dataset: makeDataset(records) });
    expect(result.recordCount).toBe(2);
    const ids = result.records.map((r) => r.filingId);
    expect(ids.filter((id) => id === "dup")).toHaveLength(1);
  });

  it("validates that ratios must sum to 1", () => {
    const records = makeRecords(10);
    expect(() =>
      splitPdfDecisionOutcomeDataset({
        dataset: makeDataset(records),
        ratios: { train: 0.5, validation: 0.3, test: 0.3 },
      }),
    ).toThrow(/sum to 1/);
  });

  it("validates that all ratios must be positive", () => {
    const records = makeRecords(10);
    expect(() =>
      splitPdfDecisionOutcomeDataset({
        dataset: makeDataset(records),
        ratios: { train: 1.0, validation: 0.0, test: 0.0 },
      }),
    ).toThrow();
  });

  it("applies default ratios approximately 0.7/0.15/0.15", () => {
    const records = makeRecords(100);
    const result = splitPdfDecisionOutcomeDataset({ dataset: makeDataset(records) });
    // With 100 records and default seed, approximate the expected distribution
    expect(result.ratios).toEqual({ train: 0.7, validation: 0.15, test: 0.15 });
    // All splits must have at least 1 record
    expect(result.splitCounts.train).toBeGreaterThan(0);
    expect(result.splitCounts.validation).toBeGreaterThan(0);
    expect(result.splitCounts.test).toBeGreaterThan(0);
  });

  it("stratified splitting keeps same filing in one split", () => {
    const records = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeRecord({ filingId: `pub-${i}`, labels: { outcome: "PUBLISHED", latestReviewDecisionType: null, published: true, corrected: false, unreadable: false, reprocessRequested: false, failed: false } }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRecord({ filingId: `failed-${i}`, labels: { outcome: "FAILED", latestReviewDecisionType: null, published: false, corrected: false, unreadable: false, reprocessRequested: false, failed: true } }),
      ),
    ];
    const result = splitPdfDecisionOutcomeDataset({
      dataset: makeDataset(records),
      stratifyBy: ["outcome"],
    });
    const filingToSplits = new Map<string, Set<string>>();
    for (const r of result.records) {
      const s = filingToSplits.get(r.filingId) ?? new Set();
      s.add(r.split);
      filingToSplits.set(r.filingId, s);
    }
    for (const [, splits] of filingToSplits) {
      expect(splits.size).toBe(1);
    }
    expect(result.leakageIssues).toHaveLength(0);
  });

  it("output is JSON-safe", () => {
    const records = makeRecords(10);
    const result = splitPdfDecisionOutcomeDataset({ dataset: makeDataset(records) });
    expect(() => JSON.stringify(result)).not.toThrow();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("NaN");
    expect(serialized).not.toContain("Infinity");
  });
});
