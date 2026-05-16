/**
 * Annual Report Unified Shadow Extraction Service
 *
 * Runs the unified extractor (document model → financial extraction →
 * narrative extraction → legacy-vs-unified comparison) alongside the
 * primary legacy pipeline without affecting any production output.
 *
 * Safety guarantees:
 * - Never mutates production facts, routing decisions, or publish state.
 * - All outputs carry canUseForProductionRouting=false.
 * - Errors are caught and recorded; the caller's primary pipeline is unaffected.
 * - Artifact persistence only happens when mode=PERSIST_ARTIFACTS.
 * - All functions are pure or dependency-injectable for testability.
 * - No OCR, no live Brreg, no external network calls.
 */

import { logRecoverableError } from "@/lib/recoverable-error";
import { FinancialFactStatementType } from "@prisma/client";
import {
  createRawFinancialLineItems,
  type RawFinancialLineItemDraft,
  createAnnualReportNarratives,
  type AnnualReportNarrativeDraft,
} from "@/server/persistence/annual-report-ingestion-repository";
import type {
  UnifiedFinancialStatementKind,
  UnifiedUnitScale,
  UnifiedFinancialStatement,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type { CanonicalFactCandidate, PreflightResult } from "@/integrations/brreg/annual-report-financials/types";
import {
  buildUnifiedParserDocumentFromPreflightResult,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type { UnifiedParserDocument } from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import {
  extractUnifiedFinancialStatements,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type {
  UnifiedFinancialStatementExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import {
  extractUnifiedNarratives,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type {
  UnifiedNarrativeExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import {
  compareAnnualReportLegacyVsUnifiedExtraction,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import type {
  AnnualReportLegacyVsUnifiedComparisonReport,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import {
  persistUnifiedParserDocumentArtifact,
  persistUnifiedFinancialExtractionArtifact,
  persistUnifiedNarrativeExtractionArtifact,
  persistLegacyVsUnifiedComparisonArtifact,
} from "@/server/services/annual-report-unified-extraction-artifact-service";
import type {
  UnifiedExtractionArtifactResult,
} from "@/server/services/annual-report-unified-extraction-artifact-service";
import type {
  AnnualReportUnifiedShadowConfig,
} from "@/server/services/annual-report-unified-shadow-config";

// ── Input / Output types ───────────────────────────────────────────────────────

export type AnnualReportUnifiedShadowInput = {
  /** Filing identifier (for logging and artifact persistence) */
  filingId: string;
  /** Company database ID */
  companyId: string;
  /** Org number (for artifact metadata) */
  orgNumber: string;
  /** Fiscal year (for artifact metadata) */
  fiscalYear: number;
  /**
   * Preflight result from the primary pipeline — used to build the unified doc.
   * Passed through directly to buildUnifiedParserDocumentFromPreflightResult.
   */
  preflight: PreflightResult;
  /**
   * Legacy canonical facts produced by the primary pipeline.
   * Used for the legacy-vs-unified comparison step.
   */
  legacyCandidates: CanonicalFactCandidate[];
  /** Shadow mode config */
  config: AnnualReportUnifiedShadowConfig;
  /**
   * Optional source command for artifact metadata (e.g. script name or API route).
   */
  sourceCommand?: string | null;
};

export type AnnualReportUnifiedShadowStepResult<T> =
  | { ok: true; value: T; durationMs: number }
  | { ok: false; error: string; durationMs: number };

export type AnnualReportUnifiedShadowArtifactResults = {
  document: AnnualReportUnifiedShadowStepResult<UnifiedExtractionArtifactResult> | null;
  financial: AnnualReportUnifiedShadowStepResult<UnifiedExtractionArtifactResult> | null;
  narrative: AnnualReportUnifiedShadowStepResult<UnifiedExtractionArtifactResult> | null;
  comparison: AnnualReportUnifiedShadowStepResult<UnifiedExtractionArtifactResult> | null;
};

export type AnnualReportUnifiedShadowResult = {
  /**
   * Always false — this result must never influence production routing or publish.
   */
  canUseForProductionRouting: false;

  /** True if the mode was DISABLED (no extraction ran) */
  skipped: boolean;

  /** The shadow mode that was active */
  mode: AnnualReportUnifiedShadowConfig["mode"];

  /** Elapsed time for the entire shadow run (ms) */
  totalDurationMs: number;

  /** Unified parser document, or null if the step failed/was skipped */
  document: UnifiedParserDocument | null;

  /** Financial extraction result, or null if the step failed/was skipped */
  financial: UnifiedFinancialStatementExtractionResult | null;

  /** Narrative extraction result, or null if the step failed/was skipped */
  narrative: UnifiedNarrativeExtractionResult | null;

  /** Comparison report, or null if the step failed/was skipped */
  comparison: AnnualReportLegacyVsUnifiedComparisonReport | null;

  /** Per-step timing and error info */
  steps: {
    document: AnnualReportUnifiedShadowStepResult<true> | null;
    financial: AnnualReportUnifiedShadowStepResult<true> | null;
    narrative: AnnualReportUnifiedShadowStepResult<true> | null;
    comparison: AnnualReportUnifiedShadowStepResult<true> | null;
  };

  /** Artifact persistence results (null entries = not attempted) */
  artifacts: AnnualReportUnifiedShadowArtifactResults;

  /** Any warnings collected during the run */
  warnings: string[];
};

// ── Injectable dependencies (for testing) ─────────────────────────────────────

export type AnnualReportUnifiedShadowDeps = {
  persistDocument?: typeof persistUnifiedParserDocumentArtifact;
  persistFinancial?: typeof persistUnifiedFinancialExtractionArtifact;
  persistNarrative?: typeof persistUnifiedNarrativeExtractionArtifact;
  persistComparison?: typeof persistLegacyVsUnifiedComparisonArtifact;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function elapsed(start: number): number {
  return Date.now() - start;
}

function stepError(error: unknown, durationMs: number): AnnualReportUnifiedShadowStepResult<never> {
  const msg = error instanceof Error ? error.message : String(error);
  return { ok: false, error: msg, durationMs };
}

// ── Main function ──────────────────────────────────────────────────────────────

/**
 * Runs the unified extractor in shadow mode alongside the primary pipeline.
 *
 * - If config.mode === "DISABLED": returns immediately with skipped=true.
 * - If config.mode === "DRY_RUN": runs extraction in-memory, no DB writes.
 * - If config.mode === "PERSIST_ARTIFACTS": runs extraction and persists
 *   artifacts according to the per-artifact persist flags in config.
 *
 * All errors within each step are caught and recorded in the result; they do
 * not propagate to the caller.
 */
export async function runAnnualReportUnifiedShadowExtraction(
  input: AnnualReportUnifiedShadowInput,
  deps: AnnualReportUnifiedShadowDeps = {},
): Promise<AnnualReportUnifiedShadowResult> {
  const overallStart = Date.now();

  const baseResult: AnnualReportUnifiedShadowResult = {
    canUseForProductionRouting: false,
    skipped: false,
    mode: input.config.mode,
    totalDurationMs: 0,
    document: null,
    financial: null,
    narrative: null,
    comparison: null,
    steps: {
      document: null,
      financial: null,
      narrative: null,
      comparison: null,
    },
    artifacts: {
      document: null,
      financial: null,
      narrative: null,
      comparison: null,
    },
    warnings: [],
  };

  // ── DISABLED: no-op ────────────────────────────────────────────────────────

  if (input.config.mode === "DISABLED") {
    return {
      ...baseResult,
      skipped: true,
      totalDurationMs: elapsed(overallStart),
    };
  }

  const { filingId, companyId, orgNumber, fiscalYear, preflight, legacyCandidates, config, sourceCommand } = input;
  const warnings: string[] = [];

  // ── Step 1: Build unified parser document ─────────────────────────────────

  let document: UnifiedParserDocument | null = null;
  let documentStep: AnnualReportUnifiedShadowStepResult<true>;
  {
    const stepStart = Date.now();
    try {
      document = buildUnifiedParserDocumentFromPreflightResult({
        preflight,
        route: "TEXT_LAYER",
        source: {
          filingId,
          orgNumber,
          fiscalYear,
        },
        shadowOnly: true,
      });
      documentStep = { ok: true, value: true, durationMs: elapsed(stepStart) };
    } catch (err) {
      logRecoverableError(
        "annual-report-unified-shadow.buildDocument",
        err,
        { filingId, fiscalYear },
      );
      documentStep = stepError(err, elapsed(stepStart));
    }
  }

  // ── Step 2: Extract unified financial statements ───────────────────────────

  let financial: UnifiedFinancialStatementExtractionResult | null = null;
  let financialStep: AnnualReportUnifiedShadowStepResult<true> | null = null;
  if (document !== null) {
    const stepStart = Date.now();
    try {
      financial = extractUnifiedFinancialStatements(document);
      financialStep = { ok: true, value: true, durationMs: elapsed(stepStart) };
      if (financial.warnings.length > 0) {
        warnings.push(...financial.warnings.map((w) => `[financial] ${w}`));
      }
    } catch (err) {
      logRecoverableError(
        "annual-report-unified-shadow.extractFinancials",
        err,
        { filingId, fiscalYear },
      );
      financialStep = stepError(err, elapsed(stepStart));
    }
  }

  // ── Step 3: Extract unified narratives ────────────────────────────────────

  let narrative: UnifiedNarrativeExtractionResult | null = null;
  let narrativeStep: AnnualReportUnifiedShadowStepResult<true> | null = null;
  if (document !== null) {
    const stepStart = Date.now();
    try {
      narrative = extractUnifiedNarratives(document);
      narrativeStep = { ok: true, value: true, durationMs: elapsed(stepStart) };
      if (narrative.warnings.length > 0) {
        warnings.push(...narrative.warnings.map((w) => `[narrative] ${w}`));
      }
    } catch (err) {
      logRecoverableError(
        "annual-report-unified-shadow.extractNarratives",
        err,
        { filingId, fiscalYear },
      );
      narrativeStep = stepError(err, elapsed(stepStart));
    }
  }

  // ── Step 4: Legacy-vs-unified comparison ─────────────────────────────────

  let comparison: AnnualReportLegacyVsUnifiedComparisonReport | null = null;
  let comparisonStep: AnnualReportUnifiedShadowStepResult<true> | null = null;
  {
    const stepStart = Date.now();
    try {
      comparison = compareAnnualReportLegacyVsUnifiedExtraction({
        legacyCandidates,
        unifiedFinancial: financial ?? null,
        unifiedNarrative: narrative ?? null,
        meta: { filingId, orgNumber, fiscalYear },
      });
      comparisonStep = { ok: true, value: true, durationMs: elapsed(stepStart) };
    } catch (err) {
      logRecoverableError(
        "annual-report-unified-shadow.compare",
        err,
        { filingId, fiscalYear },
      );
      comparisonStep = stepError(err, elapsed(stepStart));
    }
  }

  // ── Artifact persistence (only when PERSIST_ARTIFACTS) ───────────────────

  const artifactResults: AnnualReportUnifiedShadowArtifactResults = {
    document: null,
    financial: null,
    narrative: null,
    comparison: null,
  };

  if (config.mode === "PERSIST_ARTIFACTS") {
    const doPersistDocument = deps.persistDocument ?? persistUnifiedParserDocumentArtifact;
    const doPersistFinancial = deps.persistFinancial ?? persistUnifiedFinancialExtractionArtifact;
    const doPersistNarrative = deps.persistNarrative ?? persistUnifiedNarrativeExtractionArtifact;
    const doPersistComparison = deps.persistComparison ?? persistLegacyVsUnifiedComparisonArtifact;

    if (config.persistUnifiedParserDocument && document !== null) {
      const stepStart = Date.now();
      try {
        const result = await doPersistDocument({
          document,
          sourceCommand: sourceCommand ?? null,
        });
        artifactResults.document = { ok: true, value: result, durationMs: elapsed(stepStart) };
      } catch (err) {
        logRecoverableError(
          "annual-report-unified-shadow.persistDocument",
          err,
          { filingId, fiscalYear },
        );
        artifactResults.document = stepError(err, elapsed(stepStart));
      }
    }

    if (config.persistUnifiedFinancialExtraction && financial !== null) {
      const stepStart = Date.now();
      try {
        const result = await doPersistFinancial({
          result: financial,
          sourceCommand: sourceCommand ?? null,
        });
        artifactResults.financial = { ok: true, value: result, durationMs: elapsed(stepStart) };
      } catch (err) {
        logRecoverableError(
          "annual-report-unified-shadow.persistFinancial",
          err,
          { filingId, fiscalYear },
        );
        artifactResults.financial = stepError(err, elapsed(stepStart));
      }
    }

    if (config.persistUnifiedFinancialExtraction && financial !== null) {
      try {
        const rawItems = buildRawLineItemDrafts(financial.statements);
        await createRawFinancialLineItems({
          filingId,
          companyId,
          items: rawItems,
        });
      } catch (err) {
        logRecoverableError(
          "annual-report-unified-shadow.persistRawLineItems",
          err,
          { filingId, fiscalYear },
        );
      }
    }

    if (config.persistUnifiedNarrativeExtraction && narrative !== null) {
      const stepStart = Date.now();
      try {
        const result = await doPersistNarrative({
          result: narrative,
          sourceCommand: sourceCommand ?? null,
        });
        artifactResults.narrative = { ok: true, value: result, durationMs: elapsed(stepStart) };
      } catch (err) {
        logRecoverableError(
          "annual-report-unified-shadow.persistNarrative",
          err,
          { filingId, fiscalYear },
        );
        artifactResults.narrative = stepError(err, elapsed(stepStart));
      }

      try {
        const narrativeDrafts: AnnualReportNarrativeDraft[] = narrative.sections.map((section) => ({
          fiscalYear,
          sectionKind: section.kind,
          title: section.title ?? null,
          textPreview: section.textPreview,
          fullText: section.fullText ?? section.textPreview,
          pageStart: section.pageStart ?? null,
          pageEnd: section.pageEnd ?? null,
          confidence: section.confidence,
          provenance: section.provenance,
        }));
        await createAnnualReportNarratives({
          filingId,
          companyId,
          items: narrativeDrafts,
        });
      } catch (err) {
        logRecoverableError(
          "annual-report-unified-shadow.persistNarrativeRows",
          err,
          { filingId, fiscalYear },
        );
      }
    }

    if (config.persistLegacyVsUnifiedComparison && comparison !== null) {
      const stepStart = Date.now();
      try {
        const result = await doPersistComparison({
          report: comparison,
          sourceCommand: sourceCommand ?? null,
        });
        artifactResults.comparison = { ok: true, value: result, durationMs: elapsed(stepStart) };
      } catch (err) {
        logRecoverableError(
          "annual-report-unified-shadow.persistComparison",
          err,
          { filingId, fiscalYear },
        );
        artifactResults.comparison = stepError(err, elapsed(stepStart));
      }
    }
  }

  return {
    canUseForProductionRouting: false,
    skipped: false,
    mode: config.mode,
    totalDurationMs: elapsed(overallStart),
    document,
    financial,
    narrative,
    comparison,
    steps: {
      document: documentStep!,
      financial: financialStep,
      narrative: narrativeStep,
      comparison: comparisonStep,
    },
    artifacts: artifactResults,
    warnings,
  };
}

// ── Helpers for raw line item persistence ──────────────────────────────────────

function mapStatementKind(
  kind: UnifiedFinancialStatementKind,
): FinancialFactStatementType | null {
  switch (kind) {
    case "INCOME_STATEMENT": return FinancialFactStatementType.INCOME_STATEMENT;
    case "BALANCE_SHEET": return FinancialFactStatementType.BALANCE_SHEET;
    case "CASH_FLOW_STATEMENT": return FinancialFactStatementType.CASH_FLOW;
    default: return null;
  }
}

function mapUnitScale(scale: UnifiedUnitScale): number {
  switch (scale) {
    case "THOUSANDS": return 1000;
    case "MILLIONS": return 1000000;
    default: return 1;
  }
}

function tryParseBigInt(value: string, sign: string): bigint | undefined {
  const digits = value.replace(/\s/g, "").replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  const n = BigInt(digits);
  return sign === "NEGATIVE" ? -n : n;
}

function buildRawLineItemDrafts(
  statements: UnifiedFinancialStatement[],
): RawFinancialLineItemDraft[] {
  const drafts: RawFinancialLineItemDraft[] = [];
  for (const stmt of statements) {
    const statementType = mapStatementKind(stmt.kind);
    if (!statementType) continue;
    for (let i = 0; i < stmt.lineItems.length; i++) {
      const item = stmt.lineItems[i]!;
      drafts.push({
        fiscalYear: item.year,
        statementType,
        originalLabel: item.originalLabel,
        originalValue: item.value,
        parsedValue: tryParseBigInt(item.value, item.sign),
        canonicalKey: item.canonicalKey ?? undefined,
        unitScale: mapUnitScale(item.unitScale),
        sourcePage: item.provenance.pageNumber,
        rowIndex: item.provenance.rowIndex ?? i,
        extractionRoute: item.provenance.route,
        confidence: item.confidence,
      });
    }
  }
  return drafts;
}
