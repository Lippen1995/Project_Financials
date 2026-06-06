import { describe, expect, it } from "vitest";

import {
  compareFactsToFasit,
  type AccuracyFact,
} from "@/server/services/extraction-accuracy-service";

const f = (
  metricKey: string,
  value: string,
  fiscalYear = 2024,
  statementScope: "COMPANY" | "CONSOLIDATED" = "CONSOLIDATED",
): AccuracyFact => ({ metricKey, statementScope, fiscalYear, value });

describe("compareFactsToFasit", () => {
  it("perfect match: recall and precision are 1", () => {
    const facts = [f("revenue", "3086817561"), f("total_assets", "18274390223")];
    const r = compareFactsToFasit({ extracted: facts, fasit: facts });
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.missing).toHaveLength(0);
    expect(r.wrong).toHaveLength(0);
  });

  it("a missed fasit value lowers recall but not precision", () => {
    const fasit = [f("revenue", "3086817561"), f("total_assets", "18274390223")];
    const extracted = [f("revenue", "3086817561")]; // total_assets not produced
    const r = compareFactsToFasit({ extracted, fasit });
    expect(r.recall).toBeCloseTo(0.5);
    expect(r.precision).toBe(1); // everything we produced was correct
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0]!.metricKey).toBe("total_assets");
    expect(r.wrong).toHaveLength(0);
  });

  it("a confidently-wrong value lowers precision and is reported with the fasit value", () => {
    const fasit = [f("revenue", "3086817561")];
    const extracted = [f("revenue", "3099629184")]; // machine value, wrong
    const r = compareFactsToFasit({ extracted, fasit });
    expect(r.recall).toBe(0); // fasit value not produced
    expect(r.precision).toBe(0); // produced value is wrong
    expect(r.wrong).toHaveLength(1);
    expect(r.wrong[0]!.value).toBe("3099629184");
    expect(r.wrong[0]!.producedInstead).toEqual(["3086817561"]);
    expect(r.missing).toHaveLength(1);
  });

  it("ignores extracted facts on slots the fasit does not cover (partial fasit)", () => {
    const fasit = [f("revenue", "3086817561")];
    const extracted = [f("revenue", "3086817561"), f("some_note_metric", "42")];
    const r = compareFactsToFasit({ extracted, fasit });
    expect(r.precision).toBe(1); // the extra note metric is not penalised
    expect(r.extractedOnFasitSlots).toBe(1);
    expect(r.wrong).toHaveLength(0);
  });

  it("separates konsern and selskap and the two years (slot grain)", () => {
    const fasit = [
      f("revenue", "3086817561", 2024, "CONSOLIDATED"),
      f("revenue", "211739845", 2024, "COMPANY"),
      f("revenue", "3099629184", 2023, "CONSOLIDATED"),
    ];
    // extraction swaps the konsern value onto the selskap slot — must be wrong.
    const extracted = [
      f("revenue", "3086817561", 2024, "CONSOLIDATED"),
      f("revenue", "3086817561", 2024, "COMPANY"),
      f("revenue", "3099629184", 2023, "CONSOLIDATED"),
    ];
    const r = compareFactsToFasit({ extracted, fasit });
    expect(r.matchedTotal).toBe(2); // konsern 2024 + konsern 2023
    expect(r.wrong).toHaveLength(1); // selskap 2024 got the konsern number
    expect(r.wrong[0]!.statementScope).toBe("COMPANY");
  });

  it("reports zero-valued fasit separately and keeps recallNonZero honest", () => {
    const fasit = [f("revenue", "3086817561"), f("financial_income", "0")];
    const extracted = [f("revenue", "3086817561")]; // can't produce the printed 0
    const r = compareFactsToFasit({ extracted, fasit });
    expect(r.zeroValuedFasit).toBe(1);
    expect(r.recall).toBeCloseTo(0.5); // raw recall counts the 0 miss
    expect(r.recallNonZero).toBe(1); // but every non-zero value was found
  });

  it("credits a value once even if the fasit lists it on multiple labels", () => {
    // total_revenue printed once but the slot set dedups; one extracted hit covers it.
    const fasit = [f("total_revenue", "3398713005")];
    const extracted = [f("total_revenue", "3398713005")];
    const r = compareFactsToFasit({ extracted, fasit });
    expect(r.fasitTotal).toBe(1);
    expect(r.matchedTotal).toBe(1);
  });
});
