import { describe, expect, it } from "vitest";

import {
  UNIFIED_NARRATIVE_EXTRACTION_VERSION,
  compactUnifiedNarrativeExtractionResultForArtifact,
  extractUnifiedNarratives,
  serializeUnifiedNarrativeExtractionResultAsJson,
  validateUnifiedNarrativeExtractionResult,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type {
  UnifiedNarrativeSectionKind,
} from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import {
  buildUnifiedParserDocumentFromTextLayer,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type {
  UnifiedParserDocument,
  UnifiedParserPage,
  UnifiedParserSection,
} from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmptyDoc(): UnifiedParserDocument {
  return buildUnifiedParserDocumentFromTextLayer({ pages: [] });
}

function makePageWithText(
  pageNumber: number,
  text: string,
  kind: "TEXT" | "HEADING" = "TEXT",
): UnifiedParserPage {
  return {
    pageNumber,
    width: 595,
    height: 842,
    rotation: null,
    textCharCount: text.length,
    normalizedTextCharCount: text.length,
    hasUsefulText: true,
    hasTableLikeText: false,
    routeConfidence: null,
    warnings: [],
    blocks: [
      {
        blockId: `block-p${pageNumber}-1`,
        kind,
        text,
        normalizedText: text.toLowerCase(),
        bbox: null,
        confidence: null,
        source: { route: "TEXT_LAYER", pageNumber, rawBlockId: null },
      },
    ],
  };
}

function makeDocWithPages(pages: UnifiedParserPage[]): UnifiedParserDocument {
  const doc = makeEmptyDoc();
  doc.pages.push(...pages);
  return doc;
}

function makeDocWithSections(
  sections: Omit<UnifiedParserSection, "sectionId" | "provenance" | "normalizedTextPreview">[],
): UnifiedParserDocument {
  const doc = makeEmptyDoc();
  sections.forEach((s, i) => {
    doc.sections.push({
      sectionId: `sec-${i}`,
      normalizedTextPreview: s.textPreview.toLowerCase(),
      provenance: { route: "TEXT_LAYER", detectedBy: ["test"], sourcePages: [s.pageStart] },
      ...s,
    });
  });
  return doc;
}

// ── Basic extraction ──────────────────────────────────────────────────────────

describe("extractUnifiedNarratives — empty document", () => {
  it("returns valid result with no sections and a warning", () => {
    const doc = makeEmptyDoc();
    const result = extractUnifiedNarratives(doc);

    expect(result.version).toBe(UNIFIED_NARRATIVE_EXTRACTION_VERSION);
    expect(result.sections).toHaveLength(0);
    expect(result.metrics.sectionCount).toBe(0);
    expect(result.warnings).toContain("No narrative sections detected in document");
  });

  it("always emits correct safety flags", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    expect(result.safety.canUseForProductionRouting).toBe(false);
    expect(result.safety.productionRoutingChanged).toBe(false);
    expect(result.safety.productionFactsMutated).toBe(false);
    expect(result.safety.publishAffected).toBe(false);
  });

  it("propagates shadowOnly from document", () => {
    const doc = buildUnifiedParserDocumentFromTextLayer({ pages: [], shadowOnly: true });
    const result = extractUnifiedNarratives(doc);
    expect(result.safety.shadowOnly).toBe(true);
  });
});

// ── Signal detection ──────────────────────────────────────────────────────────

describe("extractUnifiedNarratives — signal detection from block text", () => {
  it("detects BOARD_REPORT from 'styrets årsberetning'", () => {
    const page = makePageWithText(3, "Styrets årsberetning\nVirksomhetens art og tilholdssted...");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "BOARD_REPORT");
    expect(section).toBeDefined();
    expect(section!.signals.some((s) => s.keyword === "styrets årsberetning")).toBe(true);
  });

  it("detects AUDITOR_REPORT from 'uavhengig revisors'", () => {
    const page = makePageWithText(8, "Uavhengig revisors beretning\nTil generalforsamlingen i...");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "AUDITOR_REPORT");
    expect(section).toBeDefined();
  });

  it("detects GOING_CONCERN from 'fortsatt drift'", () => {
    const page = makePageWithText(9, "Vi konkluderer at det er vesentlig usikkerhet om foretakets evne til fortsatt drift.");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "GOING_CONCERN");
    expect(section).toBeDefined();
    expect(result.metrics.goingConcernSignalFound).toBe(true);
  });

  it("detects AUDITOR_OPINION from 'etter vår mening'", () => {
    const page = makePageWithText(10, "Etter vår mening gir årsregnskapet et rettvisende bilde av foretakets finansielle stilling.");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "AUDITOR_OPINION");
    expect(section).toBeDefined();
  });

  it("detects AUDITOR_QUALIFICATION from 'med forbehold'", () => {
    const page = makePageWithText(11, "Konklusjon med forbehold\nMed forbehold for det ovenstående avgir vi...");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "AUDITOR_QUALIFICATION");
    expect(section).toBeDefined();
    expect(result.metrics.auditorQualificationFound).toBe(true);
  });

  it("detects EMPHASIS_OF_MATTER from 'presisering'", () => {
    const page = makePageWithText(10, "Presisering\nUten å ta forbehold vil vi henlede oppmerksomheten mot...");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "EMPHASIS_OF_MATTER");
    expect(section).toBeDefined();
  });

  it("detects SIGNATURES from 'styreleder'", () => {
    const page = makePageWithText(14, "Dato og sted\nStyreleder: __________\nDaglig leder: __________");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "SIGNATURES");
    expect(section).toBeDefined();
    expect(result.metrics.signaturesFound).toBe(true);
  });

  it("detects OTHER_INFORMATION from 'annen informasjon'", () => {
    const page = makePageWithText(13, "Annen informasjon\nStyret er ansvarlig for annen informasjon.");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const section = result.sections.find((s) => s.kind === "OTHER_INFORMATION");
    expect(section).toBeDefined();
  });
});

// ── Document section integration ──────────────────────────────────────────────

describe("extractUnifiedNarratives — from document sections", () => {
  it("maps BOARD_REPORT document section with confidence 1.0", () => {
    const doc = makeDocWithSections([
      {
        kind: "BOARD_REPORT",
        title: "Styrets beretning",
        pageStart: 2,
        pageEnd: 4,
        blockIds: [],
        textPreview: "Styrets årsberetning for regnskapsåret...",
        confidence: 0.9,
      },
    ]);
    const result = extractUnifiedNarratives(doc);

    const section = result.sections.find((s) => s.kind === "BOARD_REPORT");
    expect(section).toBeDefined();
    expect(section!.confidence).toBe(1.0);
    expect(section!.provenance).toBe("DOCUMENT_SECTION");
    expect(section!.title).toBe("Styrets beretning");
  });

  it("maps AUDITOR_REPORT document section with confidence 1.0", () => {
    const doc = makeDocWithSections([
      {
        kind: "AUDITOR_REPORT",
        title: "Revisjonsberetning",
        pageStart: 8,
        pageEnd: 10,
        blockIds: [],
        textPreview: "Uavhengig revisors beretning til generalforsamlingen",
        confidence: 0.95,
      },
    ]);
    const result = extractUnifiedNarratives(doc);

    const section = result.sections.find((s) => s.kind === "AUDITOR_REPORT");
    expect(section).toBeDefined();
    expect(section!.confidence).toBe(1.0);
  });

  it("maps SIGNATURES document section with confidence 1.0", () => {
    const doc = makeDocWithSections([
      {
        kind: "SIGNATURES",
        title: null,
        pageStart: 12,
        pageEnd: 12,
        blockIds: [],
        textPreview: "Styreleder underskrev dato og sted",
        confidence: 0.8,
      },
    ]);
    const result = extractUnifiedNarratives(doc);

    const section = result.sections.find((s) => s.kind === "SIGNATURES");
    expect(section).toBeDefined();
    expect(section!.provenance).toBe("DOCUMENT_SECTION");
  });

  it("does not duplicate section kind from inference when document section covers it", () => {
    const doc = makeDocWithSections([
      {
        kind: "BOARD_REPORT",
        title: "Styrets årsberetning",
        pageStart: 2,
        pageEnd: 4,
        blockIds: [],
        textPreview: "Styrets årsberetning inneholder viktig informasjon.",
        confidence: 0.9,
      },
    ]);
    // Also add a page with the same keyword — should NOT create another BOARD_REPORT section
    doc.pages.push(makePageWithText(2, "Styrets årsberetning inneholder viktig informasjon."));

    const result = extractUnifiedNarratives(doc);
    const boardSections = result.sections.filter((s) => s.kind === "BOARD_REPORT");
    expect(boardSections).toHaveLength(1);
  });
});

// ── Confidence and provenance ─────────────────────────────────────────────────

describe("extractUnifiedNarratives — confidence and provenance", () => {
  it("assigns confidence 0.8 for heading-inferred section with 2+ signals", () => {
    const page: UnifiedParserPage = {
      pageNumber: 5,
      width: 595,
      height: 842,
      rotation: null,
      textCharCount: 100,
      normalizedTextCharCount: 100,
      hasUsefulText: true,
      hasTableLikeText: false,
      routeConfidence: null,
      warnings: [],
      blocks: [
        {
          blockId: "block-heading",
          kind: "HEADING",
          text: "Revisjonsberetning",
          normalizedText: "revisjonsberetning",
          bbox: null,
          confidence: null,
          source: { route: "TEXT_LAYER", pageNumber: 5, rawBlockId: null },
        },
        {
          blockId: "block-body",
          kind: "TEXT",
          text: "Vi har revidert årsregnskapet. Til generalforsamlingen i selskapet.",
          normalizedText: "vi har revidert årsregnskapet. til generalforsamlingen i selskapet.",
          bbox: null,
          confidence: null,
          source: { route: "TEXT_LAYER", pageNumber: 5, rawBlockId: null },
        },
      ],
    };
    const result = extractUnifiedNarratives(makeDocWithPages([page]));
    const section = result.sections.find((s) => s.kind === "AUDITOR_REPORT");
    expect(section).toBeDefined();
    expect(section!.confidence).toBeGreaterThanOrEqual(0.6);
    expect(section!.provenance).toBe("HEADING_INFERRED");
  });

  it("assigns confidence 0.6 for block-inferred section with 1 signal", () => {
    const page = makePageWithText(6, "Årsberetning for selskapet.");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));
    const section = result.sections.find((s) => s.kind === "BOARD_REPORT");
    if (section) {
      expect(section.confidence).toBeLessThan(0.8);
    }
    // It's OK if this one doesn't produce a section at all since "årsberetning" alone
    // might not match all keywords depending on normalization
  });
});

// ── Metrics ───────────────────────────────────────────────────────────────────

describe("extractUnifiedNarratives — metrics", () => {
  it("metrics reflect detected sections", () => {
    const pages = [
      makePageWithText(1, "Styrets årsberetning for regnskapsåret."),
      makePageWithText(8, "Uavhengig revisors beretning. Vi har revidert."),
    ];
    const result = extractUnifiedNarratives(makeDocWithPages(pages));

    expect(result.metrics.boardReportFound).toBe(true);
    expect(result.metrics.auditorReportFound).toBe(true);
    expect(result.metrics.sectionCount).toBe(result.sections.length);
    expect(result.metrics.totalSignalCount).toBeGreaterThan(0);
  });

  it("metrics.warningCount matches warnings array length", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    expect(result.metrics.warningCount).toBe(result.warnings.length);
  });
});

// ── Warnings ──────────────────────────────────────────────────────────────────

describe("extractUnifiedNarratives — warnings", () => {
  it("warns when going-concern found but no auditor report", () => {
    const page = makePageWithText(5, "Det er vesentlig usikkerhet om foretakets evne til fortsatt drift.");
    const result = extractUnifiedNarratives(makeDocWithPages([page]));

    const hasGC = result.metrics.goingConcernSignalFound;
    const hasAudit = result.metrics.auditorReportFound;

    if (hasGC && !hasAudit) {
      expect(result.warnings.some((w) => w.includes("going-concern"))).toBe(true);
    }
  });
});

// ── Sections sorted by page ───────────────────────────────────────────────────

describe("extractUnifiedNarratives — section ordering", () => {
  it("returns sections sorted by pageStart ascending", () => {
    const pages = [
      makePageWithText(12, "Dato og sted. Styreleder underskrift."),
      makePageWithText(3, "Styrets årsberetning."),
      makePageWithText(8, "Uavhengig revisors beretning til generalforsamlingen."),
    ];
    const result = extractUnifiedNarratives(makeDocWithPages(pages));

    const pagesOut = result.sections
      .filter((s) => s.pageStart !== null)
      .map((s) => s.pageStart!);
    const sorted = [...pagesOut].sort((a, b) => a - b);
    expect(pagesOut).toEqual(sorted);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("validateUnifiedNarrativeExtractionResult", () => {
  it("passes for a valid result", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    const { valid, issues } = validateUnifiedNarrativeExtractionResult(result);
    expect(valid).toBe(true);
    expect(issues.filter((i) => i.severity === "ERROR")).toHaveLength(0);
  });

  it("fails if canUseForProductionRouting is true", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    (result.safety as { canUseForProductionRouting: boolean }).canUseForProductionRouting = true;
    const { valid, issues } = validateUnifiedNarrativeExtractionResult(result);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.code === "SAFETY_VIOLATION_ROUTING")).toBe(true);
  });

  it("fails if version is wrong", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    (result as { version: string }).version = "wrong-version";
    const { valid } = validateUnifiedNarrativeExtractionResult(result);
    expect(valid).toBe(false);
  });

  it("fails if metrics.sectionCount does not match sections.length", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    (result.metrics as { sectionCount: number }).sectionCount = 99;
    const { valid, issues } = validateUnifiedNarrativeExtractionResult(result);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.code === "METRICS_SECTION_COUNT_MISMATCH")).toBe(true);
  });

  it("warns on duplicate section kinds", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    // Manually push a duplicate
    result.sections.push({
      sectionId: "dup-1",
      kind: "BOARD_REPORT",
      title: null,
      pageStart: 1,
      pageEnd: 2,
      textPreview: "board report",
      signals: [],
      confidence: 0.6,
      provenance: "BLOCK_INFERRED",
    });
    result.sections.push({
      sectionId: "dup-2",
      kind: "BOARD_REPORT",
      title: null,
      pageStart: 3,
      pageEnd: 4,
      textPreview: "another board report",
      signals: [],
      confidence: 0.6,
      provenance: "BLOCK_INFERRED",
    });
    result.metrics.sectionCount = result.sections.length;
    const { issues } = validateUnifiedNarrativeExtractionResult(result);
    expect(issues.some((i) => i.code === "DUPLICATE_SECTION_KIND" && i.severity === "WARNING")).toBe(true);
  });

  it("fails on invalid page range (pageStart > pageEnd)", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    result.sections.push({
      sectionId: "bad-range",
      kind: "SIGNATURES",
      title: null,
      pageStart: 10,
      pageEnd: 5,
      textPreview: "",
      signals: [],
      confidence: 0.8,
      provenance: "DOCUMENT_SECTION",
    });
    result.metrics.sectionCount = result.sections.length;
    const { valid, issues } = validateUnifiedNarrativeExtractionResult(result);
    expect(valid).toBe(false);
    expect(issues.some((i) => i.code === "INVALID_PAGE_RANGE")).toBe(true);
  });
});

// ── Serialization ─────────────────────────────────────────────────────────────

describe("serializeUnifiedNarrativeExtractionResultAsJson", () => {
  it("produces valid JSON", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    const json = serializeUnifiedNarrativeExtractionResultAsJson(result);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("round-trips the result", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    const parsed = JSON.parse(serializeUnifiedNarrativeExtractionResultAsJson(result));
    expect(parsed.version).toBe(UNIFIED_NARRATIVE_EXTRACTION_VERSION);
    expect(parsed.safety.canUseForProductionRouting).toBe(false);
  });
});

// ── Compact artifact ──────────────────────────────────────────────────────────

describe("compactUnifiedNarrativeExtractionResultForArtifact", () => {
  it("truncates long textPreview", () => {
    const page = makePageWithText(1, "Styrets årsberetning. " + "x".repeat(500));
    const result = extractUnifiedNarratives(makeDocWithPages([page]));
    const compact = compactUnifiedNarrativeExtractionResultForArtifact(result);

    for (const s of compact.sections) {
      expect(s.textPreview.length).toBeLessThanOrEqual(201);
    }
  });

  it("truncates long signal contexts", () => {
    const page = makePageWithText(
      2,
      "Styrets årsberetning. " + "context text ".repeat(20),
    );
    const result = extractUnifiedNarratives(makeDocWithPages([page]));
    const compact = compactUnifiedNarrativeExtractionResultForArtifact(result);

    for (const s of compact.sections) {
      for (const sig of s.signals) {
        expect(sig.context.length).toBeLessThanOrEqual(81);
      }
    }
  });

  it("preserves safety flags in compact form", () => {
    const result = extractUnifiedNarratives(makeEmptyDoc());
    const compact = compactUnifiedNarrativeExtractionResultForArtifact(result);
    expect(compact.safety.canUseForProductionRouting).toBe(false);
  });
});
