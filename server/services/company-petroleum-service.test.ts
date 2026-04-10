import { describe, expect, it } from "vitest";

import {
  buildExecutiveSummary,
  buildPipeline,
  buildTopAssetExposureBreakdown,
  evaluatePetroleumVisibilityFromSignals,
} from "@/server/services/company-petroleum-service";

describe("company petroleum visibility", () => {
  it("returns NONE when no link", () => {
    const result = evaluatePetroleumVisibilityFromSignals({
      hasLink: false,
      hasOperatorRole: false,
      hasLicenseeRole: false,
      hasMeaningfulSnapshot: false,
      hasRelevantEvents: false,
    });

    expect(result.available).toBe(false);
    expect(result.strength).toBe("NONE");
  });

  it("returns WEAK for loose event-only signal", () => {
    const result = evaluatePetroleumVisibilityFromSignals({
      hasLink: true,
      hasOperatorRole: false,
      hasLicenseeRole: false,
      hasMeaningfulSnapshot: false,
      hasRelevantEvents: true,
    });

    expect(result.available).toBe(false);
    expect(result.strength).toBe("WEAK");
  });

  it("returns CORE for operator role", () => {
    const result = evaluatePetroleumVisibilityFromSignals({
      hasLink: true,
      hasOperatorRole: true,
      hasLicenseeRole: false,
      hasMeaningfulSnapshot: false,
      hasRelevantEvents: false,
    });

    expect(result.available).toBe(true);
    expect(result.strength).toBe("CORE");
    expect(result.hasAssets).toBe(true);
  });
});

describe("company petroleum ranking helpers", () => {
  it("ranks top assets by production/reserves/investment", () => {
    const rows = [
      { entityId: "a", name: "A", role: "OPERATOR" as const, latestProductionValue: 2, remainingOe: 10, expectedFutureInvestmentNok: 4 },
      { entityId: "b", name: "B", role: "OPERATOR" as const, latestProductionValue: 9, remainingOe: 1, expectedFutureInvestmentNok: 3 },
      { entityId: "c", name: "C", role: "LICENSEE" as const, latestProductionValue: 1, remainingOe: 50, expectedFutureInvestmentNok: 2 },
    ];

    const ranked = buildTopAssetExposureBreakdown(rows as never);
    expect(ranked.byProduction[0]?.entityId).toBe("b");
    expect(ranked.byReserves[0]?.entityId).toBe("c");
    expect(ranked.byInvestment[0]?.entityId).toBe("a");
  });

  it("builds pipeline insights from development and discoveries", () => {
    const pipeline = buildPipeline({
      fields: [{ entityId: "f1", name: "F1", role: "OPERATOR", status: "Under utbygging" }] as never,
      licences: [],
      discoveries: [
        { entityId: "d1", npdId: 1, name: "D1", role: "OPERATOR" },
        { entityId: "d2", npdId: 2, name: "D2", role: "OPERATOR" },
        { entityId: "d3", npdId: 3, name: "D3", role: "OPERATOR" },
      ] as never,
      infrastructure: [],
    });

    expect(pipeline).not.toBeNull();
    expect(pipeline?.developmentAssets.length).toBeGreaterThan(0);
    expect((pipeline?.insights ?? []).length).toBeGreaterThan(0);
  });

  it("builds defensive executive summary", () => {
    const summary = buildExecutiveSummary(
      {
        operatorFieldCount: 0,
        licenceCount: 2,
        discoveryCount: 1,
        facilityCount: 0,
        tufCount: 0,
        operatedProductionOe: null,
        attributableProductionOe: null,
        remainingReservesOe: null,
        expectedFutureInvestmentNok: null,
        mainAreas: ["Nordsjøen"],
        mainHydrocarbonTypes: ["Gass"],
        npdCompanyId: 1,
      },
      null,
    );

    expect(summary.length).toBeGreaterThan(0);
    expect(summary[0]).toContain("licensee");
  });
});
