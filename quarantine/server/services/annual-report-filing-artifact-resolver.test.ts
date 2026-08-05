import { describe, expect, it } from "vitest";
import { PdfModelArtifactKind, PdfModelArtifactStatus } from "@prisma/client";

import {
  resolveAnnualReportArtifactForFiling,
  resolvePdfModelArtifactForFiling,
} from "@/server/services/annual-report-filing-artifact-resolver";

function makeFiling() {
  return {
    id: "filing-1",
    fiscalYear: 2024,
    sourceDiscoveryKey: "discovery-1",
    sourceIdempotencyKey: "report-1",
    sourceDocumentHash: "hash-1",
    sourceDocumentType: "ANNUAL_REPORT",
    sourceUrl: "https://example.test/report-1.pdf",
    company: { orgNumber: "123456789" },
  };
}

describe("annual-report-filing-artifact-resolver", () => {
  it("resolves annual-report artifacts by exact filing id", () => {
    const result = resolveAnnualReportArtifactForFiling(
      makeFiling(),
      [
        {
          id: "artifact-1",
          filingId: "filing-1",
          artifactType: "PDF",
          storageKey: "filing-1.pdf",
          checksum: "checksum",
          mimeType: "application/pdf",
          metadata: {},
          createdAt: new Date("2026-05-10T00:00:00.000Z"),
        },
      ] as never,
      "PDF",
    );

    expect(result.strategy).toBe("EXACT_FILING_ID");
    expect(result.artifact?.storageKey).toBe("filing-1.pdf");
  });

  it("does not silently reuse same-org different-filing pdf model artifacts", () => {
    const filing = makeFiling();
    const result = resolvePdfModelArtifactForFiling(filing, [
      {
        id: "model-artifact-1",
        kind: PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION,
        status: PdfModelArtifactStatus.CREATED,
        modelId: null,
        modelVersion: null,
        modelTarget: null,
        featureSchemaVersion: null,
        fiscalYear: 2024,
        orgNumber: "123456789",
        split: null,
        summary: { filingId: "other-filing", orgNumber: "123456789", fiscalYear: 2024 },
        payload: {
          version: "unified-financial-statement-extraction-v1",
          generatedAt: "2026-05-10T00:00:00.000Z",
          source: { filingId: "other-filing", orgNumber: "123456789", fiscalYear: 2024 },
          statements: [],
          metrics: {},
          warnings: [],
          errors: [],
          safety: {
            canUseForProductionRouting: false,
            productionRoutingChanged: false,
            productionFactsMutated: false,
            publishAffected: false,
            shadowOnly: true,
          },
        },
        sourceCommand: null,
        sourceCommitSha: null,
        createdByUserId: null,
        createdAt: new Date("2026-05-10T00:00:00.000Z"),
        updatedAt: new Date("2026-05-10T00:00:00.000Z"),
      } as never,
      {
        id: "model-artifact-2",
        kind: PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION,
        status: PdfModelArtifactStatus.CREATED,
        modelId: null,
        modelVersion: null,
        modelTarget: null,
        featureSchemaVersion: null,
        fiscalYear: 2024,
        orgNumber: "123456789",
        split: null,
        summary: { filingId: "older-filing", orgNumber: "123456789", fiscalYear: 2024 },
        payload: {
          version: "unified-financial-statement-extraction-v1",
          generatedAt: "2026-05-10T00:00:00.000Z",
          source: { filingId: "older-filing", orgNumber: "123456789", fiscalYear: 2024 },
          statements: [],
          metrics: {},
          warnings: [],
          errors: [],
          safety: {
            canUseForProductionRouting: false,
            productionRoutingChanged: false,
            productionFactsMutated: false,
            publishAffected: false,
            shadowOnly: true,
          },
        },
        sourceCommand: null,
        sourceCommitSha: null,
        createdByUserId: null,
        createdAt: new Date("2026-05-09T00:00:00.000Z"),
        updatedAt: new Date("2026-05-09T00:00:00.000Z"),
      } as never,
    ]);

    expect(result.artifact).toBeNull();
    expect(result.strategy).toBe("AMBIGUOUS");
  });

  it("allows singleton org/year fallback with diagnostics", () => {
    const filing = makeFiling();
    const result = resolvePdfModelArtifactForFiling(filing, [
      {
        id: "model-artifact-1",
        kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
        status: PdfModelArtifactStatus.CREATED,
        modelId: null,
        modelVersion: null,
        modelTarget: null,
        featureSchemaVersion: null,
        fiscalYear: 2024,
        orgNumber: "123456789",
        split: null,
        summary: { orgNumber: "123456789", fiscalYear: 2024 },
        payload: {
          version: "unified-extraction-confidence-gate-v1",
          generatedAt: "2026-05-10T00:00:00.000Z",
          meta: { orgNumber: "123456789", fiscalYear: 2024 },
          checks: [],
          overallVerdict: "INSUFFICIENT_DATA",
          passCount: 0,
          warnCount: 0,
          failCount: 0,
          insufficientDataCount: 1,
          safety: {
            canUseForProductionRouting: false,
            productionRoutingChanged: false,
            productionFactsMutated: false,
            publishAffected: false,
          },
        },
        sourceCommand: null,
        sourceCommitSha: null,
        createdByUserId: null,
        createdAt: new Date("2026-05-10T00:00:00.000Z"),
        updatedAt: new Date("2026-05-10T00:00:00.000Z"),
      } as never,
    ]);

    expect(result.artifact?.id).toBe("model-artifact-1");
    expect(result.strategy).toBe("ORG_FISCAL_YEAR_SAFE_FALLBACK");
    expect(result.diagnostics[0]?.message).toContain("singleton fallback");
  });
});
