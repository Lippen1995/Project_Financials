import { describe, expect, it } from "vitest";

import { scoreComparable } from "./find-comparables";
import type { AgentCompanyRef } from "./types";

function ref(overrides: Partial<AgentCompanyRef>): AgentCompanyRef {
  return {
    orgNumber: "000000000",
    name: "Test AS",
    naceCode: "47.710",
    naceDescription: "Butikkhandel med klær",
    municipality: "Bergen",
    employeeCount: 20,
    status: "ACTIVE",
    ...overrides,
  };
}

const criteria = { naceCode: "47.710", municipality: "Bergen", employeeCount: 20 };

describe("scoreComparable", () => {
  it("ranks an exact-code, same-city, same-size active company highest", () => {
    const exact = scoreComparable(ref({}), criteria);
    // 45 (nace) + 20 (kommune) + 25 (size ratio 1.0) + 10 (active)
    expect(exact.score).toBe(100);
    expect(exact.reasons).toEqual(
      expect.arrayContaining(["samme næringskode", "samme kommune", "sammenlignbar størrelse"]),
    );
  });

  it("scores a same-group (2-digit) code below an exact code", () => {
    const exact = scoreComparable(ref({ naceCode: "47.710" }), criteria).score;
    const group = scoreComparable(ref({ naceCode: "47.190" }), criteria).score;
    expect(group).toBeLessThan(exact);
    expect(scoreComparable(ref({ naceCode: "47.190" }), criteria).reasons).toContain(
      "samme bransjegruppe",
    );
  });

  it("penalises size mismatch via the employee ratio", () => {
    const similar = scoreComparable(ref({ employeeCount: 20 }), criteria).score;
    const larger = scoreComparable(ref({ employeeCount: 2000 }), criteria).score;
    expect(larger).toBeLessThan(similar);
    expect(scoreComparable(ref({ employeeCount: 2000 }), criteria).reasons).not.toContain(
      "sammenlignbar størrelse",
    );
  });

  it("does not credit a different municipality", () => {
    const sameCity = scoreComparable(ref({ municipality: "Bergen" }), criteria).score;
    const otherCity = scoreComparable(ref({ municipality: "Oslo" }), criteria).score;
    expect(otherCity).toBe(sameCity - 20);
  });

  it("gives no active bonus to a dissolved company", () => {
    const active = scoreComparable(ref({ status: "ACTIVE" }), criteria).score;
    const dissolved = scoreComparable(ref({ status: "DISSOLVED" }), criteria).score;
    expect(dissolved).toBe(active - 10);
  });

  it("handles a candidate with no employee data without crashing", () => {
    const result = scoreComparable(ref({ employeeCount: null }), criteria);
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons).not.toContain("sammenlignbar størrelse");
  });
});
