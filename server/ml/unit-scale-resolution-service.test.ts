import { beforeEach, describe, expect, it, vi } from "vitest";

const { predictMock } = vi.hoisted(() => ({ predictMock: vi.fn() }));

vi.mock("@/server/ml/ml-inference-client", () => ({
  predictUnitScale: predictMock,
}));

import { resolveUnitScaleClassifications } from "@/server/ml/unit-scale-resolution-service";
import type {
  AnnualReportParsedInputPage,
  PageClassification,
} from "@/integrations/brreg/annual-report-financials/types";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

function page(pageNumber: number, lines: string[]): AnnualReportParsedInputPage {
  return {
    pageNumber,
    text: lines.join("\n"),
    normalizedText: normalizeNorwegianText(lines.join(" ")),
    hasEmbeddedText: true,
    lines: lines.map((text, index) => ({
      text,
      normalizedText: normalizeNorwegianText(text),
      x: 0,
      y: index * 16,
      width: Math.max(40, text.length * 8),
      height: 12,
      confidence: 0.95,
      words: [],
    })),
  };
}

function classification(overrides: Partial<PageClassification>): PageClassification {
  return {
    pageNumber: 2,
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
    numericRowCount: 5,
    tableLike: true,
    reasons: ["rule"],
    ...overrides,
  };
}

describe("resolveUnitScaleClassifications", () => {
  beforeEach(() => {
    predictMock.mockReset();
  });

  it("uses ML to resolve missing page unit scale before row reconstruction", async () => {
    predictMock.mockResolvedValueOnce({
      unitScale: 1000,
      confidence: 0.72,
      modelVersion: "v2",
    });

    const result = await resolveUnitScaleClassifications({
      mode: "apply",
      pages: [
        page(2, [
          "Resultatregnskap",
          "2024 2023",
          "Salgsinntekter 103097 99210",
          "Driftsresultat 21210 18000",
        ]),
      ],
      classifications: [classification({ unitScale: null, unitScaleConfidence: 0 })],
    });

    expect(result.summary.appliedPages).toBe(1);
    expect(result.classifications[0]?.unitScale).toBe(1000);
    expect(result.classifications[0]?.unitScaleConfidence).toBeGreaterThanOrEqual(0.82);
    expect(result.classifications[0]?.hasConflictingUnitSignals).toBe(false);
    expect(predictMock.mock.calls[0]?.[0].rawLabel).toContain("Salgsinntekter");
  });

  it("lets ML override a weak inherited rule signal", async () => {
    predictMock.mockResolvedValueOnce({
      unitScale: 1000,
      confidence: 0.64,
      modelVersion: "v2",
    });

    const result = await resolveUnitScaleClassifications({
      mode: "apply",
      pages: [page(3, ["Balanse", "Sum eiendeler 92155", "Sum egenkapital og gjeld 92155"])],
      classifications: [classification({ pageNumber: 3, unitScale: 1, unitScaleConfidence: 0.72 })],
    });

    expect(result.summary.appliedPages).toBe(1);
    expect(result.classifications[0]?.unitScale).toBe(1000);
    expect(result.classifications[0]?.reasons.join(" ")).toContain("overrode weak");
  });

  it("blocks autopublish on strong rule and ML disagreement instead of guessing", async () => {
    predictMock.mockResolvedValueOnce({
      unitScale: 1000,
      confidence: 0.75,
      modelVersion: "v2",
    });

    const result = await resolveUnitScaleClassifications({
      mode: "apply",
      pages: [page(2, ["Resultatregnskap", "Belop i: NOK", "Salgsinntekter 103097000"])],
      classifications: [classification({ unitScale: 1, unitScaleConfidence: 0.95 })],
    });

    expect(result.summary.conflictPages).toBe(1);
    expect(result.classifications[0]?.unitScale).toBe(1);
    expect(result.classifications[0]?.hasConflictingUnitSignals).toBe(true);
    expect(result.classifications[0]?.reasons.join(" ")).toContain("ML unit-scale conflict");
  });

  it("falls back to rule classifications when inference is unavailable", async () => {
    predictMock.mockResolvedValueOnce(null);

    const original = classification({ unitScale: 1, unitScaleConfidence: 0.95 });
    const result = await resolveUnitScaleClassifications({
      mode: "apply",
      pages: [page(2, ["Resultatregnskap", "Belop i: NOK", "Salgsinntekter 103097000"])],
      classifications: [original],
    });

    expect(result.summary.serviceAvailable).toBe(false);
    expect(result.classifications[0]).toBe(original);
  });

  it("does nothing outside apply mode", async () => {
    const original = classification({ unitScale: 1 });
    const result = await resolveUnitScaleClassifications({
      mode: "shadow",
      pages: [page(2, ["Resultatregnskap", "Belop i: NOK"])],
      classifications: [original],
    });

    expect(predictMock).not.toHaveBeenCalled();
    expect(result.classifications[0]).toBe(original);
  });
});
