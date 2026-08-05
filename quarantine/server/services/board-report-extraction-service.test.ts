import { describe, expect, it, vi } from "vitest";

import { extractBoardReport } from "@/integrations/brreg/annual-report-financials/board-report-extractor";
import type { UnifiedParserDocument } from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import { BoardReportExtractionService } from "@/server/services/board-report-extraction-service";

function unifiedDocument(): UnifiedParserDocument {
  const text = [
    "Styrets arsberetning",
    "Virksomhetens art",
    "Virksomheten drives i Norge og styret beskriver utviklingen i perioden.",
    "Fortsatt drift",
    "Styret legger fortsatt drift til grunn for arsregnskapet.",
    "Resultatregnskap",
    "Driftsinntekter 1000",
  ].join("\n");
  return {
    version: "unified-parser-document-v1",
    generatedAt: "2026-07-14T10:00:00.000Z",
    source: {
      route: "TEXT_LAYER",
      documentEngine: "pdfjs",
      parserVersion: "parser-v1",
      filingId: "filing-1",
      extractionRunId: null,
      orgNumber: "974760673",
      fiscalYear: 2025,
    },
    safety: {
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
      canUseForProductionRouting: false,
    },
    metrics: {
      pageCount: 1,
      processedPageCount: 1,
      textCharCount: text.length,
      normalizedTextCharCount: text.length,
      tableCount: 0,
      sectionCount: 0,
      warningCount: 0,
      errorCount: 0,
    },
    pages: [
      {
        pageNumber: 1,
        width: null,
        height: null,
        rotation: null,
        textCharCount: text.length,
        normalizedTextCharCount: text.length,
        hasUsefulText: true,
        hasTableLikeText: false,
        routeConfidence: 0.99,
        warnings: [],
        blocks: [
          {
            blockId: "p1-b1",
            kind: "TEXT",
            text,
            normalizedText: text.toLowerCase(),
            bbox: null,
            confidence: 0.99,
            source: { route: "TEXT_LAYER", pageNumber: 1, rawBlockId: null },
          },
        ],
      },
    ],
    sections: [],
    tables: [],
    warnings: [],
    errors: [],
  };
}

describe("BoardReportExtractionService", () => {
  it("persists and publishes a gate-passing extraction from an official filing PDF", async () => {
    const persistResult = vi.fn(async () => ({ id: "extraction-1" }));
    const persistArtifacts = vi.fn(async () => undefined);
    const publish = vi.fn(async () => undefined);
    const service = new BoardReportExtractionService({
      loadFiling: vi.fn(async () => ({
        id: "filing-1",
        companyId: "company-1",
        fiscalYear: 2025,
        sourceSystem: "BRREG",
        sourceUrl: "https://data.brreg.no/report.pdf",
        sourceDocumentType: "ANNUAL_REPORT_PDF",
        company: { id: "company-1", orgNumber: "974760673", name: "Brreg" },
      })),
      loadOfficialPdf: vi.fn(async () => ({
        buffer: Buffer.from("%PDF-test"),
        sourceDocumentHash: "a".repeat(64),
        fetchedAt: new Date("2026-07-14T09:00:00.000Z"),
      })),
      buildDocument: vi.fn(async () => unifiedDocument()),
      extract: extractBoardReport,
      persistResult,
      persistArtifacts,
      publish,
    });

    const outcome = await service.extractForFiling("filing-1", { publish: true });

    expect(outcome.result.status).toBe("EXTRACTED");
    expect(outcome.result.extractorVersion).toBe(
      "board-report-extraction-v4:parser-v1",
    );
    expect(outcome.result.text).not.toContain("Resultatregnskap");
    expect(outcome.extractionId).toBe("extraction-1");
    expect(persistResult).toHaveBeenCalledOnce();
    expect(persistArtifacts).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith("extraction-1", {
      minimumConfidenceExclusive: 0,
    });
  });

  it("does not publish automatically when publication is not explicitly requested", async () => {
    const publish = vi.fn(async () => undefined);
    const service = new BoardReportExtractionService({
      loadFiling: vi.fn(async () => ({
        id: "filing-1",
        companyId: "company-1",
        fiscalYear: 2025,
        sourceSystem: "BRREG",
        sourceUrl: "https://data.brreg.no/report.pdf",
        sourceDocumentType: "ANNUAL_REPORT_PDF",
        company: { id: "company-1", orgNumber: "974760673", name: "Brreg" },
      })),
      loadOfficialPdf: vi.fn(async () => ({
        buffer: Buffer.from("%PDF-test"),
        sourceDocumentHash: "a".repeat(64),
        fetchedAt: new Date("2026-07-14T09:00:00.000Z"),
      })),
      buildDocument: vi.fn(async () => unifiedDocument()),
      extract: extractBoardReport,
      persistResult: vi.fn(async () => ({ id: "extraction-1" })),
      persistArtifacts: vi.fn(async () => undefined),
      publish,
    });

    const outcome = await service.extractForFiling("filing-1");

    expect(outcome.result.status).toBe("EXTRACTED");
    expect(outcome.published).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("withholds an otherwise valid extraction when the parser route is not publish-eligible", async () => {
    const publish = vi.fn(async () => undefined);
    const service = new BoardReportExtractionService({
      loadFiling: vi.fn(async () => ({
        id: "filing-1",
        companyId: "company-1",
        fiscalYear: 2025,
        sourceSystem: "BRREG",
        sourceUrl: "https://data.brreg.no/report.pdf",
        sourceDocumentType: "ANNUAL_REPORT_PDF",
        company: { id: "company-1", orgNumber: "974760673", name: "Brreg" },
      })),
      loadOfficialPdf: vi.fn(async () => ({
        buffer: Buffer.from("%PDF-test"),
        sourceDocumentHash: "a".repeat(64),
        fetchedAt: new Date("2026-07-14T09:00:00.000Z"),
      })),
      buildDocument: vi.fn(async () => ({
        document: unifiedDocument(),
        autoPublishEligible: false,
        warnings: ["OCR review is required."],
      })),
      extract: extractBoardReport,
      persistResult: vi.fn(async () => ({ id: "extraction-1" })),
      persistArtifacts: vi.fn(async () => undefined),
      publish,
    });

    const outcome = await service.extractForFiling("filing-1");

    expect(outcome.result.status).toBe("MANUAL_REVIEW");
    expect(outcome.result.warnings).toContainEqual(
      expect.objectContaining({ code: "UNRELIABLE_TEXT_LAYER" }),
    );
    expect(outcome.published).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes OCR only when explicitly enabled above the strict confidence threshold", async () => {
    const publish = vi.fn(async () => undefined);
    const document = unifiedDocument();
    document.source.route = "OCR";
    const service = new BoardReportExtractionService({
      loadFiling: vi.fn(async () => ({
        id: "filing-1",
        companyId: "company-1",
        fiscalYear: 2025,
        sourceSystem: "BRREG",
        sourceUrl: "https://data.brreg.no/report.pdf",
        sourceDocumentType: "ANNUAL_REPORT_PDF",
        company: { id: "company-1", orgNumber: "974760673", name: "Brreg" },
      })),
      loadOfficialPdf: vi.fn(async () => ({
        buffer: Buffer.from("%PDF-test"),
        sourceDocumentHash: "a".repeat(64),
        fetchedAt: new Date("2026-07-14T09:00:00.000Z"),
      })),
      buildDocument: vi.fn(async () => ({
        document,
        autoPublishEligible: false,
        warnings: ["OCR review is required."],
      })),
      extract: vi.fn((input, source) => ({
        ...extractBoardReport(input, source),
        status: "EXTRACTED" as const,
        confidence: 0.91,
      })),
      persistResult: vi.fn(async () => ({ id: "extraction-1" })),
      persistArtifacts: vi.fn(async () => undefined),
      publish,
    });

    const outcome = await service.extractForFiling("filing-1", {
      publish: true,
      allowOcrAutoPublish: true,
      publishMinConfidence: 0.9,
    });

    expect(outcome.result.status).toBe("EXTRACTED");
    expect(outcome.published).toBe(true);
    expect(publish).toHaveBeenCalledWith("extraction-1", {
      minimumConfidenceExclusive: 0.9,
    });
  });

  it("withholds OCR at exactly the strict confidence threshold", async () => {
    const publish = vi.fn(async () => undefined);
    const document = unifiedDocument();
    document.source.route = "OCR";
    const service = new BoardReportExtractionService({
      loadFiling: vi.fn(async () => ({
        id: "filing-1",
        companyId: "company-1",
        fiscalYear: 2025,
        sourceSystem: "BRREG",
        sourceUrl: "https://data.brreg.no/report.pdf",
        sourceDocumentType: "ANNUAL_REPORT_PDF",
        company: { id: "company-1", orgNumber: "974760673", name: "Brreg" },
      })),
      loadOfficialPdf: vi.fn(async () => ({
        buffer: Buffer.from("%PDF-test"),
        sourceDocumentHash: "a".repeat(64),
        fetchedAt: new Date("2026-07-14T09:00:00.000Z"),
      })),
      buildDocument: vi.fn(async () => ({
        document,
        autoPublishEligible: false,
        warnings: ["OCR review is required."],
      })),
      extract: vi.fn((input, source) => ({
        ...extractBoardReport(input, source),
        status: "EXTRACTED" as const,
        confidence: 0.9,
      })),
      persistResult: vi.fn(async () => ({ id: "extraction-1" })),
      persistArtifacts: vi.fn(async () => undefined),
      publish,
    });

    const outcome = await service.extractForFiling("filing-1", {
      publish: true,
      allowOcrAutoPublish: true,
      publishMinConfidence: 0.9,
    });

    expect(outcome.result.status).toBe("MANUAL_REVIEW");
    expect(outcome.published).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it("resolves an organization number and fiscal year to an official filing", async () => {
    const findFilingId = vi.fn(async () => "filing-1");
    const loadFiling = vi.fn(async () => ({
      id: "filing-1",
      companyId: "company-1",
      fiscalYear: 2025,
      sourceSystem: "BRREG",
      sourceUrl: "https://data.brreg.no/report.pdf",
      sourceDocumentType: "ANNUAL_REPORT_PDF",
      company: { id: "company-1", orgNumber: "974760673", name: "Brreg" },
    }));
    const service = new BoardReportExtractionService({
      findFilingId,
      loadFiling,
      loadOfficialPdf: vi.fn(async () => ({
        buffer: Buffer.from("%PDF-test"),
        sourceDocumentHash: "a".repeat(64),
        fetchedAt: new Date("2026-07-14T09:00:00.000Z"),
      })),
      buildDocument: vi.fn(async () => unifiedDocument()),
      extract: extractBoardReport,
      persistResult: vi.fn(async () => ({ id: "extraction-1" })),
      persistArtifacts: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
    });

    const outcome = await service.extractForCompanyYear("974 760 673", 2025, {
      persist: false,
    });

    expect(findFilingId).toHaveBeenCalledWith("974760673", 2025);
    expect(loadFiling).toHaveBeenCalledWith("filing-1");
    expect(outcome.result.status).toBe("EXTRACTED");
  });

  it("rejects an organization number with an invalid Mod-11 checksum", async () => {
    const findFilingId = vi.fn(async () => "filing-1");
    const service = new BoardReportExtractionService({
      findFilingId,
      loadFiling: vi.fn(),
      loadOfficialPdf: vi.fn(),
      buildDocument: vi.fn(),
      extract: extractBoardReport,
      persistResult: vi.fn(),
      persistArtifacts: vi.fn(),
      publish: vi.fn(),
    });

    await expect(service.extractForCompanyYear("974760674", 2025)).rejects.toThrow(
      "valid Norwegian organization number",
    );
    expect(findFilingId).not.toHaveBeenCalled();
  });
});
