import { describe, expect, it, vi } from "vitest";

import type {
  PdfParserRouteCanaryConfig,
  PdfParserRouteCanaryPreviewReport,
} from "@/server/services/pdf-parser-route-canary-config-service";
import {
  buildPdfParserRouteAssignmentPreviewReport,
  stableHashBucket,
  validatePdfParserRouteAssignmentPreviewReport,
} from "@/server/services/pdf-parser-route-assignment-preview-service";

// ---- Helpers ----------------------------------------------------------------

function makeConfig(overrides: Partial<PdfParserRouteCanaryConfig> = {}): PdfParserRouteCanaryConfig {
  return {
    version: "pdf-parser-route-canary-config-v1",
    mode: "SHADOW_ONLY",
    allowedRoutes: ["OCR", "OPENDATALOADER_LOCAL", "HYBRID"],
    maxCanaryPercent: 50,
    orgNumberAllowlist: [],
    orgNumberBlocklist: [],
    fiscalYearAllowlist: [],
    requiredRecommendationConfidence: "MEDIUM",
    allowedRecommendationRisks: ["LOW", "MEDIUM"],
    requireShadowGatePass: false,
    requireModelCandidateApprovedForShadow: false,
    requireManualReviewFallback: false,
    hardBlocks: {
      blockIfInsufficientData: false,
      blockIfManualReviewRequired: false,
      blockIfParserWarningsAbove: 100,
      blockIfParserErrorsAbove: 100,
      blockIfMissingFinancialCoverage: false,
      blockIfMissingAuditorReport: false,
    },
    audit: { createdAt: "2026-01-01T00:00:00.000Z" },
    ...overrides,
  };
}

function makeCanaryReport(
  overrides: Partial<PdfParserRouteCanaryPreviewReport> = {},
): PdfParserRouteCanaryPreviewReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    config: makeConfig(),
    configValid: true,
    configIssues: [],
    filings: [],
    summary: {
      totalDocuments: 0,
      eligible: 0,
      blocked: 0,
      disabled: 0,
      eligibleByRoute: {},
    },
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    ...overrides,
  };
}

// ---- stableHashBucket -------------------------------------------------------

describe("stableHashBucket", () => {
  it("returns a number in [0, 99]", () => {
    for (const seed of ["preview", "test", "prod"]) {
      for (const id of ["filing-1", "filing-2", "abc-xyz-123"]) {
        const bucket = stableHashBucket(seed, id, "987654321");
        expect(bucket).toBeGreaterThanOrEqual(0);
        expect(bucket).toBeLessThanOrEqual(99);
      }
    }
  });

  it("is deterministic — same inputs always produce the same bucket", () => {
    const a = stableHashBucket("preview", "filing-abc", "123456789");
    const b = stableHashBucket("preview", "filing-abc", "123456789");
    expect(a).toBe(b);
  });

  it("changes when the seed changes", () => {
    const a = stableHashBucket("seed-A", "filing-abc", "123456789");
    const b = stableHashBucket("seed-B", "filing-abc", "123456789");
    // Seeds produce different distributions; for these concrete strings they differ.
    expect(a).not.toBe(b);
  });

  it("changes when filingId changes", () => {
    const a = stableHashBucket("preview", "filing-1", "123456789");
    const b = stableHashBucket("preview", "filing-2", "123456789");
    expect(a).not.toBe(b);
  });

  it("treats null orgNumber as empty string (stable)", () => {
    const a = stableHashBucket("preview", "filing-1", null);
    const b = stableHashBucket("preview", "filing-1", "");
    expect(a).toBe(b);
  });
});

// ---- buildPdfParserRouteAssignmentPreviewReport ----------------------------

describe("buildPdfParserRouteAssignmentPreviewReport", () => {
  it("returns empty assignments when canary report has no filings", async () => {
    const mockCanary = vi.fn().mockResolvedValue(makeCanaryReport({ filings: [] }));
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config: makeConfig() },
      { buildCanaryReport: mockCanary },
    );
    expect(report.assignments).toHaveLength(0);
    expect(report.summary.totalDocuments).toBe(0);
  });

  it("sets canUseForProductionRouting=false on the report and all assignments", async () => {
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config: makeConfig({ maxCanaryPercent: 100 }),
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            verdict: "ELIGIBLE",
            canaryRoute: "OCR",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config: makeConfig({ maxCanaryPercent: 100 }) },
      { buildCanaryReport: mockCanary },
    );
    expect(report.safety.canUseForProductionRouting).toBe(false);
    expect(report.safety.productionRoutingChanged).toBe(false);
    for (const a of report.assignments) {
      expect(a.canUseForProductionRouting).toBe(false);
    }
  });

  it("marks all filings as DISABLED when canary verdict is DISABLED", async () => {
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config: makeConfig({ mode: "DISABLED", maxCanaryPercent: 0 }),
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            verdict: "DISABLED",
            canaryRoute: null,
            blockedReasons: ["Canary routing is disabled (mode=DISABLED or maxCanaryPercent=0)."],
            canUseForProductionRouting: false,
          },
          {
            filingId: "f2",
            orgNumber: "222",
            fiscalYear: 2024,
            verdict: "DISABLED",
            canaryRoute: null,
            blockedReasons: ["Canary routing is disabled (mode=DISABLED or maxCanaryPercent=0)."],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config: makeConfig({ mode: "DISABLED", maxCanaryPercent: 0 }) },
      { buildCanaryReport: mockCanary },
    );
    expect(report.summary.disabled).toBe(2);
    expect(report.summary.wouldUseCanaryRoute).toBe(0);
    for (const a of report.assignments) {
      expect(a.verdict).toBe("DISABLED");
    }
  });

  it("marks filings as BLOCKED when canary verdict is BLOCKED (non-manual-review)", async () => {
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config: makeConfig(),
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            verdict: "BLOCKED",
            canaryRoute: null,
            blockedReasons: ["Confidence \"LOW\" is below required \"MEDIUM\"."],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config: makeConfig() },
      { buildCanaryReport: mockCanary },
    );
    expect(report.summary.blocked).toBe(1);
    expect(report.assignments[0].verdict).toBe("BLOCKED");
  });

  it("maps BLOCKED with manual-review reason to MANUAL_REVIEW verdict", async () => {
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config: makeConfig(),
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            verdict: "BLOCKED",
            canaryRoute: null,
            blockedReasons: ["Blocked: decision requires manual review."],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config: makeConfig() },
      { buildCanaryReport: mockCanary },
    );
    expect(report.summary.manualReview).toBe(1);
    expect(report.assignments[0].verdict).toBe("MANUAL_REVIEW");
  });

  it("assigns WOULD_USE_CANARY_ROUTE when bucket < maxCanaryPercent", async () => {
    // Use maxCanaryPercent=100 so any bucket qualifies.
    const config = makeConfig({ maxCanaryPercent: 100 });
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config,
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            verdict: "ELIGIBLE",
            canaryRoute: "OCR",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config },
      { buildCanaryReport: mockCanary },
    );
    expect(report.summary.wouldUseCanaryRoute).toBe(1);
    expect(report.assignments[0].verdict).toBe("WOULD_USE_CANARY_ROUTE");
    expect(report.assignments[0].assignedCanaryRoute).toBe("OCR");
  });

  it("assigns WOULD_USE_TEXT_LAYER when bucket >= maxCanaryPercent", async () => {
    // Use maxCanaryPercent=0 so no bucket qualifies.
    const config = makeConfig({ mode: "SHADOW_ONLY", maxCanaryPercent: 0 });
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config,
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            // Even if somehow eligible, bucket >= 0 always.
            verdict: "ELIGIBLE",
            canaryRoute: "OCR",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config },
      { buildCanaryReport: mockCanary },
    );
    expect(report.summary.wouldUseTextLayer).toBe(1);
    expect(report.assignments[0].verdict).toBe("WOULD_USE_TEXT_LAYER");
    expect(report.assignments[0].assignedCanaryRoute).toBeNull();
  });

  it("records bucket and maxCanaryPercent on each assignment", async () => {
    const config = makeConfig({ maxCanaryPercent: 30 });
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config,
        filings: [
          {
            filingId: "filing-abc",
            orgNumber: "123456789",
            fiscalYear: 2023,
            verdict: "ELIGIBLE",
            canaryRoute: "HYBRID",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "test-seed", config },
      { buildCanaryReport: mockCanary },
    );
    const a = report.assignments[0];
    expect(a.maxCanaryPercent).toBe(30);
    expect(a.bucket).toBe(stableHashBucket("test-seed", "filing-abc", "123456789"));
  });

  it("uses default seed 'preview' when none is provided", async () => {
    const mockCanary = vi.fn().mockResolvedValue(makeCanaryReport());
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      {},
      { buildCanaryReport: mockCanary },
    );
    expect(report.seed).toBe("preview");
  });

  it("includes correct byAssignedRoute counts in summary", async () => {
    const config = makeConfig({ maxCanaryPercent: 100 });
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config,
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            verdict: "ELIGIBLE",
            canaryRoute: "OCR",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
          {
            filingId: "f2",
            orgNumber: "222",
            fiscalYear: 2024,
            verdict: "ELIGIBLE",
            canaryRoute: "OCR",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
          {
            filingId: "f3",
            orgNumber: "333",
            fiscalYear: 2024,
            verdict: "ELIGIBLE",
            canaryRoute: "HYBRID",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config },
      { buildCanaryReport: mockCanary },
    );
    expect(report.summary.wouldUseCanaryRoute).toBe(3);
    expect(report.summary.byAssignedRoute["OCR"]).toBe(2);
    expect(report.summary.byAssignedRoute["HYBRID"]).toBe(1);
  });

  it("calls buildCanaryReport exactly once", async () => {
    const mockCanary = vi.fn().mockResolvedValue(makeCanaryReport());
    await buildPdfParserRouteAssignmentPreviewReport({}, { buildCanaryReport: mockCanary });
    expect(mockCanary).toHaveBeenCalledTimes(1);
  });
});

// ---- validatePdfParserRouteAssignmentPreviewReport -------------------------

describe("validatePdfParserRouteAssignmentPreviewReport", () => {
  it("validates a correct report", async () => {
    const config = makeConfig({ maxCanaryPercent: 100 });
    const mockCanary = vi.fn().mockResolvedValue(
      makeCanaryReport({
        config,
        filings: [
          {
            filingId: "f1",
            orgNumber: "111",
            fiscalYear: 2024,
            verdict: "ELIGIBLE",
            canaryRoute: "OCR",
            blockedReasons: [],
            canUseForProductionRouting: false,
          },
        ],
      }),
    );
    const report = await buildPdfParserRouteAssignmentPreviewReport(
      { seed: "preview", config },
      { buildCanaryReport: mockCanary },
    );
    const { valid, issues } = validatePdfParserRouteAssignmentPreviewReport(report);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it("rejects report where safety.canUseForProductionRouting=true", () => {
    const report = {
      schemaVersion: 1 as const,
      generatedAt: "2026-01-01T00:00:00.000Z",
      seed: "preview",
      config: makeConfig(),
      assignments: [],
      summary: {
        totalDocuments: 0,
        wouldUseCanaryRoute: 0,
        wouldUseTextLayer: 0,
        manualReview: 0,
        blocked: 0,
        disabled: 0,
        byAssignedRoute: {},
      },
      safety: {
        readOnly: true as const,
        productionRoutingChanged: false as const,
        productionFactsMutated: false as const,
        publishAffected: false as const,
        shadowOnly: true as const,
        canUseForProductionRouting: true as unknown as false,
      },
    };
    const { valid, issues } = validatePdfParserRouteAssignmentPreviewReport(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("canUseForProductionRouting"))).toBe(true);
  });

  it("rejects assignments where canUseForProductionRouting=true", () => {
    const report = {
      schemaVersion: 1 as const,
      generatedAt: "2026-01-01T00:00:00.000Z",
      seed: "preview",
      config: makeConfig(),
      assignments: [
        {
          filingId: "f1",
          orgNumber: null,
          fiscalYear: 2024,
          bucket: 42,
          maxCanaryPercent: 50,
          verdict: "WOULD_USE_TEXT_LAYER" as const,
          assignedCanaryRoute: null,
          blockedReasons: [],
          canUseForProductionRouting: true as unknown as false,
        },
      ],
      summary: {
        totalDocuments: 1,
        wouldUseCanaryRoute: 0,
        wouldUseTextLayer: 1,
        manualReview: 0,
        blocked: 0,
        disabled: 0,
        byAssignedRoute: {},
      },
      safety: {
        readOnly: true as const,
        productionRoutingChanged: false as const,
        productionFactsMutated: false as const,
        publishAffected: false as const,
        shadowOnly: true as const,
        canUseForProductionRouting: false as const,
      },
    };
    const { valid, issues } = validatePdfParserRouteAssignmentPreviewReport(report);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("f1"))).toBe(true);
  });
});
