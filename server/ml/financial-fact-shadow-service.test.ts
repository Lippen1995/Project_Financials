import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CanonicalFactCandidate,
  PageClassification,
  ReconstructedRow,
} from "@/integrations/brreg/annual-report-financials/types";
import { runFinancialFactShadowComparison } from "@/server/ml/financial-fact-shadow-service";
import { predictFinancialFactMetric } from "@/server/ml/ml-inference-client";

vi.mock("@/server/ml/ml-inference-client", () => ({
  predictFinancialFactMetric: vi.fn(),
}));

function makeClassification(pageNumber: number): PageClassification {
  return {
    pageNumber,
    type: "STATUTORY_BALANCE",
    confidence: 0.9,
    unitScale: 1,
    unitScaleConfidence: 0.95,
    hasConflictingUnitSignals: false,
    statementScope: "CONSOLIDATED",
    hasExplicitScopeSignal: true,
    reportingCurrency: "NOK",
    declaredYears: [2024, 2023],
    yearHeaderYears: [2024, 2023],
    heading: "KONSERNBALANSE",
    numericRowCount: 10,
    tableLike: true,
    reasons: [],
  };
}

function makeFact(overrides: Partial<CanonicalFactCandidate> = {}): CanonicalFactCandidate {
  return {
    fiscalYear: 2024,
    statementType: "BALANCE_SHEET",
    statementScope: "CONSOLIDATED",
    metricKey: "total_equity",
    rawLabel: "Sum egenkapital",
    normalizedLabel: "sum egenkapital",
    value: 21661000000,
    currency: "NOK",
    unitScale: 1,
    sourcePage: 7,
    sourceSection: "STATUTORY_BALANCE_CONTINUATION",
    sourceRowText: "Sum egenkapital 21 661 000 000 18 325 000 000",
    noteReference: null,
    confidenceScore: 0.91,
    precedence: "STATUTORY_NOK",
    isDerived: false,
    ...overrides,
  };
}

function makeRow(overrides: Partial<ReconstructedRow> = {}): ReconstructedRow {
  return {
    pageNumber: 7,
    sectionType: "STATUTORY_BALANCE_CONTINUATION",
    unitScale: 1,
    label: "Sum egenkapital",
    normalizedLabel: "sum egenkapital",
    noteReference: null,
    rowText: "Sum egenkapital 21 661 000 000 18 325 000 000",
    y: 20,
    confidence: 0.91,
    values: [{ value: 21661000000, columnIndex: 0, x: 500 }],
    ...overrides,
  };
}

describe("financial-fact-shadow-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compares ML metric predictions against canonical mapped facts", async () => {
    vi.mocked(predictFinancialFactMetric).mockResolvedValueOnce({
      metricKey: "total_equity",
      confidence: 0.83,
      modelVersion: "v1",
    });

    const result = await runFinancialFactShadowComparison({
      facts: [makeFact()],
      classifications: [makeClassification(7)],
      rows: [
        makeRow({
          label: "SUM EIENDELER",
          normalizedLabel: "sum eiendeler",
          rowText: "SUM EIENDELER 49 876 000 000 43 792 000 000",
          y: 10,
        }),
        makeRow(),
      ],
    });

    expect(result.serviceAvailable).toBe(true);
    expect(result.comparedFacts).toBe(1);
    expect(result.agreements).toBe(1);
    expect(result.agreementRate).toBe(1);
    expect(result.rows[0]).toMatchObject({
      ruleMetricKey: "total_equity",
      mlMetricKey: "total_equity",
      agree: true,
    });
    expect(predictFinancialFactMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        proposedMetricKey: "total_equity",
        rowContext: expect.stringContaining("label=Sum egenkapital"),
      }),
    );
    expect(vi.mocked(predictFinancialFactMetric).mock.calls[0]?.[0].rowContext).toContain(
      "pageHeading=KONSERNBALANSE",
    );
    expect(vi.mocked(predictFinancialFactMetric).mock.calls[0]?.[0].rowContext).toContain(
      "nearbyRow1=SUM EIENDELER",
    );
  });

  it("fails gracefully when the inference service is unavailable", async () => {
    vi.mocked(predictFinancialFactMetric).mockResolvedValueOnce(null);

    const result = await runFinancialFactShadowComparison({
      facts: [makeFact(), makeFact({ metricKey: "total_assets", rawLabel: "SUM EIENDELER" })],
      classifications: [makeClassification(7)],
    });

    expect(result.serviceAvailable).toBe(false);
    expect(result.comparedFacts).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.skippedAsReported).toBe(0);
  });

  it("skips as-reported labels because they are handled by raw-label preservation", async () => {
    vi.mocked(predictFinancialFactMetric).mockResolvedValueOnce({
      metricKey: "total_equity",
      confidence: 0.83,
      modelVersion: "v1",
    });

    const result = await runFinancialFactShadowComparison({
      facts: [
        makeFact({
          metricKey: "as_reported_sum_egenkapital_page_9_2" as CanonicalFactCandidate["metricKey"],
        }),
        makeFact(),
      ],
      classifications: [makeClassification(7)],
      rows: [makeRow()],
    });

    expect(result.comparedFacts).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.skippedAsReported).toBe(1);
    expect(predictFinancialFactMetric).toHaveBeenCalledTimes(1);
  });
});
