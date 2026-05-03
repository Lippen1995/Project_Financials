import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import {
  buildAnnualReportDocumentFromPages,
  buildDocumentDiagnostics,
  extractAnnualReportNarratives,
  scorePage,
  segmentAnnualReportSections,
} from "@/integrations/brreg/annual-report-financials/section-segmentation";
import { AnnualReportPage } from "@/integrations/brreg/annual-report-financials/document-model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm(text: string): string {
  return normalizeNorwegianText(text);
}

function buildPage(pageNumber: number, rawText: string): AnnualReportPage {
  return {
    pageNumber,
    rawText,
    normalizedText: norm(rawText),
    charCount: rawText.length,
  };
}

function loadFixture(filename: string): string {
  return readFileSync(
    join(process.cwd(), "test/fixtures/annual-reports/section-segmentation", filename),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// scorePage
// ---------------------------------------------------------------------------

describe("scorePage", () => {
  it("returns high score and signals for a board report page", () => {
    const text = norm("Styrets årsberetning\nVirksomhetens art og lokalisering\nFortsatt drift");
    const { score, signals } = scorePage(text, "BOARD_REPORT");
    expect(score).toBeGreaterThanOrEqual(6);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.some((s) => s.keyword === "styrets arsberetning")).toBe(true);
  });

  it("returns high score for an auditor report page", () => {
    const text = norm("Uavhengig revisors beretning\nKonklusjon\nGrunnlag for konklusjon");
    const { score, signals } = scorePage(text, "AUDITOR_REPORT");
    expect(score).toBeGreaterThanOrEqual(9);
    expect(signals.some((s) => s.keyword === "uavhengig revisors beretning")).toBe(true);
  });

  it("returns zero score for UNKNOWN kind", () => {
    const { score, signals } = scorePage(norm("anything"), "UNKNOWN");
    expect(score).toBe(0);
    expect(signals).toHaveLength(0);
  });

  it("notes page with 'revisor' mention does NOT score high for AUDITOR_REPORT", () => {
    // notes page mentions the auditor but is not the auditor report itself
    const text = norm(
      "Noter til årsregnskapet\nRegnskapsprinsipper\nRevisors honorar er kr 85 000",
    );
    const auditorScore = scorePage(text, "AUDITOR_REPORT").score;
    const notesScore = scorePage(text, "NOTES").score;
    // Notes score should beat auditor score
    expect(notesScore).toBeGreaterThan(auditorScore);
  });

  it("negative keywords reduce income statement score when board keywords present", () => {
    const text = norm("Styrets årsberetning\nResultatregnskap for perioden");
    const boardScore = scorePage(text, "BOARD_REPORT").score;
    const incomeScore = scorePage(text, "INCOME_STATEMENT").score;
    // Board keywords act as negative cue for income statement — board score should win
    expect(boardScore).toBeGreaterThan(incomeScore);
  });

  it("signals include correct offset positions", () => {
    const raw = "Styrets årsberetning og virksomhetens art";
    const text = norm(raw);
    const { signals } = scorePage(text, "BOARD_REPORT");
    for (const signal of signals) {
      const normalizedKeyword = norm(signal.keyword);
      expect(text.indexOf(normalizedKeyword)).toBe(signal.offset);
    }
  });
});

// ---------------------------------------------------------------------------
// segmentAnnualReportSections
// ---------------------------------------------------------------------------

describe("segmentAnnualReportSections", () => {
  it("returns empty array for empty input", () => {
    expect(segmentAnnualReportSections([])).toEqual([]);
  });

  it("detects a single board report section", () => {
    const pages = [
      buildPage(1, "Styrets årsberetning\nVirksomhetens art og lokalisering\nFortsatt drift"),
    ];
    const sections = segmentAnnualReportSections(pages);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.kind).toBe("BOARD_REPORT");
    expect(sections[0]?.startPage).toBe(1);
    expect(sections[0]?.endPage).toBe(1);
  });

  it("spans consecutive pages of the same section kind", () => {
    const pages = [
      buildPage(3, "Styrets årsberetning\nVirksomhetens art og lokalisering"),
      buildPage(4, "Fortsatt drift\nArbeidsmiljø og personale"),
      buildPage(5, "Fremtidsutsikter for virksomheten"),
    ];
    const sections = segmentAnnualReportSections(pages);
    const boardSection = sections.find((s) => s.kind === "BOARD_REPORT");
    expect(boardSection).toBeDefined();
    expect(boardSection!.startPage).toBe(3);
    expect(boardSection!.endPage).toBeGreaterThanOrEqual(4);
    expect(boardSection!.pages.length).toBeGreaterThanOrEqual(2);
  });

  it("transitions between sections when a stronger signal appears", () => {
    const pages = [
      buildPage(2, "Styrets årsberetning\nVirksomhetens art og lokalisering\nFortsatt drift"),
      buildPage(3, "Resultatregnskap\nDriftsinntekter\nDriftsresultat"),
      buildPage(7, "Uavhengig revisors beretning\nKonklusjon\nGrunnlag for konklusjon"),
    ];
    const sections = segmentAnnualReportSections(pages);
    const kinds = sections.map((s) => s.kind);
    expect(kinds).toContain("BOARD_REPORT");
    expect(kinds).toContain("INCOME_STATEMENT");
    expect(kinds).toContain("AUDITOR_REPORT");
    // Sections should be in document order
    const boardIdx = sections.findIndex((s) => s.kind === "BOARD_REPORT");
    const incomeIdx = sections.findIndex((s) => s.kind === "INCOME_STATEMENT");
    const auditorIdx = sections.findIndex((s) => s.kind === "AUDITOR_REPORT");
    expect(boardIdx).toBeLessThan(incomeIdx);
    expect(incomeIdx).toBeLessThan(auditorIdx);
  });

  it("notes page with revisor mention is classified as NOTES not AUDITOR_REPORT", () => {
    const pages = [
      buildPage(
        8,
        "Noter til årsregnskapet\nRegnskapsprinsipper\nNote 2 - Revisors honorar er kr 85 000",
      ),
    ];
    const sections = segmentAnnualReportSections(pages);
    expect(sections.every((s) => s.kind !== "AUDITOR_REPORT")).toBe(true);
    const notesSection = sections.find((s) => s.kind === "NOTES");
    expect(notesSection).toBeDefined();
  });

  it("weak-signal pages are absorbed into the current section", () => {
    const pages = [
      buildPage(1, "Styrets årsberetning\nVirksomhetens art og lokalisering"),
      buildPage(2, "Generell tekst uten klare nøkkelord"),
      buildPage(3, "Uavhengig revisors beretning\nKonklusjon"),
    ];
    const sections = segmentAnnualReportSections(pages);
    const boardSection = sections.find((s) => s.kind === "BOARD_REPORT");
    expect(boardSection).toBeDefined();
    // Page 2 should be absorbed into board report section
    expect(boardSection!.pages.length).toBeGreaterThanOrEqual(2);
  });

  it("each section has non-empty matchedSignals", () => {
    const pages = [
      buildPage(1, "Styrets årsberetning\nVirksomhetens art"),
      buildPage(5, "Uavhengig revisors beretning\nKonklusjon"),
    ];
    const sections = segmentAnnualReportSections(pages);
    for (const section of sections) {
      expect(section.matchedSignals.length).toBeGreaterThan(0);
    }
  });

  it("confidenceScore is between 0 and 1", () => {
    const pages = [buildPage(1, "Styrets årsberetning\nVirksomhetens art\nFortsatt drift")];
    const sections = segmentAnnualReportSections(pages);
    for (const section of sections) {
      expect(section.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(section.confidenceScore).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// extractAnnualReportNarratives
// ---------------------------------------------------------------------------

describe("extractAnnualReportNarratives", () => {
  it("returns empty array when no narrative sections present", () => {
    const pages = [buildPage(3, "Resultatregnskap\nDriftsinntekter")];
    const sections = segmentAnnualReportSections(pages);
    const narratives = extractAnnualReportNarratives(sections);
    expect(narratives).toHaveLength(0);
  });

  it("produces fullText by joining page rawText for board report", () => {
    const pages = [
      buildPage(1, "Styrets årsberetning\nVirksomhetens art og lokalisering"),
      buildPage(2, "Fortsatt drift er bekreftet av styret"),
    ];
    const sections = segmentAnnualReportSections(pages);
    const narratives = extractAnnualReportNarratives(sections);
    const boardNarrative = narratives.find((n) => n.kind === "BOARD_REPORT");
    expect(boardNarrative).toBeDefined();
    expect(boardNarrative!.fullText).toContain("Styrets årsberetning");
    expect(boardNarrative!.fullText).toContain("Fortsatt drift er bekreftet av styret");
  });

  it("detects auditor report subsections (Konklusjon, Grunnlag for)", () => {
    const rawText = [
      "Uavhengig revisors beretning",
      "Konklusjon",
      "Vi har revidert årsregnskapet.",
      "Grunnlag for konklusjon",
      "Revisjonen er utført i samsvar med ISA.",
    ].join("\n");
    const pages = [buildPage(9, rawText)];
    const sections = segmentAnnualReportSections(pages);
    const narratives = extractAnnualReportNarratives(sections);
    const auditorNarrative = narratives.find((n) => n.kind === "AUDITOR_REPORT");
    expect(auditorNarrative).toBeDefined();
    expect(auditorNarrative!.subsections.length).toBeGreaterThan(0);
    const headings = auditorNarrative!.subsections.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes("konklusjon"))).toBe(true);
  });

  it("detects board report subsections (virksomhetens art, fortsatt drift)", () => {
    const rawText = [
      "Styrets årsberetning",
      "Virksomhetens art og lokalisering",
      "Selskapet driver konsulenttjenester.",
      "Fortsatt drift",
      "Styret bekrefter forutsetningen for fortsatt drift.",
    ].join("\n");
    const pages = [buildPage(2, rawText)];
    const sections = segmentAnnualReportSections(pages);
    const narratives = extractAnnualReportNarratives(sections);
    const boardNarrative = narratives.find((n) => n.kind === "BOARD_REPORT");
    expect(boardNarrative).toBeDefined();
    expect(boardNarrative!.subsections.length).toBeGreaterThan(0);
  });

  it("each subsection has non-empty heading and text", () => {
    const rawText = [
      "Uavhengig revisors beretning",
      "Konklusjon",
      "Etter vår mening gir regnskapet et rettvisende bilde.",
      "Grunnlag for konklusjon",
      "Revisjonen ble utført i samsvar med ISA.",
    ].join("\n");
    const pages = [buildPage(10, rawText)];
    const sections = segmentAnnualReportSections(pages);
    const narratives = extractAnnualReportNarratives(sections);
    const auditorNarrative = narratives.find((n) => n.kind === "AUDITOR_REPORT");
    for (const subsection of auditorNarrative?.subsections ?? []) {
      expect(subsection.heading.length).toBeGreaterThan(0);
      expect(subsection.text.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// buildDocumentDiagnostics
// ---------------------------------------------------------------------------

describe("buildDocumentDiagnostics", () => {
  it("reports missing expected sections when none found", () => {
    const diagnostics = buildDocumentDiagnostics([], 0);
    expect(diagnostics.missingExpectedSections).toContain("BOARD_REPORT");
    expect(diagnostics.missingExpectedSections).toContain("AUDITOR_REPORT");
    expect(diagnostics.missingExpectedSections).toContain("INCOME_STATEMENT");
    expect(diagnostics.missingExpectedSections).toContain("BALANCE_SHEET");
  });

  it("does not report a section as missing when it is present", () => {
    const pages = [buildPage(1, "Styrets årsberetning\nVirksomhetens art\nFortsatt drift")];
    const sections = segmentAnnualReportSections(pages);
    const diagnostics = buildDocumentDiagnostics(sections, 1);
    expect(diagnostics.missingExpectedSections).not.toContain("BOARD_REPORT");
  });

  it("sets recommendedRouteHint to DIGITAL when financial sections found", () => {
    const pages = [buildPage(3, "Resultatregnskap\nDriftsinntekter\nDriftsresultat")];
    const sections = segmentAnnualReportSections(pages);
    const diagnostics = buildDocumentDiagnostics(sections, 5);
    expect(diagnostics.recommendedRouteHint).toBe("DIGITAL");
  });

  it("sets recommendedRouteHint to OCR when only narrative sections found", () => {
    const pages = [buildPage(1, "Styrets årsberetning\nVirksomhetens art\nFortsatt drift")];
    const sections = segmentAnnualReportSections(pages);
    const diagnostics = buildDocumentDiagnostics(sections, 3);
    expect(diagnostics.recommendedRouteHint).toBe("OCR");
  });

  it("sets recommendedRouteHint to UNKNOWN when no sections found", () => {
    const diagnostics = buildDocumentDiagnostics([], 0);
    expect(diagnostics.recommendedRouteHint).toBe("UNKNOWN");
  });

  it("sectionsFound matches sections array length", () => {
    const pages = [
      buildPage(1, "Styrets årsberetning\nVirksomhetens art"),
      buildPage(5, "Uavhengig revisors beretning\nKonklusjon"),
    ];
    const sections = segmentAnnualReportSections(pages);
    const diagnostics = buildDocumentDiagnostics(sections, 10);
    expect(diagnostics.sectionsFound).toBe(sections.length);
  });

  it("deduplicates sectionKinds", () => {
    const pages = [
      buildPage(1, "Styrets årsberetning\nVirksomhetens art"),
      buildPage(2, "Fortsatt drift er bekreftet"),
    ];
    const sections = segmentAnnualReportSections(pages);
    const diagnostics = buildDocumentDiagnostics(sections, 2);
    const kindSet = new Set(diagnostics.sectionKinds);
    expect(kindSet.size).toBe(diagnostics.sectionKinds.length);
  });
});

// ---------------------------------------------------------------------------
// buildAnnualReportDocumentFromPages — smoke tests
// ---------------------------------------------------------------------------

describe("buildAnnualReportDocumentFromPages", () => {
  it("returns a document with pages array matching input length", () => {
    const input = [
      { pageNumber: 1, text: "Styrets årsberetning", normalizedText: norm("Styrets årsberetning") },
      { pageNumber: 2, text: "Fortsatt drift", normalizedText: norm("Fortsatt drift") },
    ];
    const doc = buildAnnualReportDocumentFromPages(input);
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0]?.pageNumber).toBe(1);
    expect(doc.pages[1]?.pageNumber).toBe(2);
  });

  it("populates diagnostics with correct pageCount", () => {
    const input = Array.from({ length: 7 }, (_, i) => ({
      pageNumber: i + 1,
      text: "Generell tekst",
      normalizedText: norm("Generell tekst"),
    }));
    const doc = buildAnnualReportDocumentFromPages(input);
    expect(doc.diagnostics.pageCount).toBe(7);
  });

  it("returns empty sections and narratives for blank pages", () => {
    const input = [{ pageNumber: 1, text: "", normalizedText: "" }];
    const doc = buildAnnualReportDocumentFromPages(input);
    expect(doc.sections).toHaveLength(0);
    expect(doc.narratives).toHaveLength(0);
  });

  it("narratives array matches narrative-kind sections", () => {
    const input = [
      {
        pageNumber: 2,
        text: "Styrets årsberetning\nVirksomhetens art\nFortsatt drift",
        normalizedText: norm("Styrets årsberetning\nVirksomhetens art\nFortsatt drift"),
      },
      {
        pageNumber: 9,
        text: "Uavhengig revisors beretning\nKonklusjon\nGrunnlag for konklusjon",
        normalizedText: norm(
          "Uavhengig revisors beretning\nKonklusjon\nGrunnlag for konklusjon",
        ),
      },
    ];
    const doc = buildAnnualReportDocumentFromPages(input);
    expect(doc.narratives.length).toBe(2);
    const narrativeKinds = doc.narratives.map((n) => n.kind);
    expect(narrativeKinds).toContain("BOARD_REPORT");
    expect(narrativeKinds).toContain("AUDITOR_REPORT");
  });
});

// ---------------------------------------------------------------------------
// Fixture-based tests
// ---------------------------------------------------------------------------

describe("fixture: board-report-page.txt", () => {
  const raw = loadFixture("board-report-page.txt");

  it("scorePage gives highest score to BOARD_REPORT", () => {
    const normalized = norm(raw);
    const boardScore = scorePage(normalized, "BOARD_REPORT").score;
    const auditorScore = scorePage(normalized, "AUDITOR_REPORT").score;
    const notesScore = scorePage(normalized, "NOTES").score;
    expect(boardScore).toBeGreaterThan(auditorScore);
    expect(boardScore).toBeGreaterThan(notesScore);
  });

  it("segmentAnnualReportSections classifies page as BOARD_REPORT", () => {
    const pages = [buildPage(1, raw)];
    const sections = segmentAnnualReportSections(pages);
    expect(sections.some((s) => s.kind === "BOARD_REPORT")).toBe(true);
  });
});

describe("fixture: auditor-report-page.txt", () => {
  const raw = loadFixture("auditor-report-page.txt");

  it("scorePage gives highest score to AUDITOR_REPORT", () => {
    const normalized = norm(raw);
    const auditorScore = scorePage(normalized, "AUDITOR_REPORT").score;
    const boardScore = scorePage(normalized, "BOARD_REPORT").score;
    const notesScore = scorePage(normalized, "NOTES").score;
    expect(auditorScore).toBeGreaterThan(boardScore);
    expect(auditorScore).toBeGreaterThan(notesScore);
  });

  it("extractAnnualReportNarratives finds subsections including Konklusjon", () => {
    const pages = [buildPage(9, raw)];
    const sections = segmentAnnualReportSections(pages);
    const narratives = extractAnnualReportNarratives(sections);
    const auditorNarrative = narratives.find((n) => n.kind === "AUDITOR_REPORT");
    expect(auditorNarrative).toBeDefined();
    const headings = auditorNarrative!.subsections.map((s) => s.heading.toLowerCase());
    expect(headings.some((h) => h.includes("konklusjon"))).toBe(true);
  });
});

describe("fixture: notes-page.txt", () => {
  const raw = loadFixture("notes-page.txt");

  it("classifies as NOTES not AUDITOR_REPORT despite mentioning revisor", () => {
    const normalized = norm(raw);
    const notesScore = scorePage(normalized, "NOTES").score;
    const auditorScore = scorePage(normalized, "AUDITOR_REPORT").score;
    expect(notesScore).toBeGreaterThan(auditorScore);
  });

  it("segmentAnnualReportSections does not produce AUDITOR_REPORT for notes page", () => {
    const pages = [buildPage(8, raw)];
    const sections = segmentAnnualReportSections(pages);
    expect(sections.every((s) => s.kind !== "AUDITOR_REPORT")).toBe(true);
  });
});

describe("fixture: mixed-page.txt", () => {
  const raw = loadFixture("mixed-page.txt");

  it("mixed page does not force a new section if score is below threshold", () => {
    // precede with a board report page, then the mixed page should be absorbed
    const board = buildPage(
      1,
      "Styrets årsberetning\nVirksomhetens art og lokalisering\nFortsatt drift",
    );
    const mixed = buildPage(2, raw);
    const sections = segmentAnnualReportSections([board, mixed]);
    // The mixed page should extend the board section rather than creating a new one
    const boardSection = sections.find((s) => s.kind === "BOARD_REPORT");
    expect(boardSection).toBeDefined();
    expect(boardSection!.pages.some((p) => p.pageNumber === 2)).toBe(true);
  });
});
