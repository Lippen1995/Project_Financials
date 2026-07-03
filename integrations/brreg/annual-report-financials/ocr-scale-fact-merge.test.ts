import { describe, expect, it } from "vitest";

import { selectivelyMergeOcrScaleFacts } from "@/integrations/brreg/annual-report-financials/ocr-scale-fact-merge";
import type { AccuracyFact } from "@/server/services/extraction-accuracy-service";

function fact(
  metricKey: string,
  fiscalYear: number,
  value: string,
): AccuracyFact {
  return {
    metricKey,
    statementScope: "COMPANY",
    fiscalYear,
    value,
  };
}

describe("selectivelyMergeOcrScaleFacts", () => {
  it("replaces a primary value when scale4 restores a missing leading digit group", () => {
    const result = selectivelyMergeOcrScaleFacts(
      [fact("as_reported_kundefordringer", 2022, "560000")],
      [fact("as_reported_kundefordringer", 2022, "12560000")],
    );

    expect(result.facts).toEqual([
      fact("as_reported_kundefordringer", 2022, "12560000"),
    ]);
    expect(result.stats.replacedTruncatedSlots).toBe(1);
  });

  it("adds a missing sibling year only when the row is already anchored by primary OCR", () => {
    const result = selectivelyMergeOcrScaleFacts(
      [fact("as_reported_andre_fordringer", 2024, "7203000")],
      [
        fact("as_reported_andre_fordringer", 2023, "6171000"),
        fact("as_reported_uavklart_scale4_rad", 2023, "991000"),
      ],
    );

    expect(result.facts).toEqual([
      fact("as_reported_andre_fordringer", 2024, "7203000"),
      fact("as_reported_andre_fordringer", 2023, "6171000"),
    ]);
    expect(result.stats.addedSiblingYearSlots).toBe(1);
    expect(result.stats.skippedUnanchoredSlots).toBe(1);
  });

  it("keeps primary OCR when scale4 conflicts without a leading-group repair pattern", () => {
    const result = selectivelyMergeOcrScaleFacts(
      [fact("as_reported_sum_bankinnskudd", 2024, "700000000")],
      [fact("as_reported_sum_bankinnskudd", 2024, "470000000")],
    );

    expect(result.facts).toEqual([
      fact("as_reported_sum_bankinnskudd", 2024, "700000000"),
    ]);
    expect(result.stats.replacedTruncatedSlots).toBe(0);
    expect(result.stats.skippedConflictingSlots).toBe(1);
  });

  it("repairs one truncated value even when the slot has another primary candidate", () => {
    const result = selectivelyMergeOcrScaleFacts(
      [
        fact("other_receivables", 2024, "251000"),
        fact("other_receivables", 2024, "611832000"),
      ],
      [fact("other_receivables", 2024, "1251000")],
    );

    expect(result.facts).toEqual([
      fact("other_receivables", 2024, "611832000"),
      fact("other_receivables", 2024, "1251000"),
    ]);
    expect(result.stats.replacedTruncatedSlots).toBe(1);
  });

  it("replaces a same-length single-digit OCR error with the high-resolution value", () => {
    const result = selectivelyMergeOcrScaleFacts(
      [fact("other_receivables", 2024, "740292000")],
      [fact("other_receivables", 2024, "740992000")],
    );

    expect(result.facts).toEqual([
      fact("other_receivables", 2024, "740992000"),
    ]);
    expect(result.stats.replacedTruncatedSlots).toBe(1);
  });

  it("replaces a dropped non-zero value when primary OCR emitted zero", () => {
    const result = selectivelyMergeOcrScaleFacts(
      [fact("tangible_assets", 2021, "0")],
      [fact("tangible_assets", 2021, "5000")],
    );

    expect(result.facts).toEqual([
      fact("tangible_assets", 2021, "5000"),
    ]);
    expect(result.stats.replacedTruncatedSlots).toBe(1);
  });
});
