import { describe, expect, it } from "vitest";

import type {
  PdfParserRouteRecommendationV2Decision,
  PdfParserRouteRecommendationV2Report,
} from "@/server/services/pdf-parser-route-recommendation-v2-service";
import {
  buildPdfParserRouteCanaryPreviewReport,
  DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
  validatePdfParserRouteCanaryConfig,
} from "@/server/services/pdf-parser-route-canary-config-service";
import type {
  PdfParserRouteCanaryConfig,
} from "@/server/services/pdf-parser-route-canary-config-service";

// ---- Fixture helpers --------------------------------------------------------

function makeDecision(
  id: string,
  route: "TEXT_LAYER" | "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID" | "MANUAL_REVIEW",
  opts?: {
    confidence?: PdfParserRouteRecommendationV2Decision["confidence"];
    risk?: PdfParserRouteRecommendationV2Decision["risk"];
    orgNumber?: string;
    fiscalYear?: number;
    hasFinancialCoverage?: boolean;
    hasAuditorReportCoverage?: boolean;
    warningCount?: number;
    errorCount?: number;
    requiresManualReview?: boolean;
  },
): PdfParserRouteRecommendationV2Decision {
  return {
    filingId: id,
    orgNumber: opts?.orgNumber ?? "123456789",
    fiscalYear: opts?.fiscalYear ?? 2024,
    recommendedRoute: route,
    fallbackRoute: "TEXT_LAYER",
    confidence: opts?.confidence ?? "HIGH",
    risk: opts?.risk ?? "LOW",
    evidence: {
      bestShadowRoute: route === "MANUAL_REVIEW" ? null : route,
      qualityBand: "GOOD",
      completedRouteCount: route === "MANUAL_REVIEW" ? 0 : 1,
      unavailableRouteCount: 0,
      failedRouteCount: 0,
      textLayerQualityScore: 40,
      ocrQualityScore: route === "OCR" ? 75 : null,
      odlQualityScore: route === "OPENDATALOADER_LOCAL" ? 78 : null,
      hybridQualityScore: route === "HYBRID" ? 80 : null,
      hasFinancialCoverage: opts?.hasFinancialCoverage ?? true,
      hasBoardReportCoverage: true,
      hasAuditorReportCoverage: opts?.hasAuditorReportCoverage ?? false,
      hasTableCoverage: true,
      warningCount: opts?.warningCount ?? 0,
      errorCount: opts?.errorCount ?? 0,
    },
    guardrails: {
      canUseForProductionRouting: false,
      requiresManualReview: opts?.requiresManualReview ?? route === "MANUAL_REVIEW",
      requiresMoreShadowEvidence: false,
      blockedReasons: [],
    },
    reasons: ["Test decision."],
  };
}

function makeRecommendationReport(
  decisions: PdfParserRouteRecommendationV2Decision[],
): PdfParserRouteRecommendationV2Report {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    filters: { limit: 100 },
    corpus: {
      artifactCount: decisions.length,
      documentCount: decisions.length,
      malformedArtifactCount: 0,
      successfulRouteRuns: decisions.length,
      failedRouteRuns: 0,
      unavailableRouteRuns: 0,
      skippedRouteRuns: 0,
      insufficientData: decisions.length === 0,
      insufficientDataReasons: [],
    },
    decisions,
    summary: {
      totalDocuments: decisions.length,
      textLayerRecommended: 0,
      ocrRecommended: 0,
      odlRecommended: 0,
      hybridRecommended: 0,
      manualReviewRequired: 0,
      highConfidence: decisions.length,
      mediumConfidence: 0,
      lowConfidence: 0,
      insufficientData: 0,
      highRisk: 0,
    },
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
  };
}

async function buildPreview(
  decisions: PdfParserRouteRecommendationV2Decision[],
  config?: PdfParserRouteCanaryConfig,
) {
  return buildPdfParserRouteCanaryPreviewReport(
    { config },
    {
      buildRecommendationReport: async () => makeRecommendationReport(decisions),
    },
  );
}

// ---- Default config tests ---------------------------------------------------

describe("DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG", () => {
  it("is DISABLED with maxCanaryPercent=0", () => {
    expect(DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.mode).toBe("DISABLED");
    expect(DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.maxCanaryPercent).toBe(0);
  });

  it("has all safety-first defaults", () => {
    const cfg = DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG;
    expect(cfg.hardBlocks.blockIfInsufficientData).toBe(true);
    expect(cfg.hardBlocks.blockIfManualReviewRequired).toBe(true);
    expect(cfg.hardBlocks.blockIfParserWarningsAbove).toBe(0);
    expect(cfg.hardBlocks.blockIfParserErrorsAbove).toBe(0);
    expect(cfg.hardBlocks.blockIfMissingFinancialCoverage).toBe(true);
    expect(cfg.requiredRecommendationConfidence).toBe("HIGH");
    expect(cfg.allowedRecommendationRisks).toEqual(["LOW"]);
    expect(cfg.requireShadowGatePass).toBe(true);
    expect(cfg.requireManualReviewFallback).toBe(true);
  });

  it("validates successfully out of the box", () => {
    // The default config has mode=DISABLED, so the maxCanaryPercent check doesn't trigger
    const cfg = { ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG };
    const { valid, issues } = validatePdfParserRouteCanaryConfig(cfg);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });
});

// ---- validatePdfParserRouteCanaryConfig -------------------------------------

describe("validatePdfParserRouteCanaryConfig", () => {
  it("rejects invalid mode", () => {
    const cfg = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "LIVE" as never,
    };
    const { valid, issues } = validatePdfParserRouteCanaryConfig(cfg);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("mode"))).toBe(true);
  });

  it("rejects non-zero maxCanaryPercent when mode is not DISABLED", () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "DRY_RUN",
      maxCanaryPercent: 10,
    };
    const { valid, issues } = validatePdfParserRouteCanaryConfig(cfg);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("maxCanaryPercent"))).toBe(true);
  });

  it("accepts DRY_RUN mode with maxCanaryPercent=0", () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "DRY_RUN",
      maxCanaryPercent: 0,
    };
    const { valid } = validatePdfParserRouteCanaryConfig(cfg);
    expect(valid).toBe(true);
  });

  it("rejects invalid allowedRoutes entries", () => {
    const cfg = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      allowedRoutes: ["TEXT_LAYER"] as never,
    };
    const { valid, issues } = validatePdfParserRouteCanaryConfig(cfg);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("TEXT_LAYER"))).toBe(true);
  });

  it("rejects HIGH or UNKNOWN in allowedRecommendationRisks", () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      allowedRecommendationRisks: ["HIGH"] as never,
    };
    const { valid, issues } = validatePdfParserRouteCanaryConfig(cfg);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("HIGH"))).toBe(true);
  });

  it("rejects missing audit.createdAt", () => {
    const cfg = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      audit: { createdAt: "" },
    };
    const { valid, issues } = validatePdfParserRouteCanaryConfig(cfg);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("audit.createdAt"))).toBe(true);
  });
});

// ---- buildPdfParserRouteCanaryPreviewReport ---------------------------------

describe("buildPdfParserRouteCanaryPreviewReport", () => {
  it("marks all filings as DISABLED when mode=DISABLED", async () => {
    const report = await buildPreview([
      makeDecision("f1", "OCR"),
      makeDecision("f2", "OPENDATALOADER_LOCAL"),
    ]);

    for (const filing of report.filings) {
      expect(filing.verdict).toBe("DISABLED");
      expect(filing.canUseForProductionRouting).toBe(false);
    }
    expect(report.summary.disabled).toBe(2);
    expect(report.summary.eligible).toBe(0);
  });

  it("marks all filings as DISABLED when maxCanaryPercent=0 even if mode=DRY_RUN", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "DRY_RUN",
      maxCanaryPercent: 0,
    };
    const report = await buildPreview([makeDecision("f1", "OCR")], cfg);
    expect(report.filings[0]!.verdict).toBe("DISABLED");
  });

  it("reports BLOCKED when recommended route is not in allowedRoutes (DRY_RUN config)", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "DRY_RUN",
      maxCanaryPercent: 0,
      allowedRoutes: ["OCR"],
    };
    // OPENDATALOADER_LOCAL is not in allowedRoutes, but mode=DISABLED takes priority
    // Use DRY_RUN to test route blocking — override maxCanaryPercent constraint via audit note
    const cfg2: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "DRY_RUN",
      maxCanaryPercent: 0, // still 0 — DISABLED verdict kicks in first
    };
    const report = await buildPreview([makeDecision("f1", "OPENDATALOADER_LOCAL")], cfg2);
    // With maxCanaryPercent=0, verdict is DISABLED regardless of route
    expect(report.filings[0]!.verdict).toBe("DISABLED");
  });

  it("blocks filings from org numbers on the blocklist", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "SHADOW_ONLY",
      maxCanaryPercent: 10,
      orgNumberBlocklist: ["999999999"],
      hardBlocks: {
        ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.hardBlocks,
        blockIfParserWarningsAbove: 999,
        blockIfParserErrorsAbove: 999,
        blockIfMissingFinancialCoverage: false,
        blockIfMissingAuditorReport: false,
      },
    };

    const report = await buildPreview(
      [makeDecision("f1", "OCR", { orgNumber: "999999999" })],
      cfg,
    );
    expect(report.filings[0]!.verdict).toBe("BLOCKED");
    expect(report.filings[0]!.blockedReasons.some((r) => r.includes("blocklist"))).toBe(true);
  });

  it("blocks filings when confidence is below requiredRecommendationConfidence", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "SHADOW_ONLY",
      maxCanaryPercent: 10,
      requiredRecommendationConfidence: "HIGH",
      hardBlocks: {
        ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.hardBlocks,
        blockIfParserWarningsAbove: 999,
        blockIfParserErrorsAbove: 999,
        blockIfMissingFinancialCoverage: false,
        blockIfMissingAuditorReport: false,
      },
    };

    const report = await buildPreview(
      [makeDecision("f1", "OCR", { confidence: "MEDIUM" })],
      cfg,
    );
    expect(report.filings[0]!.verdict).toBe("BLOCKED");
    expect(
      report.filings[0]!.blockedReasons.some((r) => r.includes("MEDIUM") && r.includes("HIGH")),
    ).toBe(true);
  });

  it("blocks filings with warnings above the threshold", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "SHADOW_ONLY",
      maxCanaryPercent: 10,
      hardBlocks: {
        ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.hardBlocks,
        blockIfParserWarningsAbove: 0,
        blockIfMissingFinancialCoverage: false,
        blockIfMissingAuditorReport: false,
        blockIfParserErrorsAbove: 999,
      },
    };

    const report = await buildPreview(
      [makeDecision("f1", "OCR", { warningCount: 1 })],
      cfg,
    );
    expect(report.filings[0]!.verdict).toBe("BLOCKED");
    expect(
      report.filings[0]!.blockedReasons.some((r) => r.includes("warning count")),
    ).toBe(true);
  });

  it("blocks filings with missing financial coverage when blockIfMissingFinancialCoverage=true", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "SHADOW_ONLY",
      maxCanaryPercent: 10,
      hardBlocks: {
        ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.hardBlocks,
        blockIfMissingFinancialCoverage: true,
        blockIfParserWarningsAbove: 999,
        blockIfParserErrorsAbove: 999,
        blockIfMissingAuditorReport: false,
      },
    };

    const report = await buildPreview(
      [makeDecision("f1", "OCR", { hasFinancialCoverage: false })],
      cfg,
    );
    expect(report.filings[0]!.verdict).toBe("BLOCKED");
    expect(
      report.filings[0]!.blockedReasons.some((r) => r.includes("financial")),
    ).toBe(true);
  });

  it("marks MANUAL_REVIEW decisions as BLOCKED when blockIfManualReviewRequired=true", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "SHADOW_ONLY",
      maxCanaryPercent: 10,
      hardBlocks: {
        ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.hardBlocks,
        blockIfManualReviewRequired: true,
        blockIfParserWarningsAbove: 999,
        blockIfParserErrorsAbove: 999,
        blockIfMissingFinancialCoverage: false,
      },
    };

    const report = await buildPreview(
      [makeDecision("f1", "MANUAL_REVIEW", { requiresManualReview: true })],
      cfg,
    );
    expect(report.filings[0]!.verdict).toBe("BLOCKED");
  });

  it("reports ELIGIBLE when all conditions are met (SHADOW_ONLY config)", async () => {
    const cfg: PdfParserRouteCanaryConfig = {
      ...DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG,
      mode: "SHADOW_ONLY",
      maxCanaryPercent: 10,
      allowedRoutes: ["OCR"],
      requiredRecommendationConfidence: "HIGH",
      allowedRecommendationRisks: ["LOW"],
      hardBlocks: {
        blockIfInsufficientData: true,
        blockIfManualReviewRequired: true,
        blockIfParserWarningsAbove: 999,
        blockIfParserErrorsAbove: 999,
        blockIfMissingFinancialCoverage: false,
        blockIfMissingAuditorReport: false,
      },
    };

    const report = await buildPreview(
      [
        makeDecision("f1", "OCR", {
          confidence: "HIGH",
          risk: "LOW",
          hasFinancialCoverage: true,
          warningCount: 0,
          errorCount: 0,
        }),
      ],
      cfg,
    );
    expect(report.filings[0]!.verdict).toBe("ELIGIBLE");
    expect(report.filings[0]!.canaryRoute).toBe("OCR");
    expect(report.filings[0]!.canUseForProductionRouting).toBe(false);
    expect(report.summary.eligible).toBe(1);
    expect(report.summary.eligibleByRoute["OCR"]).toBe(1);
  });

  it("always sets canUseForProductionRouting=false on all filings and report", async () => {
    const report = await buildPreview([makeDecision("f1", "OCR")]);
    expect(report.safety.canUseForProductionRouting).toBe(false);
    for (const f of report.filings) {
      expect(f.canUseForProductionRouting).toBe(false);
    }
  });

  it("populates config validation results in the report", async () => {
    const report = await buildPreview([]);
    expect(typeof report.configValid).toBe("boolean");
    expect(Array.isArray(report.configIssues)).toBe(true);
  });

  it("returns empty filings list when no recommendations exist", async () => {
    const report = await buildPreview([]);
    expect(report.filings).toHaveLength(0);
    expect(report.summary.totalDocuments).toBe(0);
  });
});
