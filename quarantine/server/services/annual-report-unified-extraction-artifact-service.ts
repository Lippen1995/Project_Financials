/**
 * Annual Report Unified Extraction Artifact Service
 *
 * Persists unified extraction artifacts (UnifiedParserDocument,
 * UnifiedFinancialStatementExtractionResult, UnifiedNarrativeExtractionResult,
 * AnnualReportLegacyVsUnifiedComparisonReport) as PdfModelArtifactSnapshots.
 *
 * Design:
 * - All artifacts are shadow-only; canUseForProductionRouting is always false.
 * - Compact forms are persisted to avoid storing unbounded raw text.
 * - Validation is enforced before persisting.
 * - All functions accept optional deps for unit-testable injection.
 * - No production routing, fact, or publish behavior changes.
 */

import type { PdfModelArtifactSnapshot } from "@prisma/client";

import { createPdfModelArtifactSnapshot } from "@/server/persistence/pdf-model-artifact-snapshot-repository";
import {
  compactUnifiedParserDocumentForArtifact,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type { UnifiedParserDocument } from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import {
  compactUnifiedNarrativeExtractionResultForArtifact,
  validateUnifiedNarrativeExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type { UnifiedNarrativeExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import {
  validateUnifiedFinancialStatementExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type { UnifiedFinancialStatementExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import {
  validateLegacyVsUnifiedComparisonReport,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import type { AnnualReportLegacyVsUnifiedComparisonReport } from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import {
  validateUnifiedExtractionConfidenceGateReport,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import type { UnifiedExtractionConfidenceGateReport } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import {
  persistPdfModelArtifactSnapshot,
  PdfModelArtifactSnapshotValidationError,
} from "@/server/services/pdf-model-artifact-snapshot-service";

// ── Shared types ──────────────────────────────────────────────────────────────

export type UnifiedExtractionArtifactResult = {
  artifactId: string;
  kind: string;
  createdAt: Date;
  summary: Record<string, unknown>;
};

type PersistDeps = {
  create?: typeof createPdfModelArtifactSnapshot;
};

// ── Persist UnifiedParserDocument ─────────────────────────────────────────────

export type PersistUnifiedParserDocumentInput = {
  document: UnifiedParserDocument;
  sourceCommand?: string | null;
  sourceCommitSha?: string | null;
  createdByUserId?: string | null;
};

/**
 * Validates and persists a UnifiedParserDocument as a UNIFIED_PARSER_DOCUMENT
 * artifact snapshot. Stores a compact form (bounded text previews).
 *
 * Safety: canUseForProductionRouting is always false on the persisted payload.
 */
export async function persistUnifiedParserDocumentArtifact(
  input: PersistUnifiedParserDocumentInput,
  deps?: PersistDeps,
): Promise<UnifiedExtractionArtifactResult> {
  const { document } = input;

  // Safety check
  if (document.safety.canUseForProductionRouting !== false) {
    throw new PdfModelArtifactSnapshotValidationError(
      "Cannot persist UnifiedParserDocument with canUseForProductionRouting !== false",
    );
  }

  // Use compact form to avoid storing unbounded raw text
  const compact = compactUnifiedParserDocumentForArtifact(document);

  const snapshot = await persistPdfModelArtifactSnapshot(
    {
      kind: "UNIFIED_PARSER_DOCUMENT",
      payload: compact,
      fiscalYear: document.source.fiscalYear ?? null,
      orgNumber: document.source.orgNumber ?? null,
      sourceCommand: input.sourceCommand ?? null,
      sourceCommitSha: input.sourceCommitSha ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    deps,
  );

  return {
    artifactId: snapshot.id,
    kind: "UNIFIED_PARSER_DOCUMENT",
    createdAt: snapshot.createdAt,
    summary: snapshot.summary as Record<string, unknown>,
  };
}

// ── Persist UnifiedFinancialStatementExtractionResult ─────────────────────────

export type PersistUnifiedFinancialExtractionInput = {
  result: UnifiedFinancialStatementExtractionResult;
  sourceCommand?: string | null;
  sourceCommitSha?: string | null;
  createdByUserId?: string | null;
};

/**
 * Validates and persists a UnifiedFinancialStatementExtractionResult as a
 * UNIFIED_FINANCIAL_EXTRACTION artifact snapshot.
 */
export async function persistUnifiedFinancialExtractionArtifact(
  input: PersistUnifiedFinancialExtractionInput,
  deps?: PersistDeps,
): Promise<UnifiedExtractionArtifactResult> {
  const { result } = input;

  // Validate before persisting (issues is string[])
  const { valid, issues } = validateUnifiedFinancialStatementExtractionResult(result);
  if (!valid) {
    throw new PdfModelArtifactSnapshotValidationError(
      `UnifiedFinancialStatementExtractionResult validation failed: ${issues.join("; ")}`,
    );
  }

  const snapshot = await persistPdfModelArtifactSnapshot(
    {
      kind: "UNIFIED_FINANCIAL_EXTRACTION",
      payload: result,
      fiscalYear: result.source.fiscalYear ?? null,
      orgNumber: result.source.orgNumber ?? null,
      sourceCommand: input.sourceCommand ?? null,
      sourceCommitSha: input.sourceCommitSha ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    deps,
  );

  return {
    artifactId: snapshot.id,
    kind: "UNIFIED_FINANCIAL_EXTRACTION",
    createdAt: snapshot.createdAt,
    summary: snapshot.summary as Record<string, unknown>,
  };
}

// ── Persist UnifiedNarrativeExtractionResult ──────────────────────────────────

export type PersistUnifiedNarrativeExtractionInput = {
  result: UnifiedNarrativeExtractionResult;
  sourceCommand?: string | null;
  sourceCommitSha?: string | null;
  createdByUserId?: string | null;
};

/**
 * Validates and persists a UnifiedNarrativeExtractionResult as a
 * UNIFIED_NARRATIVE_EXTRACTION artifact snapshot. Stores a compact form.
 */
export async function persistUnifiedNarrativeExtractionArtifact(
  input: PersistUnifiedNarrativeExtractionInput,
  deps?: PersistDeps,
): Promise<UnifiedExtractionArtifactResult> {
  const { result } = input;

  // Validate before persisting
  const { valid, issues } = validateUnifiedNarrativeExtractionResult(result);
  if (!valid) {
    throw new PdfModelArtifactSnapshotValidationError(
      `UnifiedNarrativeExtractionResult validation failed: ${issues.map((i) => i.message).join("; ")}`,
    );
  }

  // Use compact form
  const compact = compactUnifiedNarrativeExtractionResultForArtifact(result);

  const snapshot = await persistPdfModelArtifactSnapshot(
    {
      kind: "UNIFIED_NARRATIVE_EXTRACTION",
      payload: compact,
      fiscalYear: result.source.fiscalYear ?? null,
      orgNumber: result.source.orgNumber ?? null,
      sourceCommand: input.sourceCommand ?? null,
      sourceCommitSha: input.sourceCommitSha ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    deps,
  );

  return {
    artifactId: snapshot.id,
    kind: "UNIFIED_NARRATIVE_EXTRACTION",
    createdAt: snapshot.createdAt,
    summary: snapshot.summary as Record<string, unknown>,
  };
}

// ── Persist AnnualReportLegacyVsUnifiedComparisonReport ───────────────────────

export type PersistLegacyVsUnifiedComparisonInput = {
  report: AnnualReportLegacyVsUnifiedComparisonReport;
  sourceCommand?: string | null;
  sourceCommitSha?: string | null;
  createdByUserId?: string | null;
};

/**
 * Validates and persists an AnnualReportLegacyVsUnifiedComparisonReport as a
 * LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON artifact snapshot.
 */
export async function persistLegacyVsUnifiedComparisonArtifact(
  input: PersistLegacyVsUnifiedComparisonInput,
  deps?: PersistDeps,
): Promise<UnifiedExtractionArtifactResult> {
  const { report } = input;

  // Validate before persisting
  const { valid, issues } = validateLegacyVsUnifiedComparisonReport(report);
  if (!valid) {
    throw new PdfModelArtifactSnapshotValidationError(
      `AnnualReportLegacyVsUnifiedComparisonReport validation failed: ${issues.map((i) => i.message).join("; ")}`,
    );
  }

  const snapshot = await persistPdfModelArtifactSnapshot(
    {
      kind: "LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON",
      payload: report,
      fiscalYear: report.source.fiscalYear ?? null,
      orgNumber: report.source.orgNumber ?? null,
      sourceCommand: input.sourceCommand ?? null,
      sourceCommitSha: input.sourceCommitSha ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    deps,
  );

  return {
    artifactId: snapshot.id,
    kind: "LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON",
    createdAt: snapshot.createdAt,
    summary: snapshot.summary as Record<string, unknown>,
  };
}

// ── Persist UnifiedExtractionConfidenceGateReport ─────────────────────────────

export type PersistUnifiedExtractionConfidenceGateInput = {
  report: UnifiedExtractionConfidenceGateReport;
  sourceCommand?: string | null;
  sourceCommitSha?: string | null;
  createdByUserId?: string | null;
};

/**
 * Validates and persists a UnifiedExtractionConfidenceGateReport as a
 * UNIFIED_EXTRACTION_CONFIDENCE_GATE artifact snapshot.
 *
 * Safety: canUseForProductionRouting is always false on the persisted payload.
 */
export async function persistUnifiedExtractionConfidenceGateArtifact(
  input: PersistUnifiedExtractionConfidenceGateInput,
  deps?: PersistDeps,
): Promise<UnifiedExtractionArtifactResult> {
  const { report } = input;

  // Safety check
  if (report.safety.canUseForProductionRouting !== false) {
    throw new PdfModelArtifactSnapshotValidationError(
      "Cannot persist UnifiedExtractionConfidenceGateReport with canUseForProductionRouting !== false",
    );
  }

  // Validate before persisting
  const issues = validateUnifiedExtractionConfidenceGateReport(report);
  if (issues.length > 0) {
    throw new PdfModelArtifactSnapshotValidationError(
      `UnifiedExtractionConfidenceGateReport validation failed: ${issues.map((i) => i.message).join("; ")}`,
    );
  }

  const snapshot = await persistPdfModelArtifactSnapshot(
    {
      kind: "UNIFIED_EXTRACTION_CONFIDENCE_GATE",
      payload: report,
      fiscalYear: report.meta.fiscalYear ?? null,
      orgNumber: report.meta.orgNumber ?? null,
      sourceCommand: input.sourceCommand ?? null,
      sourceCommitSha: input.sourceCommitSha ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    deps,
  );

  return {
    artifactId: snapshot.id,
    kind: "UNIFIED_EXTRACTION_CONFIDENCE_GATE",
    createdAt: snapshot.createdAt,
    summary: snapshot.summary as Record<string, unknown>,
  };
}
