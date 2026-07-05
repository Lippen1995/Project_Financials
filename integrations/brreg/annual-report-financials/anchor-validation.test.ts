import { describe, expect, it } from "vitest";

import {
  buildAnchorFactIssues,
  foldRowsByColumn,
  repairRowsWithAnchors,
} from "@/integrations/brreg/annual-report-financials/anchor-validation";
import type {
  CanonicalFactCandidate,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";

function row(
  label: string,
  value: number,
  overrides: Partial<ReconstructedRow> = {},
): ReconstructedRow {
  return {
    pageNumber: 2,
    sectionType: "STATUTORY_INCOME",
    unitScale: 1,
    label,
    normalizedLabel: label
      .toLowerCase()
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/æ/g, "ae"),
    noteReference: null,
    rowText: `${label} ${value}`,
    y: 0,
    confidence: 0.9,
    values: [{ value, columnIndex: 0, x: 300 }],
    ...overrides,
  } as ReconstructedRow;
}

function classification(pageNumber: number): PageClassification {
  return {
    pageNumber,
    type: "STATUTORY_INCOME",
    statementScope: "COMPANY",
  } as unknown as PageClassification;
}

describe("foldRowsByColumn", () => {
  it("verifies detail rows whose sum row ties exactly", () => {
    const rows = [
      row("Salgsinntekt", 900, { y: 1 }),
      row("Annen driftsinntekt", 100, { y: 2 }),
      row("Sum driftsinntekter", 1000, { y: 3 }),
    ];
    const { verified, matchedSums } = foldRowsByColumn(rows, 0);
    expect(verified.size).toBe(3);
    expect(matchedSums).toHaveLength(1);
  });

  it("reports a residual suspect when the sum does not tie", () => {
    const rows = [
      row("Varekostnad", 400, { y: 1 }),
      row("Lønnskostnad", 183547, { y: 2 }), // true value 1183547 — leading "1" dropped
      row("Sum driftskostnader", 1183947, { y: 3 }),
    ];
    const { suspects } = foldRowsByColumn(rows, 0);
    expect(suspects).toHaveLength(1);
    expect(suspects[0]!.residual).toBe(1000000);
  });
});

describe("repairRowsWithAnchors", () => {
  it("repairs a dropped leading digit when the sum row is anchor-confirmed", () => {
    const rows = [
      row("Varekostnad", 400, { y: 1 }),
      row("Lønnskostnad", 183547, { y: 2 }),
      row("Sum driftskostnader", 1183947, { y: 3 }),
    ];
    const result = repairRowsWithAnchors({
      rows,
      classifications: [classification(2)],
      anchors: {
        fiscalYear: 2025,
        values: { total_operating_expenses: 1183947, net_income: 55 },
      },
      filingFiscalYear: 2025,
    });
    // Only one anchor magnitude hits the page → below MIN_ANCHOR_HITS unless
    // a second value matches; add net_income to the page to anchor it.
    expect(result.stats.leadingDigitRepairs).toBe(0);

    const anchoredRows = [...rows, row("Årsresultat", 55, { y: 4 })];
    const anchored = repairRowsWithAnchors({
      rows: anchoredRows,
      classifications: [classification(2)],
      anchors: {
        fiscalYear: 2025,
        values: { total_operating_expenses: 1183947, net_income: 55 },
      },
      filingFiscalYear: 2025,
    });
    expect(anchored.stats.leadingDigitRepairs).toBe(1);
    const repaired = anchored.rows.find((r) => r.normalizedLabel === "lonnskostnad")!;
    expect(repaired.values[0]!.value).toBe(1183547);
    expect(anchored.corrections).toHaveLength(1);
    expect(anchored.corrections[0]).toMatchObject({
      kind: "leading_digit",
      oldValue: 183547,
      newValue: 1183547,
    });
  });

  it("rescales a page printed in thousands that the detector under-read", () => {
    const rows = [
      row("Salgsinntekt", 900, { y: 1 }),
      row("Sum driftsinntekter", 900, { y: 2 }),
      row("Årsresultat", 55, { y: 3 }),
    ];
    const result = repairRowsWithAnchors({
      rows,
      classifications: [classification(2)],
      anchors: {
        fiscalYear: 2025,
        values: { total_operating_income: 900000, net_income: 55000 },
      },
      filingFiscalYear: 2025,
    });
    expect(result.stats.unitScaleRepairs).toBe(1);
    const rescaled = result.rows.find((r) => r.normalizedLabel === "salgsinntekt")!;
    expect(rescaled.unitScale).toBe(1000);
  });

  it("never touches consolidated pages or mismatched fiscal years", () => {
    const rows = [row("Sum driftsinntekter", 900, { y: 1 }), row("Årsresultat", 55, { y: 2 })];
    const konsern = repairRowsWithAnchors({
      rows,
      classifications: [
        { ...classification(2), statementScope: "CONSOLIDATED" } as unknown as PageClassification,
      ],
      anchors: { fiscalYear: 2025, values: { total_operating_income: 900000, net_income: 55000 } },
      filingFiscalYear: 2025,
    });
    expect(konsern.corrections).toHaveLength(0);

    const wrongYear = repairRowsWithAnchors({
      rows,
      classifications: [classification(2)],
      anchors: { fiscalYear: 2024, values: { total_operating_income: 900 } },
      filingFiscalYear: 2025,
    });
    expect(wrongYear.corrections).toHaveLength(0);
  });
});

describe("buildAnchorFactIssues", () => {
  const fact = (metricKey: string, value: number): CanonicalFactCandidate =>
    ({
      fiscalYear: 2025,
      statementType: "INCOME_STATEMENT",
      statementScope: "COMPANY",
      metricKey,
      rawLabel: metricKey,
      normalizedLabel: metricKey,
      value,
      currency: "NOK",
      unitScale: 1,
      sourcePage: 2,
      sourceSection: "STATUTORY_INCOME",
      sourceRowText: "",
      noteReference: null,
      confidenceScore: 0.9,
      precedence: "STATUTORY_NOK",
      isDerived: false,
      rawPayload: {},
    }) as unknown as CanonicalFactCandidate;

  it("counts matches and raises ERROR issues on mismatches", () => {
    const result = buildAnchorFactIssues({
      facts: [fact("net_income", 55), fact("total_assets", 1234)],
      anchors: { fiscalYear: 2025, values: { net_income: 55, total_assets: 999 } },
      filingFiscalYear: 2025,
    });
    expect(result.matches).toBe(1);
    expect(result.mismatches).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      severity: "ERROR",
      ruleCode: "ANCHOR_VALUE_MISMATCH",
    });
  });

  it("ignores facts outside the anchor year or scope", () => {
    const konsernFact = {
      ...fact("net_income", 42),
      statementScope: "CONSOLIDATED",
    } as unknown as CanonicalFactCandidate;
    const result = buildAnchorFactIssues({
      facts: [konsernFact],
      anchors: { fiscalYear: 2025, values: { net_income: 55 } },
      filingFiscalYear: 2025,
    });
    expect(result.matches).toBe(0);
    expect(result.mismatches).toBe(0);
  });
});
