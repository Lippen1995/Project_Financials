import { describe, expect, it } from "vitest";

import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { PageClassification, ReconstructedRow } from "@/integrations/brreg/annual-report-financials/types";

function buildClassification(overrides: Partial<PageClassification>): PageClassification {
  return {
    pageNumber: 1,
    type: "STATUTORY_INCOME",
    confidence: 0.95,
    unitScale: 1,
    unitScaleConfidence: 0.95,
    hasConflictingUnitSignals: false,
    declaredYears: [2024, 2023],
    yearHeaderYears: [2024, 2023],
    heading: "Resultatregnskap",
    numericRowCount: 8,
    tableLike: true,
    reasons: ["Detected statement-like table layout"],
    ...overrides,
  };
}

describe("mapRowsToCanonicalFacts", () => {
  it("normalizes OCR rows into canonical metrics without 1000x mistakes", () => {
    const classifications: PageClassification[] = [
      buildClassification({
        pageNumber: 2,
        type: "SUPPLEMENTARY_INCOME",
        unitScale: 1000,
        unitScaleConfidence: 0.98,
        reasons: ["Belop i NOK 1000"],
      }),
      buildClassification({
        pageNumber: 3,
        type: "SUPPLEMENTARY_BALANCE",
        heading: "Balanse",
        unitScale: 1000,
        unitScaleConfidence: 0.98,
        reasons: ["Belop i NOK 1000"],
      }),
    ];

    const rows: ReconstructedRow[] = [
      { pageNumber: 2, sectionType: "SUPPLEMENTARY_INCOME", unitScale: 1000, label: "Salgsinntekter", normalizedLabel: "salgsinntekter", noteReference: null, rowText: "Salgsinntekter 103097", y: 10, confidence: 0.9, values: [{ value: 103097, columnIndex: 0, x: 300 }] },
      { pageNumber: 2, sectionType: "SUPPLEMENTARY_INCOME", unitScale: 1000, label: "Driftsresultat", normalizedLabel: "driftsresultat", noteReference: null, rowText: "Driftsresultat 21210", y: 20, confidence: 0.9, values: [{ value: 21210, columnIndex: 0, x: 300 }] },
      { pageNumber: 2, sectionType: "SUPPLEMENTARY_INCOME", unitScale: 1000, label: "Årsresultat", normalizedLabel: "arsresultat", noteReference: null, rowText: "Årsresultat 18221", y: 30, confidence: 0.9, values: [{ value: 18221, columnIndex: 0, x: 300 }] },
      { pageNumber: 3, sectionType: "SUPPLEMENTARY_BALANCE", unitScale: 1000, label: "Sum eiendeler", normalizedLabel: "sum eiendeler", noteReference: null, rowText: "Sum eiendeler 92155", y: 10, confidence: 0.9, values: [{ value: 92155, columnIndex: 0, x: 300 }] },
      { pageNumber: 3, sectionType: "SUPPLEMENTARY_BALANCE", unitScale: 1000, label: "Sum egenkapital", normalizedLabel: "sum egenkapital", noteReference: null, rowText: "Sum egenkapital 36372", y: 20, confidence: 0.9, values: [{ value: 36372, columnIndex: 0, x: 300 }] },
      { pageNumber: 3, sectionType: "SUPPLEMENTARY_BALANCE", unitScale: 1000, label: "Sum gjeld", normalizedLabel: "sum gjeld", noteReference: null, rowText: "Sum gjeld 55783", y: 30, confidence: 0.9, values: [{ value: 55783, columnIndex: 0, x: 300 }] },
      { pageNumber: 3, sectionType: "SUPPLEMENTARY_BALANCE", unitScale: 1000, label: "Sum egenkapital og gjeld", normalizedLabel: "sum egenkapital og gjeld", noteReference: null, rowText: "Sum egenkapital og gjeld 92155", y: 40, confidence: 0.9, values: [{ value: 92155, columnIndex: 0, x: 300 }] },
    ];

    const result = mapRowsToCanonicalFacts({ filingFiscalYear: 2024, classifications, rows });

    expect(result.issues).toEqual([]);
    expect(result.facts.find((fact) => fact.metricKey === "revenue")?.value).toBe(103_097_000);
    expect(result.facts.find((fact) => fact.metricKey === "operating_profit")?.value).toBe(21_210_000);
    expect(result.facts.find((fact) => fact.metricKey === "net_income")?.value).toBe(18_221_000);
    expect(result.facts.find((fact) => fact.metricKey === "total_assets")?.value).toBe(92_155_000);
  });

  it("flags suspicious year-column order instead of silently swapping years", () => {
    const result = mapRowsToCanonicalFacts({
      filingFiscalYear: 2024,
      classifications: [
        buildClassification({
          pageNumber: 2,
          declaredYears: [2023, 2024],
          yearHeaderYears: [2023, 2024],
          reasons: ["Detected years in swapped order"],
        }),
      ],
      rows: [],
    });

    expect(result.issues.some((issue) => issue.ruleCode === "SUSPICIOUS_COLUMN_SWAP")).toBe(true);
  });

  it("blocks statement pages with conflicting scale signals", () => {
    const result = mapRowsToCanonicalFacts({
      filingFiscalYear: 2024,
      classifications: [
        buildClassification({
          pageNumber: 2,
          hasConflictingUnitSignals: true,
          unitScale: null,
          unitScaleConfidence: 0,
        }),
      ],
      rows: [],
    });

    expect(result.issues.some((issue) => issue.ruleCode === "SCALE_CONFLICT_ON_PAGE")).toBe(true);
    expect(result.issues.some((issue) => issue.ruleCode === "UNIT_SCALE_UNCERTAIN")).toBe(true);
  });
});
