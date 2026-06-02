import { describe, expect, it } from "vitest";

import { reconstructStatementRows } from "@/integrations/brreg/annual-report-financials/table-reconstruction";
import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import type {
  ExtractedLine,
  PageClassification,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";

function line(words: string[], lineIndex: number): ExtractedLine {
  const built = words.map((word, wordIndex) => ({
    text: word,
    normalizedText: normalizeNorwegianText(word),
    x: 40 + wordIndex * 120,
    y: 800 - lineIndex * 16,
    width: Math.max(8, word.length * 7),
    height: 12,
    confidence: 0.9,
    lineNumber: lineIndex,
  }));
  const text = built.map((w) => w.text).join(" ");
  return {
    text,
    normalizedText: normalizeNorwegianText(text),
    x: 40,
    y: 800 - lineIndex * 16,
    width: 400,
    height: 12,
    confidence: 0.9,
    words: built,
  };
}

function page(lines: ExtractedLine[]): PageTextLayer {
  const text = lines.map((l) => l.text).join("\n");
  return {
    pageNumber: 1,
    text,
    normalizedText: normalizeNorwegianText(text),
    lines,
    hasEmbeddedText: false,
  };
}

function balanceClassification(): PageClassification {
  return {
    pageNumber: 1,
    type: "STATUTORY_BALANCE",
    confidence: 0.9,
    unitScale: 1,
    unitScaleConfidence: 0.9,
    hasConflictingUnitSignals: false,
    statementScope: "COMPANY",
    hasExplicitScopeSignal: false,
    reportingCurrency: "NOK",
    declaredYears: [2024, 2023],
    yearHeaderYears: [2024, 2023],
    heading: "BALANSE",
    numericRowCount: 2,
    tableLike: true,
    reasons: [],
  };
}

describe("reconstructStatementRows — nil/dash value handling", () => {
  it("interprets a labeled row with a dash in the amount column as 0", () => {
    const pages = [
      page([
        line(["Beløp", "i", "NOK", "2024", "2023"], 0),
        line(["Varer", "-"], 1),
        line(["Bankinnskudd", "149", "610", "135", "755"], 2),
      ]),
    ];
    const rows = reconstructStatementRows(pages, [balanceClassification()]);

    const varer = rows.find((r) => r.normalizedLabel.includes("varer"));
    expect(varer, "the dash row should be rescued, not dropped").toBeDefined();
    expect(varer!.values.map((v) => v.value)).toContain(0);
  });

  it("does NOT turn a genuinely value-less section header into 0", () => {
    const pages = [
      page([
        line(["Beløp", "i", "NOK", "2024", "2023"], 0),
        line(["Omløpsmidler"], 1), // section header — no dash, no number
        line(["Bankinnskudd", "149", "610", "135", "755"], 2),
      ]),
    ];
    const rows = reconstructStatementRows(pages, [balanceClassification()]);

    const header = rows.find((r) => r.normalizedLabel.includes("omlopsmidler"));
    expect(header, "a value-less header must not become a 0 row").toBeUndefined();
  });
});

describe("liability maturity disambiguation", () => {
  it("routes the same 'Gjeld til kredittinstitusjoner' label to distinct keys by section", () => {
    const pages = [
      page([
        line(["Beløp", "i", "NOK", "2024", "2023"], 0),
        line(["Langsiktig", "gjeld"], 1), // section header → LONG_TERM context
        line(["Gjeld", "til", "kredittinstitusjoner", "3", "367", "800", "4", "692", "100"], 2),
        line(["Kortsiktig", "gjeld"], 3), // section header → CURRENT context
        line(["Gjeld", "til", "kredittinstitusjoner", "625", "923", "608", "784"], 4),
      ]),
    ];
    const cls = balanceClassification();
    const rows = reconstructStatementRows(pages, [cls]);

    // Both rows should be tagged with their maturity section.
    const credit = rows.filter((r) => r.normalizedLabel.includes("kredittinstitusjoner"));
    expect(credit).toHaveLength(2);
    expect(credit.map((r) => r.liabilitySection).sort()).toEqual(["CURRENT", "LONG_TERM"]);

    const mapped = mapRowsToCanonicalFacts({
      rows,
      classifications: [cls],
      filingFiscalYear: 2024,
    });
    const keys = new Set(mapped.facts.map((f) => f.metricKey));
    expect(keys.has("long_term_debt_credit_institutions" as never)).toBe(true);
    expect(keys.has("short_term_debt_credit_institutions" as never)).toBe(true);
  });
});
