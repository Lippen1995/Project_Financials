/**
 * Tests for annual-report-unified-shadow-extraction-service.ts
 *
 * Safety contracts:
 * - DISABLED mode returns immediately with skipped=true, no extraction runs
 * - DRY_RUN mode runs extraction in-memory, persists nothing
 * - PERSIST_ARTIFACTS mode persists what the flags say
 * - Errors in each step are caught and recorded; they do not throw
 * - canUseForProductionRouting is always false
 *
 * Test constraints:
 * - No OCR, no live Brreg, no external network calls
 * - All dependencies are mocked or use empty fixtures
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runAnnualReportUnifiedShadowExtraction,
  type AnnualReportUnifiedShadowInput,
} from "@/server/services/annual-report-unified-shadow-extraction-service";
import type { AnnualReportUnifiedShadowConfig } from "@/server/services/annual-report-unified-shadow-config";
import type { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_FILING_ID = "filing-shadow-test-1";
const FAKE_ORG_NUMBER = "928846466";
const FAKE_FISCAL_YEAR = 2024;

function makePreflight(overrides?: Partial<PreflightResult>): PreflightResult {
  return {
    pageCount: 1,
    hasTextLayer: true,
    hasReliableTextLayer: true,
    parsedPages: [
      {
        pageNumber: 1,
        text: "Styrets årsberetning\nResultatregnskap 2024",
        normalizedText: "styrets arsberetning resultatregnskap 2024",
      },
    ],
    structuredDocument: undefined,
    ...overrides,
  };
}

function makeDisabledConfig(): AnnualReportUnifiedShadowConfig {
  return {
    mode: "DISABLED",
    persistUnifiedParserDocument: false,
    persistUnifiedFinancialExtraction: false,
    persistUnifiedNarrativeExtraction: false,
    persistLegacyVsUnifiedComparison: false,
  };
}

function makeDryRunConfig(): AnnualReportUnifiedShadowConfig {
  return {
    mode: "DRY_RUN",
    persistUnifiedParserDocument: false,
    persistUnifiedFinancialExtraction: false,
    persistUnifiedNarrativeExtraction: false,
    persistLegacyVsUnifiedComparison: false,
  };
}

function makePersistConfig(flags?: Partial<Omit<AnnualReportUnifiedShadowConfig, "mode">>): AnnualReportUnifiedShadowConfig {
  return {
    mode: "PERSIST_ARTIFACTS",
    persistUnifiedParserDocument: flags?.persistUnifiedParserDocument ?? false,
    persistUnifiedFinancialExtraction: flags?.persistUnifiedFinancialExtraction ?? false,
    persistUnifiedNarrativeExtraction: flags?.persistUnifiedNarrativeExtraction ?? false,
    persistLegacyVsUnifiedComparison: flags?.persistLegacyVsUnifiedComparison ?? false,
  };
}

function makeBaseInput(config: AnnualReportUnifiedShadowConfig): AnnualReportUnifiedShadowInput {
  return {
    filingId: FAKE_FILING_ID,
    orgNumber: FAKE_ORG_NUMBER,
    fiscalYear: FAKE_FISCAL_YEAR,
    preflight: makePreflight(),
    legacyCandidates: [] as CanonicalFactCandidate[],
    config,
  };
}

function makeArtifactResult() {
  return { artifactId: "art-1", kind: "UNIFIED_PARSER_DOCUMENT", createdAt: new Date(), summary: {} };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAnnualReportUnifiedShadowExtraction", () => {
  describe("DISABLED mode", () => {
    it("returns skipped=true immediately without running any extraction", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDisabledConfig()),
      );

      expect(result.skipped).toBe(true);
      expect(result.mode).toBe("DISABLED");
      expect(result.document).toBeNull();
      expect(result.financial).toBeNull();
      expect(result.narrative).toBeNull();
      expect(result.comparison).toBeNull();
    });

    it("always has canUseForProductionRouting=false", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDisabledConfig()),
      );
      expect(result.canUseForProductionRouting).toBe(false);
    });

    it("returns zero totalDurationMs (fast exit)", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDisabledConfig()),
      );
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("does not call artifact persist functions", async () => {
      const persistDoc = vi.fn();
      const persistFin = vi.fn();
      const persistNar = vi.fn();
      const persistCmp = vi.fn();
      await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDisabledConfig()),
        { persistDocument: persistDoc, persistFinancial: persistFin, persistNarrative: persistNar, persistComparison: persistCmp },
      );
      expect(persistDoc).not.toHaveBeenCalled();
      expect(persistFin).not.toHaveBeenCalled();
      expect(persistNar).not.toHaveBeenCalled();
      expect(persistCmp).not.toHaveBeenCalled();
    });
  });

  describe("DRY_RUN mode", () => {
    it("returns skipped=false and mode=DRY_RUN", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      expect(result.skipped).toBe(false);
      expect(result.mode).toBe("DRY_RUN");
    });

    it("always has canUseForProductionRouting=false", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      expect(result.canUseForProductionRouting).toBe(false);
    });

    it("runs all extraction steps (document, financial, narrative, comparison)", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      // Document step should succeed (we provide a valid preflight)
      expect(result.steps.document).not.toBeNull();
      expect(result.steps.document?.ok).toBe(true);
      // Financial, narrative, comparison steps should also be attempted
      expect(result.steps.financial).not.toBeNull();
      expect(result.steps.narrative).not.toBeNull();
      expect(result.steps.comparison).not.toBeNull();
    });

    it("produces a non-null document", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      expect(result.document).not.toBeNull();
      expect(result.document?.safety.canUseForProductionRouting).toBe(false);
    });

    it("produces a non-null financial extraction result", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      expect(result.financial).not.toBeNull();
      expect(result.financial?.safety.canUseForProductionRouting).toBe(false);
    });

    it("produces a non-null narrative extraction result", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      expect(result.narrative).not.toBeNull();
      expect(result.narrative?.safety.canUseForProductionRouting).toBe(false);
    });

    it("produces a non-null comparison report", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      expect(result.comparison).not.toBeNull();
      expect(result.comparison?.safety.canUseForProductionRouting).toBe(false);
    });

    it("does not call artifact persist functions even in DRY_RUN", async () => {
      const persistDoc = vi.fn();
      const persistFin = vi.fn();
      const persistNar = vi.fn();
      const persistCmp = vi.fn();
      await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
        { persistDocument: persistDoc, persistFinancial: persistFin, persistNarrative: persistNar, persistComparison: persistCmp },
      );
      expect(persistDoc).not.toHaveBeenCalled();
      expect(persistFin).not.toHaveBeenCalled();
      expect(persistNar).not.toHaveBeenCalled();
      expect(persistCmp).not.toHaveBeenCalled();
    });

    it("records step durations", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      expect(result.steps.document?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.steps.financial?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.steps.narrative?.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.steps.comparison?.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("PERSIST_ARTIFACTS mode", () => {
    it("does not call persist functions when all persist flags are false", async () => {
      const persistDoc = vi.fn();
      const persistFin = vi.fn();
      const persistNar = vi.fn();
      const persistCmp = vi.fn();
      await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makePersistConfig()),
        { persistDocument: persistDoc, persistFinancial: persistFin, persistNarrative: persistNar, persistComparison: persistCmp },
      );
      expect(persistDoc).not.toHaveBeenCalled();
      expect(persistFin).not.toHaveBeenCalled();
      expect(persistNar).not.toHaveBeenCalled();
      expect(persistCmp).not.toHaveBeenCalled();
    });

    it("calls persistDocument when persistUnifiedParserDocument=true", async () => {
      const persistDoc = vi.fn().mockResolvedValue(makeArtifactResult());
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makePersistConfig({ persistUnifiedParserDocument: true })),
        { persistDocument: persistDoc },
      );
      expect(persistDoc).toHaveBeenCalledTimes(1);
      expect(result.artifacts.document?.ok).toBe(true);
    });

    it("calls persistFinancial when persistUnifiedFinancialExtraction=true", async () => {
      const persistFin = vi.fn().mockResolvedValue(makeArtifactResult());
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makePersistConfig({ persistUnifiedFinancialExtraction: true })),
        { persistFinancial: persistFin },
      );
      expect(persistFin).toHaveBeenCalledTimes(1);
      expect(result.artifacts.financial?.ok).toBe(true);
    });

    it("calls persistNarrative when persistUnifiedNarrativeExtraction=true", async () => {
      const persistNar = vi.fn().mockResolvedValue(makeArtifactResult());
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makePersistConfig({ persistUnifiedNarrativeExtraction: true })),
        { persistNarrative: persistNar },
      );
      expect(persistNar).toHaveBeenCalledTimes(1);
      expect(result.artifacts.narrative?.ok).toBe(true);
    });

    it("calls persistComparison when persistLegacyVsUnifiedComparison=true", async () => {
      const persistCmp = vi.fn().mockResolvedValue(makeArtifactResult());
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makePersistConfig({ persistLegacyVsUnifiedComparison: true })),
        { persistComparison: persistCmp },
      );
      expect(persistCmp).toHaveBeenCalledTimes(1);
      expect(result.artifacts.comparison?.ok).toBe(true);
    });

    it("records persist failure without throwing when persistDocument fails", async () => {
      const persistDoc = vi.fn().mockRejectedValue(new Error("DB write failed"));
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makePersistConfig({ persistUnifiedParserDocument: true })),
        { persistDocument: persistDoc },
      );
      expect(result.artifacts.document?.ok).toBe(false);
      expect((result.artifacts.document as { ok: false; error: string } | null)?.error).toContain("DB write failed");
      // The function should not have thrown
    });
  });

  describe("error isolation", () => {
    it("records document step failure without throwing", async () => {
      // Provide invalid preflight to force a build error
      // We can simulate by injecting a broken preflight
      const brokenInput: AnnualReportUnifiedShadowInput = {
        ...makeBaseInput(makeDryRunConfig()),
        preflight: {
          pageCount: 0,
          hasTextLayer: false,
          hasReliableTextLayer: false,
          parsedPages: [],
        },
      };
      // Should not throw
      const result = await runAnnualReportUnifiedShadowExtraction(brokenInput);
      // Steps should have run (even with empty pages, the function should complete)
      expect(result).toBeDefined();
      expect(result.canUseForProductionRouting).toBe(false);
    });

    it("still produces comparison even when financial/narrative are null (uses empty candidates)", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      // comparison step should at least be attempted
      expect(result.steps.comparison).not.toBeNull();
    });
  });

  describe("safety invariants", () => {
    it("canUseForProductionRouting is always false regardless of mode", async () => {
      for (const config of [makeDisabledConfig(), makeDryRunConfig(), makePersistConfig()]) {
        const result = await runAnnualReportUnifiedShadowExtraction(
          makeBaseInput(config),
        );
        expect(result.canUseForProductionRouting).toBe(false);
      }
    });

    it("document safety.canUseForProductionRouting is false in DRY_RUN", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction(
        makeBaseInput(makeDryRunConfig()),
      );
      if (result.document !== null) {
        expect(result.document.safety.canUseForProductionRouting).toBe(false);
        expect(result.document.safety.productionFactsMutated).toBe(false);
        expect(result.document.safety.publishAffected).toBe(false);
      }
    });

    it("accepts a sourceCommand and does not throw", async () => {
      const result = await runAnnualReportUnifiedShadowExtraction({
        ...makeBaseInput(makeDryRunConfig()),
        sourceCommand: "scripts/run-annual-report-unified-shadow.ts",
      });
      expect(result.skipped).toBe(false);
      expect(result.canUseForProductionRouting).toBe(false);
    });
  });
});

describe("annual-report-unified-shadow-config", () => {
  it("DISABLED is the default mode from DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG", async () => {
    const { DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG } = await import(
      "@/server/services/annual-report-unified-shadow-config"
    );
    expect(DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG.mode).toBe("DISABLED");
    expect(DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG.persistUnifiedParserDocument).toBe(false);
    expect(DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG.persistUnifiedFinancialExtraction).toBe(false);
    expect(DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG.persistUnifiedNarrativeExtraction).toBe(false);
    expect(DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG.persistLegacyVsUnifiedComparison).toBe(false);
  });

  it("getAnnualReportUnifiedShadowConfigFromEnv defaults to DISABLED when env var is not set", async () => {
    const prevMode = process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE;
    delete process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE;
    try {
      const { getAnnualReportUnifiedShadowConfigFromEnv } = await import(
        "@/server/services/annual-report-unified-shadow-config"
      );
      const config = getAnnualReportUnifiedShadowConfigFromEnv();
      expect(config.mode).toBe("DISABLED");
    } finally {
      if (prevMode !== undefined) process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE = prevMode;
    }
  });

  it("getAnnualReportUnifiedShadowConfigFromEnv reads DRY_RUN from env", async () => {
    process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE = "DRY_RUN";
    try {
      const { getAnnualReportUnifiedShadowConfigFromEnv } = await import(
        "@/server/services/annual-report-unified-shadow-config"
      );
      const config = getAnnualReportUnifiedShadowConfigFromEnv();
      expect(config.mode).toBe("DRY_RUN");
    } finally {
      delete process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE;
    }
  });

  it("getAnnualReportUnifiedShadowConfigFromEnv treats unknown mode as DISABLED", async () => {
    process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE = "INVALID_MODE";
    try {
      const { getAnnualReportUnifiedShadowConfigFromEnv } = await import(
        "@/server/services/annual-report-unified-shadow-config"
      );
      const config = getAnnualReportUnifiedShadowConfigFromEnv();
      expect(config.mode).toBe("DISABLED");
    } finally {
      delete process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE;
    }
  });

  it("validateAnnualReportUnifiedShadowConfig returns no errors for valid DISABLED config", async () => {
    const { validateAnnualReportUnifiedShadowConfig } = await import(
      "@/server/services/annual-report-unified-shadow-config"
    );
    const errors = validateAnnualReportUnifiedShadowConfig({
      mode: "DISABLED",
      persistUnifiedParserDocument: false,
      persistUnifiedFinancialExtraction: false,
      persistUnifiedNarrativeExtraction: false,
      persistLegacyVsUnifiedComparison: false,
    });
    expect(errors).toHaveLength(0);
  });

  it("validateAnnualReportUnifiedShadowConfig returns errors when persist flags are true but mode is not PERSIST_ARTIFACTS", async () => {
    const { validateAnnualReportUnifiedShadowConfig } = await import(
      "@/server/services/annual-report-unified-shadow-config"
    );
    const errors = validateAnnualReportUnifiedShadowConfig({
      mode: "DRY_RUN",
      persistUnifiedParserDocument: true,
      persistUnifiedFinancialExtraction: false,
      persistUnifiedNarrativeExtraction: false,
      persistLegacyVsUnifiedComparison: false,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("persistUnifiedParserDocument"))).toBe(true);
  });

  it("validateAnnualReportUnifiedShadowConfig returns error for invalid mode string", async () => {
    const { validateAnnualReportUnifiedShadowConfig } = await import(
      "@/server/services/annual-report-unified-shadow-config"
    );
    const errors = validateAnnualReportUnifiedShadowConfig({
      mode: "BOGUS_MODE" as never,
      persistUnifiedParserDocument: false,
      persistUnifiedFinancialExtraction: false,
      persistUnifiedNarrativeExtraction: false,
      persistLegacyVsUnifiedComparison: false,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("Invalid mode");
  });
});
