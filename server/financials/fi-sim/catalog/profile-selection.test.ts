import { describe, expect, it } from "vitest";

import {
  FI_SIM_CALCULATIONS,
  FI_SIM_BALANCE_IDENTITY,
  calculationFor,
} from "@/server/financials/fi-sim/catalog/calculations";
import { findConcept } from "@/server/financials/fi-sim/catalog/concepts";
import {
  selectSimulationProfile,
  type CompanyProfileSignals,
} from "@/server/financials/fi-sim/catalog/profile-selection";
import { permittedConcepts } from "@/server/financials/fi-sim/catalog/profiles";

function signals(overrides: Partial<CompanyProfileSignals> = {}): CompanyProfileSignals {
  return { industryCode: null, organisationForm: "AS", ...overrides };
}

describe("calculation relationships", () => {
  it("names only concepts that exist, on the right statement", () => {
    for (const relationship of FI_SIM_CALCULATIONS) {
      const parent = findConcept(relationship.parentConceptKey);
      expect(parent, relationship.parentConceptKey).not.toBeNull();
      expect(parent?.statementFamily).toBe(relationship.statementFamily);
      for (const operand of relationship.operands) {
        const concept = findConcept(operand.conceptKey);
        expect(concept, operand.conceptKey).not.toBeNull();
        expect(concept?.statementFamily).toBe(relationship.statementFamily);
      }
    }
  });

  it("covers every identity the spec states", () => {
    for (const parent of [
      "OperatingIncomeTotal",
      "OperatingExpenseTotal",
      "OperatingResult",
      "NetFinancialResult",
      "ProfitBeforeTax",
      "ProfitForPeriod",
      "NoncurrentAssetsTotal",
      "CurrentAssetsTotal",
      "AssetsTotal",
      "EquityTotal",
      "LongTermLiabilitiesTotal",
      "CurrentLiabilitiesTotal",
      "LiabilitiesTotal",
      "EquityAndLiabilitiesTotal",
    ]) {
      expect(calculationFor(parent), parent).not.toBeNull();
    }
    expect(FI_SIM_BALANCE_IDENTITY).toEqual({
      left: "AssetsTotal",
      right: "EquityAndLiabilitiesTotal",
    });
  });

  it("subtracts exactly where the spec subtracts", () => {
    expect(calculationFor("OperatingResult")?.operands).toEqual([
      { conceptKey: "OperatingIncomeTotal", weight: 1 },
      { conceptKey: "OperatingExpenseTotal", weight: -1 },
    ]);
    expect(calculationFor("ProfitForPeriod")?.operands).toEqual([
      { conceptKey: "ProfitBeforeTax", weight: 1 },
      { conceptKey: "TaxExpense", weight: -1 },
    ]);
    const financial = calculationFor("NetFinancialResult")?.operands ?? [];
    expect(financial.filter((o) => o.weight === -1).map((o) => o.conceptKey)).toEqual([
      "InterestExpense",
      "OtherFinancialExpense",
    ]);
  });
});

describe("deterministic profile selection", () => {
  it("blocks banks and credit institutions", () => {
    for (const code of ["64.190", "64.110", "64.920"]) {
      const result = selectSimulationProfile(signals({ industryCode: code }));
      expect(result.supported).toBe(false);
      if (!result.supported) expect(result.errorCode).toBe("UNSUPPORTED_SIMULATION_PROFILE");
    }
  });

  it("blocks insurance and pension funds", () => {
    const result = selectSimulationProfile(signals({ industryCode: "65.120" }));
    expect(result.supported).toBe(false);
  });

  it("does not block holding companies that share the banking division", () => {
    // 64.2 sits inside the same SN2007 division as banking. Prefix order is what keeps a holding
    // company from being blocked as a bank.
    const result = selectSimulationProfile(signals({ industryCode: "64.201" }));
    expect(result).toMatchObject({ supported: true, profile: "HOLDING_INVESTMENT" });
  });

  it.each([
    ["68.209", "PROPERTY"],
    ["41.200", "MANUFACTURING_CONSTRUCTION"],
    ["10.130", "MANUFACTURING_CONSTRUCTION"],
    ["47.111", "TRADE"],
    ["46.900", "TRADE"],
  ])("maps %s to %s", (industryCode, profile) => {
    expect(selectSimulationProfile(signals({ industryCode }))).toMatchObject({
      supported: true,
      profile,
    });
  });

  it("falls back to SERVICE when nothing else applies", () => {
    expect(selectSimulationProfile(signals({ industryCode: "62.010" }))).toMatchObject({
      supported: true,
      profile: "SERVICE",
      ruleId: "default.service",
    });
    expect(selectSimulationProfile(signals({ industryCode: null }))).toMatchObject({
      supported: true,
      profile: "SERVICE",
    });
  });

  it("lets a regulatory block override any industry code", () => {
    const result = selectSimulationProfile(
      signals({ industryCode: "47.111", regulatoryBlock: { reason: "Under tilsyn" } }),
    );
    expect(result).toMatchObject({
      supported: false,
      ruleId: "overlay.regulatory.blocked",
      reason: "Under tilsyn",
    });
  });

  it("returns the same answer every time for the same signals", () => {
    // Spec section 6: no random variation. A demo that reshuffles between runs demonstrates
    // nothing.
    const input = signals({ industryCode: "47.111" });
    const runs = Array.from({ length: 25 }, () => JSON.stringify(selectSimulationProfile(input)));
    expect(new Set(runs).size).toBe(1);
  });

  it("records which rule decided, on every outcome", () => {
    for (const industryCode of ["64.190", "68.209", "99.999", null]) {
      const result = selectSimulationProfile(signals({ industryCode }));
      expect(result.ruleId).toBeTruthy();
      expect(result.rulesetVersion).toBe("fi-sim-profile-rules-2026.1");
    }
  });

  it("only ever names a profile the catalog defines", () => {
    for (const industryCode of ["47.111", "68.209", "41.200", "64.201", "99.999"]) {
      const result = selectSimulationProfile(signals({ industryCode }));
      if (result.supported) expect(permittedConcepts(result.profile).size).toBeGreaterThan(0);
    }
  });
});
