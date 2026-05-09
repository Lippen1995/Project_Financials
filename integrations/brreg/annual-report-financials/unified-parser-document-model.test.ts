import { describe, expect, it } from "vitest";

import type {
  AnnualReportPage,
  AnnualReportSection,
} from "@/integrations/brreg/annual-report-financials/document-model";
import {
  buildUnifiedParserDocumentFromPreflightResult,
  buildUnifiedParserDocumentFromShadowRouteSummary,
  buildUnifiedParserDocumentFromTextLayer,
  buildUnifiedParserDocumentSummary,
  compactUnifiedParserDocumentForArtifact,
  serializeUnifiedParserDocumentAsJson,
  validateUnifiedParserDocument,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type { PreflightResult } from "@/integrations/brreg/annual-report-financials/types";

// ---- Fixtures ---------------------------------------------------------------

function makePage(n: number, text = `Page ${n} text`): AnnualReportPage {
  return {
    pageNumber: n,
    rawText: text,
    normalizedText: text.toLowerCase(),
    charCount: text.length,
  };
}

function makeSection(
  kind: AnnualReportSection["kind"],
  startPage: number,
  endPage: number,
  pages: AnnualReportPage[],
): AnnualReportSection {
  return {
    kind,
    startPage,
    endPage,
    pages,
    confidenceScore: 0.85,
    matchedSignals: [{ keyword: "test", weight: 1, offset: 0 }],
    stopReason: null,
  };
}

// ---- buildUnifiedParserDocumentFromTextLayer --------------------------------

describe("buildUnifiedParserDocumentFromTextLayer", () => {
  it("builds a valid document from text-layer pages", () => {
    const pages = [makePage(1, "resultatregnskap inntekter 1000"), makePage(2, "balanse eiendeler")];
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages });

    expect(doc.version).toBe("unified-parser-document-v1");
    expect(doc.source.route).toBe("TEXT_LAYER");
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0].pageNumber).toBe(1);
    expect(doc.pages[0].textCharCount).toBeGreaterThan(0);
    expect(doc.pages[0].blocks).toHaveLength(1);
    expect(doc.pages[0].blocks[0].kind).toBe("TEXT");
  });

  it("sets safety flags correctly — all false except shadowOnly", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    expect(doc.safety.canUseForProductionRouting).toBe(false);
    expect(doc.safety.productionRoutingChanged).toBe(false);
    expect(doc.safety.productionFactsMutated).toBe(false);
    expect(doc.safety.publishAffected).toBe(false);
    expect(doc.safety.shadowOnly).toBe(true);
  });

  it("handles empty pages gracefully", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [] });
    expect(doc.pages).toHaveLength(0);
    expect(doc.metrics.pageCount).toBe(0);
    const { valid } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(true);
  });

  it("builds sections from section segmentation", () => {
    const pages = [makePage(1), makePage(2)];
    const sections: AnnualReportSection[] = [
      makeSection("INCOME_STATEMENT", 1, 1, [pages[0]]),
      makeSection("BALANCE_SHEET", 2, 2, [pages[1]]),
    ];
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages, sections });
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0].kind).toBe("INCOME_STATEMENT");
    expect(doc.sections[1].kind).toBe("BALANCE_SHEET");
  });

  it("creates section previews capped to safe length", () => {
    const longText = "A".repeat(10_000);
    const page = makePage(1, longText);
    const section = makeSection("BOARD_REPORT", 1, 1, [page]);
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [page], sections: [section] });
    expect(doc.sections[0].textPreview.length).toBeLessThanOrEqual(500);
    expect(doc.sections[0].normalizedTextPreview.length).toBeLessThanOrEqual(500);
  });

  it("creates stable block IDs (unique per call)", () => {
    const pages = [makePage(1), makePage(2)];
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages });
    const ids = doc.pages.flatMap((p) => p.blocks.map((b) => b.blockId));
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("detects hasTableLikeText for tabular content", () => {
    const tableText = "Label\t1 000\t2 000\nAnother\t3 000\t4 000\nThird\t5 000\t6 000";
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1, tableText)] });
    expect(doc.pages[0].hasTableLikeText).toBe(true);
  });

  it("summary counts sections/tables/pages correctly", () => {
    const pages = [makePage(1), makePage(2), makePage(3)];
    const sections: AnnualReportSection[] = [
      makeSection("INCOME_STATEMENT", 1, 1, [pages[0]]),
      makeSection("BALANCE_SHEET", 2, 3, [pages[1], pages[2]]),
    ];
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages, sections });
    const summary = buildUnifiedParserDocumentSummary(doc);
    expect(summary.pageCount).toBe(3);
    expect(summary.sectionCount).toBe(2);
    expect(summary.tableCount).toBe(0);
    expect(summary.hasFinancialStatements).toBe(true);
  });

  it("maps legacy section kinds to unified kinds correctly", () => {
    const pages = [makePage(1), makePage(2), makePage(3), makePage(4), makePage(5)];
    const sections: AnnualReportSection[] = [
      makeSection("BALANCE", 1, 1, [pages[0]]),
      makeSection("CASH_FLOW", 2, 2, [pages[1]]),
      makeSection("BOARD_REPORT", 3, 3, [pages[2]]),
      makeSection("AUDITOR_REPORT", 4, 4, [pages[3]]),
      makeSection("SIGNATURES", 5, 5, [pages[4]]),
    ];
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages, sections });
    const kinds = doc.sections.map((s) => s.kind);
    expect(kinds).toContain("BALANCE_SHEET");
    expect(kinds).toContain("CASH_FLOW_STATEMENT");
    expect(kinds).toContain("BOARD_REPORT");
    expect(kinds).toContain("AUDITOR_REPORT");
    expect(kinds).toContain("SIGNATURES");
  });

  it("summary flags hasBoardReport and hasAuditorReport correctly", () => {
    const pages = [makePage(1), makePage(2)];
    const sections: AnnualReportSection[] = [
      makeSection("BOARD_REPORT", 1, 1, [pages[0]]),
      makeSection("AUDITOR_REPORT", 2, 2, [pages[1]]),
    ];
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages, sections });
    const summary = buildUnifiedParserDocumentSummary(doc);
    expect(summary.hasBoardReport).toBe(true);
    expect(summary.hasAuditorReport).toBe(true);
    expect(summary.hasFinancialStatements).toBe(false);
  });
});

// ---- buildUnifiedParserDocumentFromShadowRouteSummary ----------------------

describe("buildUnifiedParserDocumentFromShadowRouteSummary", () => {
  it("builds a minimal valid document from shadow summary", () => {
    const doc = buildUnifiedParserDocumentFromShadowRouteSummary({
      summary: {
        route: "OCR",
        pageCount: 10,
        textCharCount: 5000,
        tableCount: 3,
        warningCount: 1,
        errorCount: 0,
      },
    });
    expect(doc.version).toBe("unified-parser-document-v1");
    expect(doc.source.route).toBe("OCR");
    expect(doc.metrics.pageCount).toBe(10);
    expect(doc.metrics.tableCount).toBe(3);
    expect(doc.pages).toHaveLength(0);
    expect(doc.sections).toHaveLength(0);
    expect(doc.safety.canUseForProductionRouting).toBe(false);
  });

  it("includes reduced-fidelity warning in the document", () => {
    const doc = buildUnifiedParserDocumentFromShadowRouteSummary({
      summary: { route: "OPENDATALOADER_LOCAL", pageCount: 5 },
    });
    expect(doc.warnings.some((w) => w.includes("shadow route summary"))).toBe(true);
  });

  it("validates successfully", () => {
    const doc = buildUnifiedParserDocumentFromShadowRouteSummary({
      summary: { route: "HYBRID", pageCount: 3 },
    });
    const { valid } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(true);
  });
});

// ---- buildUnifiedParserDocumentFromPreflightResult -------------------------

describe("buildUnifiedParserDocumentFromPreflightResult", () => {
  it("builds a valid document from preflight result", () => {
    const preflight: PreflightResult = {
      pageCount: 2,
      hasTextLayer: true,
      hasReliableTextLayer: true,
      parsedPages: [
        {
          pageNumber: 1,
          text: "Resultatregnskap 2024",
          normalizedText: "resultatregnskap 2024",
          lines: [],
          hasEmbeddedText: true,
        },
        {
          pageNumber: 2,
          text: "Balanse eiendeler",
          normalizedText: "balanse eiendeler",
          lines: [],
          hasEmbeddedText: true,
        },
      ],
    };

    const doc = buildUnifiedParserDocumentFromPreflightResult({ preflight });
    expect(doc.pages).toHaveLength(2);
    expect(doc.source.route).toBe("TEXT_LAYER");
    expect(doc.safety.canUseForProductionRouting).toBe(false);
  });
});

// ---- validateUnifiedParserDocument -----------------------------------------

describe("validateUnifiedParserDocument", () => {
  it("validates a correct document", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    const { valid, issues } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it("rejects canUseForProductionRouting=true", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    (doc.safety as Record<string, unknown>).canUseForProductionRouting = true;
    const { valid, issues } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("canUseForProductionRouting"))).toBe(true);
  });

  it("rejects invalid route", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    (doc.source as Record<string, unknown>).route = "INVALID_ROUTE";
    const { valid, issues } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("route"))).toBe(true);
  });

  it("rejects NaN in numeric fields", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    (doc.metrics as Record<string, unknown>).pageCount = NaN;
    const { valid, issues } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("non-finite"))).toBe(true);
  });

  it("rejects Infinity in numeric fields", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    (doc.metrics as Record<string, unknown>).textCharCount = Infinity;
    const { valid, issues } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(false);
  });

  it("rejects numericValue as number in table cells", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    doc.tables.push({
      tableId: "t1",
      role: "INCOME_STATEMENT",
      pageNumber: 1,
      blockIds: [],
      title: null,
      columns: [],
      rows: [
        {
          rowIndex: 0,
          label: "Revenue",
          normalizedLabel: "revenue",
          cells: [
            {
              columnIndex: 1,
              text: "1000",
              normalizedText: "1000",
              // @ts-expect-error intentional test of numeric value
              numericValue: 1000,
              confidence: null,
            },
          ],
        },
      ],
      confidence: null,
      warnings: [],
    });
    const { valid, issues } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("numericValue must be string|null"))).toBe(true);
  });

  it("preserves numericValue as string and does not reject it", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    doc.tables.push({
      tableId: "t2",
      role: "BALANCE_SHEET",
      pageNumber: 1,
      blockIds: [],
      title: null,
      columns: [],
      rows: [
        {
          rowIndex: 0,
          label: "Total assets",
          normalizedLabel: "total assets",
          cells: [
            {
              columnIndex: 1,
              text: "1234567890",
              normalizedText: "1234567890",
              numericValue: "1234567890",
              confidence: null,
            },
          ],
        },
      ],
      confidence: null,
      warnings: [],
    });
    const { valid } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(true);
  });

  it("rejects missing safety flags", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    delete (doc.safety as Record<string, unknown>).productionRoutingChanged;
    const { valid, issues } = validateUnifiedParserDocument(doc);
    // productionRoutingChanged is now undefined, which !== false
    expect(valid).toBe(false);
    expect(issues.some((i) => i.includes("productionRoutingChanged"))).toBe(true);
  });
});

// ---- compactUnifiedParserDocumentForArtifact --------------------------------

describe("compactUnifiedParserDocumentForArtifact", () => {
  it("compact artifact removes full block text (page summary only)", () => {
    const longText = "Lorem ipsum ".repeat(1000);
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1, longText)] });
    const artifact = compactUnifiedParserDocumentForArtifact(doc);

    // Full pages with block text not present
    expect((artifact as Record<string, unknown>).pages).toBeUndefined();
    expect(artifact.pageSummaries).toHaveLength(1);
    expect(artifact.pageSummaries[0].pageNumber).toBe(1);
  });

  it("compact artifact limits section text previews to 2000 chars", () => {
    const longText = "A".repeat(10_000);
    const page = makePage(1, longText);
    const section = makeSection("BOARD_REPORT", 1, 1, [page]);
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [page], sections: [section] });
    const artifact = compactUnifiedParserDocumentForArtifact(doc);
    for (const s of artifact.sectionSummaries) {
      expect(s.textPreview.length).toBeLessThanOrEqual(2000);
    }
  });

  it("compact artifact includes safety flags", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    const artifact = compactUnifiedParserDocumentForArtifact(doc);
    expect(artifact.safety.canUseForProductionRouting).toBe(false);
    expect(artifact.safety.productionRoutingChanged).toBe(false);
  });

  it("compact artifact summary includes hasFinancialStatements flag", () => {
    const pages = [makePage(1)];
    const sections: AnnualReportSection[] = [makeSection("INCOME_STATEMENT", 1, 1, [pages[0]])];
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages, sections });
    const artifact = compactUnifiedParserDocumentForArtifact(doc);
    expect(artifact.summary.hasFinancialStatements).toBe(true);
  });

  it("compact artifact table summaries omit full rows", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    doc.tables.push({
      tableId: "t1",
      role: "INCOME_STATEMENT",
      pageNumber: 1,
      blockIds: [],
      title: "Income",
      columns: [],
      rows: Array.from({ length: 50 }, (_, i) => ({
        rowIndex: i,
        label: `Row ${i}`,
        normalizedLabel: `row ${i}`,
        cells: [],
      })),
      confidence: 0.9,
      warnings: [],
    });
    const artifact = compactUnifiedParserDocumentForArtifact(doc);
    expect(artifact.tableSummaries[0].rowCount).toBe(50);
    // No full rows in artifact
    const ts = artifact.tableSummaries[0] as Record<string, unknown>;
    expect(ts.rows).toBeUndefined();
  });
});

// ---- serializeUnifiedParserDocumentAsJson ----------------------------------

describe("serializeUnifiedParserDocumentAsJson", () => {
  it("produces valid JSON that round-trips cleanly", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    const json = serializeUnifiedParserDocumentAsJson(doc);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.version).toBe("unified-parser-document-v1");
    expect(typeof json).toBe("string");
  });

  it("does not include NaN or Infinity in JSON output", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    const json = serializeUnifiedParserDocumentAsJson(doc);
    expect(json).not.toContain("NaN");
    expect(json).not.toContain("Infinity");
  });
});

// ---- Missing sections/tables handled gracefully ----------------------------

describe("missing tables and sections handled gracefully", () => {
  it("builds valid document with no sections", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({
      pages: [makePage(1)],
      sections: [],
    });
    const { valid } = validateUnifiedParserDocument(doc);
    expect(valid).toBe(true);
    expect(doc.sections).toHaveLength(0);
  });

  it("metrics correctly reflect 0 tables/sections when absent", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [makePage(1)] });
    expect(doc.metrics.tableCount).toBe(0);
    expect(doc.metrics.sectionCount).toBe(0);
  });
});
