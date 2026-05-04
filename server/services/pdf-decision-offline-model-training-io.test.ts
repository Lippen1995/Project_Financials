import { describe, expect, it } from "vitest";

import { parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl } from "./pdf-decision-offline-model-training-io";
import type { PdfDecisionMlFeatureRecord } from "./pdf-decision-ml-feature-schema-service";

function makeRecord(filingId: string): PdfDecisionMlFeatureRecord {
  return {
    version: "pdf-decision-ml-features-v1",
    ids: { filingId, extractionRunId: null, orgNumber: null, fiscalYear: 2023 },
    split: "train",
    numericFeatures: {
      confidenceScore: 0.8,
      parserRiskReasonCount: 0,
      extractionWarningCount: 0,
      manualReviewReasonCount: 0,
      blockingRuleCount: 0,
      warningRuleCount: 0,
      trainingLabelCount: 0,
      reviewedFactCount: 0,
      samplePriority: null,
      remediationItemCount: null,
    },
    booleanFeatures: {
      hasStructuredDocument: true,
      hasPdfDecision: true,
      hasPostValidationDecision: false,
      hasGoldSet: false,
      isGoldSetApproved: false,
      hasParserRiskReasons: false,
      hasBlockingRules: false,
      hasManualReviewReasons: false,
      hasCorrections: false,
      isUnreadable: false,
      isReprocessRequested: false,
      isPublished: true,
    },
    categoricalFeatures: {
      decisionRoute: "TEXT_LAYER",
      riskLevel: "LOW",
      qualityRisk: "LOW",
      recommendedRouteHint: "TEXT_LAYER",
      ruleConfigVersion: "v1",
      goldSetStatus: null,
      latestReviewDecisionType: null,
      currentOutcome: "PUBLISHED",
    },
    multiCategoricalFeatures: {
      manualReviewReasons: [],
      blockingRuleCodes: [],
      parserRiskReasons: [],
    },
    labels: {
      routeLabel: "TEXT_LAYER",
      manualReviewRequired: 0,
      corrected: 0,
      unreadable: 0,
      reprocessRequested: 0,
      published: 1,
      failed: 0,
    },
    labelProvenance: {
      sourceOutcome: "PUBLISHED",
      latestReviewDecisionType: null,
      goldSetStatus: null,
      derivedFrom: ["OUTCOME_DATASET"],
    },
  };
}

describe("parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl", () => {
  it("parses a full JSON dataset object", () => {
    const record = makeRecord("f1");
    const dataset = {
      version: "pdf-decision-ml-feature-dataset-v1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      schemaVersion: "pdf-decision-ml-features-v1",
      input: { limit: 1, includeText: false },
      recordCount: 1,
      records: [record],
    };
    const result = parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(JSON.stringify(dataset));
    expect(result.version).toBe("pdf-decision-ml-feature-dataset-v1");
    expect(result.records).toHaveLength(1);
    expect(result.records[0].ids.filingId).toBe("f1");
  });

  it("parses a JSON array of records", () => {
    const records = [makeRecord("f1"), makeRecord("f2")];
    const result = parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(JSON.stringify(records));
    expect(result.records).toHaveLength(2);
    expect(result.version).toBe("pdf-decision-ml-feature-dataset-v1");
  });

  it("parses JSONL input (one record per line)", () => {
    const r1 = makeRecord("f1");
    const r2 = makeRecord("f2");
    const jsonl = [JSON.stringify(r1), JSON.stringify(r2)].join("\n");
    const result = parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(jsonl);
    expect(result.records).toHaveLength(2);
    expect(result.records[0].ids.filingId).toBe("f1");
    expect(result.records[1].ids.filingId).toBe("f2");
  });

  it("rejects invalid JSON", () => {
    expect(() =>
      parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl("{invalid json"),
    ).toThrow();
  });

  it("rejects invalid JSONL (malformed line)", () => {
    const validLine = JSON.stringify(makeRecord("f1"));
    const invalidLine = "{ not valid json";
    const jsonl = [validLine, invalidLine].join("\n");
    expect(() =>
      parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(jsonl),
    ).toThrow(/JSONL/);
  });

  it("rejects JSONL with invalid records (missing filingId)", () => {
    const badRecord = { version: "pdf-decision-ml-features-v1", ids: {} };
    const jsonl = JSON.stringify(badRecord);
    // Single-line JSONL that starts with {
    // It's parsed as JSON object, which fails validation
    expect(() =>
      parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(jsonl),
    ).toThrow(/Invalid/);
  });

  it("wraps JSONL records with generated dataset metadata", () => {
    const record = makeRecord("f1");
    const jsonl = JSON.stringify(record);
    // Single-line object — parsed as JSON, then validated
    // This hits the dataset-object branch but with missing fields → throws
    // For proper JSONL test, use two lines
    const twoLines = [JSON.stringify(makeRecord("a")), JSON.stringify(makeRecord("b"))].join("\n");
    const result = parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(twoLines);
    expect(result.generatedAt).toBeTruthy();
    expect(result.recordCount).toBe(2);
  });

  it("ignores empty lines in JSONL", () => {
    const r = makeRecord("f1");
    const jsonl = `\n${JSON.stringify(r)}\n\n`;
    const result = parsePdfDecisionMlFeatureDatasetFromJsonOrJsonl(jsonl);
    expect(result.records).toHaveLength(1);
  });
});
