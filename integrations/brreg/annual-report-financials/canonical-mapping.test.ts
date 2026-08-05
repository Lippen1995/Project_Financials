import { describe, expect, it } from "vitest";

import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { findCanonicalMetricKey, MetricDefinition } from "@/server/financials/canonical-taxonomy";
import { PageClassification, ReconstructedRow } from "@/integrations/brreg/annual-report-financials/types";

function buildClassification(overrides: Partial<PageClassification>): PageClassification {
  return {
    pageNumber: 1,
    type: "STATUTORY_INCOME",
    confidence: 0.95,
    unitScale: 1,
    unitScaleConfidence: 0.95,
    hasConflictingUnitSignals: false,
    statementScope: "COMPANY",
    hasExplicitScopeSignal: false,
    reportingCurrency: "NOK",
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
  it("does not treat comprehensive income as profit for the year", () => {
    expect(
      findCanonicalMetricKey(
        "Totalresultat",
        "INCOME_STATEMENT",
        null,
      ),
    ).toBeNull();
    expect(
      findCanonicalMetricKey(
        "Profit (loss) for the year",
        "INCOME_STATEMENT",
        null,
      ),
    ).toBe("net_income");
  });

  it("prefers a specific line alias over a broad section alias prefix", () => {
    const definitions: MetricDefinition[] = [
      {
        key: "long_term_liabilities",
        statementFamily: "BALANCE_SHEET",
        aliases: ["sum langsiktig gjeld", "langsiktig gjeld"],
      },
      {
        key: "bond_loans" as MetricDefinition["key"],
        statementFamily: "BALANCE_SHEET",
        aliases: ["Obligasjonslån"],
      },
    ];

    expect(
      findCanonicalMetricKey(
        "Langsiktig gjeld Obligasjonslån",
        "BALANCE_SHEET",
        null,
        definitions,
      ),
    ).toBe("bond_loans");
  });

  it("does not let a goodwill row fall through to the longer intangible-assets alias", () => {
    const definitions: MetricDefinition[] = [
      {
        key: "intangible_assets",
        statementFamily: "BALANCE_SHEET",
        aliases: ["immaterielle eiendeler"],
      },
      {
        key: "goodwill" as MetricDefinition["key"],
        statementFamily: "BALANCE_SHEET",
        aliases: ["goodwill"],
      },
    ];

    expect(
      findCanonicalMetricKey(
        "Goodwill og andre immaterielle eiendeler",
        "BALANCE_SHEET",
        null,
        definitions,
      ),
    ).toBe("goodwill");
  });

  it("does not map after-tax ordinary result to profit-before-tax", () => {
    const definitions: MetricDefinition[] = [
      {
        key: "profit_before_tax",
        statementFamily: "INCOME_STATEMENT",
        aliases: ["ordinaert resultat", "resultat for skattekostnad"],
      },
      {
        key: "net_income",
        statementFamily: "INCOME_STATEMENT",
        aliases: ["arsresultat", "resultat etter skatt"],
      },
      {
        key: "tax_expense",
        statementFamily: "INCOME_STATEMENT",
        aliases: ["skattekostnad"],
      },
    ];

    expect(
      findCanonicalMetricKey(
        "Ordinært resultat etter skattekostnad",
        "INCOME_STATEMENT",
        null,
        definitions,
      ),
    ).toBeNull();
  });

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
