import { describe, expect, it, vi, beforeEach } from "vitest";

const { predictMock } = vi.hoisted(() => ({ predictMock: vi.fn() }));

vi.mock("@/server/ml/ml-inference-client", () => ({
  predictUnitScale: predictMock,
}));

import { runUnitScaleShadowComparison } from "@/server/ml/unit-scale-shadow-service";

function makePage(pageNumber: number, lines: string[]) {
  return {
    pageNumber,
    text: lines.join("\n"),
    normalizedText: lines.join(" ").toLowerCase(),
    lines: lines.map((text, index) => ({ text, y: 100 - index })),
    blocks: [],
    tables: [],
  } as never;
}

describe("unit-scale-shadow-service", () => {
  beforeEach(() => {
    predictMock.mockReset();
  });

  it("counts agreements when the model matches the rule", async () => {
    predictMock.mockResolvedValue({ unitScale: 1000, confidence: 0.9, modelVersion: "v1" });

    const result = await runUnitScaleShadowComparison({
      pages: [makePage(2, ["Beløp i NOK 1000"])],
      classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1000 }],
    });

    expect(result.serviceAvailable).toBe(true);
    expect(result.comparedPages).toBe(1);
    expect(result.agreements).toBe(1);
    expect(result.disagreements).toBe(0);
    expect(result.agreementRate).toBe(1);
  });

  it("counts disagreements when the model differs from the rule", async () => {
    predictMock.mockResolvedValue({ unitScale: 1, confidence: 0.7, modelVersion: "v1" });

    const result = await runUnitScaleShadowComparison({
      pages: [makePage(3, ["Beløp i NOK 1000"])],
      classifications: [{ pageNumber: 3, type: "STATUTORY_BALANCE", unitScale: 1000 }],
    });

    expect(result.agreements).toBe(0);
    expect(result.disagreements).toBe(1);
    expect(result.agreementRate).toBe(0);
  });

  it("ignores non-statement page types", async () => {
    predictMock.mockResolvedValue({ unitScale: 1, confidence: 0.9, modelVersion: "v1" });

    const result = await runUnitScaleShadowComparison({
      pages: [makePage(1, ["Forsidetekst"])],
      classifications: [{ pageNumber: 1, type: "COVER", unitScale: null }],
    });

    expect(result.comparedPages).toBe(0);
    expect(predictMock).not.toHaveBeenCalled();
  });

  it("marks the service unavailable when the model returns null", async () => {
    predictMock.mockResolvedValue(null);

    const result = await runUnitScaleShadowComparison({
      pages: [
        makePage(2, ["Beløp i NOK"]),
        makePage(3, ["Beløp i NOK 1000"]),
      ],
      classifications: [
        { pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 },
        { pageNumber: 3, type: "STATUTORY_BALANCE", unitScale: 1000 },
      ],
    });

    expect(result.serviceAvailable).toBe(false);
    expect(result.comparedPages).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.agreementRate).toBeNull();
  });

  it("never throws — a rejecting model is handled by the client, summary stays valid", async () => {
    predictMock.mockResolvedValue(null);

    const result = await runUnitScaleShadowComparison({
      pages: [makePage(2, ["Beløp i NOK"])],
      classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 }],
    });

    expect(result).toBeDefined();
    expect(result.serviceAvailable).toBe(false);
  });
});
