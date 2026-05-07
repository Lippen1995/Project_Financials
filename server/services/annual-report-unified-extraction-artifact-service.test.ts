import { describe, expect, it, vi } from "vitest";

import {
  persistLegacyVsUnifiedComparisonArtifact,
  persistUnifiedFinancialExtractionArtifact,
  persistUnifiedNarrativeExtractionArtifact,
  persistUnifiedParserDocumentArtifact,
} from "@/server/services/annual-report-unified-extraction-artifact-service";
import {
  PdfModelArtifactSnapshotValidationError,
} from "@/server/services/pdf-model-artifact-snapshot-service";
import {
  buildUnifiedParserDocumentFromTextLayer,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import {
  extractUnifiedNarratives,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import {
  extractUnifiedFinancialStatements,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import {
  compareAnnualReportLegacyVsUnifiedExtraction,
} from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import type { PdfModelArtifactSnapshot } from "@prisma/client";

// ── Mock create function ──────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<PdfModelArtifactSnapshot> = {}): PdfModelArtifactSnapshot {
  return {
    id: "artifact-mock-id",
    kind: "UNIFIED_PARSER_DOCUMENT" as never,
    modelId: null,
    modelVersion: null,
    modelTarget: null,
    featureSchemaVersion: null,
    fiscalYear: null,
    orgNumber: null,
    split: null,
    summary: { canUseForProductionRouting: false, shadowOnly: true },
    payload: {},
    status: "CREATED",
    sourceCommand: null,
    sourceCommitSha: null,
    createdByUserId: null,
    createdAt: new Date("2026-05-07T00:00:00.000Z"),
    updatedAt: new Date("2026-05-07T00:00:00.000Z"),
    ...overrides,
  };
}

function mockCreate(overrides: Partial<PdfModelArtifactSnapshot> = {}) {
  return vi.fn().mockResolvedValue(makeSnapshot(overrides));
}

// ── persistUnifiedParserDocumentArtifact ──────────────────────────────────────

describe("persistUnifiedParserDocumentArtifact", () => {
  it("persists a valid UnifiedParserDocument", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const create = mockCreate({ kind: "UNIFIED_PARSER_DOCUMENT" as never });

    const result = await persistUnifiedParserDocumentArtifact({ document: doc }, { create });

    expect(result.kind).toBe("UNIFIED_PARSER_DOCUMENT");
    expect(result.artifactId).toBe("artifact-mock-id");
    expect(create).toHaveBeenCalledOnce();
  });

  it("uses compact form (not full document) for storage", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const create = mockCreate();
    let capturedPayload: unknown = null;
    create.mockImplementation(async (input: { payload: unknown }) => {
      capturedPayload = input.payload;
      return makeSnapshot();
    });

    await persistUnifiedParserDocumentArtifact({ document: doc }, { create });

    // The compact doc should have version field but be a compact form
    expect(capturedPayload).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((capturedPayload as any).version).toBe("unified-parser-document-v1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((capturedPayload as any).safety?.canUseForProductionRouting).toBe(false);
  });

  it("rejects document with canUseForProductionRouting=true", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc.safety as any).canUseForProductionRouting = true;
    const create = mockCreate();

    await expect(
      persistUnifiedParserDocumentArtifact({ document: doc }, { create }),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
    expect(create).not.toHaveBeenCalled();
  });

  it("passes sourceCommand and createdByUserId to create", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const create = mockCreate();
    let captured: Record<string, unknown> = {};
    create.mockImplementation(async (input: Record<string, unknown>) => {
      captured = input;
      return makeSnapshot();
    });

    await persistUnifiedParserDocumentArtifact(
      { document: doc, sourceCommand: "test-command", createdByUserId: "user-1" },
      { create },
    );

    expect(captured.sourceCommand).toBe("test-command");
    expect(captured.createdByUserId).toBe("user-1");
  });
});

// ── persistUnifiedFinancialExtractionArtifact ─────────────────────────────────

describe("persistUnifiedFinancialExtractionArtifact", () => {
  it("persists a valid UnifiedFinancialStatementExtractionResult", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const result = extractUnifiedFinancialStatements(doc);
    const create = mockCreate({ kind: "UNIFIED_FINANCIAL_EXTRACTION" as never });

    const artifact = await persistUnifiedFinancialExtractionArtifact({ result }, { create });

    expect(artifact.kind).toBe("UNIFIED_FINANCIAL_EXTRACTION");
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects invalid result (wrong version)", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const result = extractUnifiedFinancialStatements(doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result as any).version = "wrong-version";
    const create = mockCreate();

    await expect(
      persistUnifiedFinancialExtractionArtifact({ result }, { create }),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });
});

// ── persistUnifiedNarrativeExtractionArtifact ─────────────────────────────────

describe("persistUnifiedNarrativeExtractionArtifact", () => {
  it("persists a valid UnifiedNarrativeExtractionResult", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const result = extractUnifiedNarratives(doc);
    const create = mockCreate({ kind: "UNIFIED_NARRATIVE_EXTRACTION" as never });

    const artifact = await persistUnifiedNarrativeExtractionArtifact({ result }, { create });

    expect(artifact.kind).toBe("UNIFIED_NARRATIVE_EXTRACTION");
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects invalid result (wrong version)", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const result = extractUnifiedNarratives(doc);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result as any).version = "wrong-version";
    const create = mockCreate();

    await expect(
      persistUnifiedNarrativeExtractionArtifact({ result }, { create }),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("uses compact form for storage", async () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    const result = extractUnifiedNarratives(doc);
    const create = mockCreate();
    let capturedPayload: unknown = null;
    create.mockImplementation(async (input: { payload: unknown }) => {
      capturedPayload = input.payload;
      return makeSnapshot();
    });

    await persistUnifiedNarrativeExtractionArtifact({ result }, { create });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((capturedPayload as any).version).toBe("unified-narrative-extraction-v1");
  });
});

// ── persistLegacyVsUnifiedComparisonArtifact ──────────────────────────────────

describe("persistLegacyVsUnifiedComparisonArtifact", () => {
  it("persists a valid comparison report", async () => {
    const report = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    const create = mockCreate({ kind: "LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON" as never });

    const artifact = await persistLegacyVsUnifiedComparisonArtifact({ report }, { create });

    expect(artifact.kind).toBe("LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON");
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects invalid report (wrong version)", async () => {
    const report = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (report as any).version = "wrong-version";
    const create = mockCreate();

    await expect(
      persistLegacyVsUnifiedComparisonArtifact({ report }, { create }),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });

  it("rejects report with canUseForProductionRouting=true", async () => {
    const report = compareAnnualReportLegacyVsUnifiedExtraction({ legacyCandidates: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (report.safety as any).canUseForProductionRouting = true;
    const create = mockCreate();

    await expect(
      persistLegacyVsUnifiedComparisonArtifact({ report }, { create }),
    ).rejects.toThrow(PdfModelArtifactSnapshotValidationError);
  });
});
