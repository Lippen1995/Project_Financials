import { describe, expect, it } from "vitest";

import {
  selectStructuredFinancialCloseoutSample,
  STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE,
} from "@/server/services/structured-financial-sampling-service";

type Candidate = {
  orgNumber: string;
  legalForm: string | null;
  companyStatus: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
};

function candidates(
  prefix: string,
  count: number,
  legalForm: string,
  companyStatus: Candidate["companyStatus"],
): Candidate[] {
  return Array.from({ length: count }, (_, index) => ({
    orgNumber: `test-${prefix}-${String(index).padStart(6, "0")}`,
    legalForm,
    companyStatus,
  }));
}

describe("structured financial closeout sampling", () => {
  it("selects the documented 150-company profile across exclusive strata", () => {
    const pool = [
      ...candidates("100", 45, "AS", "ACTIVE"),
      ...candidates("200", 30, "AS", "DISSOLVED"),
      ...candidates("300", 30, "AS", "BANKRUPT"),
      ...candidates("400", 8, "ASA", "ACTIVE"),
      ...candidates("500", 8, "ASA", "DISSOLVED"),
      ...candidates("600", 15, "ENK", "ACTIVE"),
      ...candidates("700", 15, "ENK", "DISSOLVED"),
      ...candidates("800", 15, "DA", "ACTIVE"),
      ...candidates("900", 15, "ANS", "BANKRUPT"),
      ...candidates("910", 8, "SA", "ACTIVE"),
      ...candidates("920", 8, "NUF", "DISSOLVED"),
    ];

    const result = selectStructuredFinancialCloseoutSample(pool);

    expect(result.profile).toBe(STRUCTURED_FINANCIAL_CLOSEOUT_SAMPLE_PROFILE);
    expect(result.targetSize).toBe(150);
    expect(result.selected).toHaveLength(150);
    expect(result.strata.map(({ id, selected }) => [id, selected])).toEqual([
      ["as-active", 40],
      ["as-dissolved", 25],
      ["as-bankrupt", 25],
      ["asa-active", 5],
      ["asa-non-active", 5],
      ["enk-active", 10],
      ["enk-non-active", 10],
      ["partnership-active", 10],
      ["partnership-non-active", 10],
      ["other-active", 5],
      ["other-non-active", 5],
    ]);
    expect(new Set(result.selected.map((item) => item.orgNumber)).size).toBe(150);
    expect(result.poolFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.selectionFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic and reports an honest shortfall when a stratum is small", () => {
    const pool = [
      ...candidates("300", 2, "AS", "BANKRUPT"),
      ...candidates("100", 2, "AS", "ACTIVE"),
    ];

    const first = selectStructuredFinancialCloseoutSample(pool);
    const second = selectStructuredFinancialCloseoutSample([...pool].reverse());

    expect(first.selected.map((item) => item.orgNumber)).toEqual(
      second.selected.map((item) => item.orgNumber),
    );
    expect(first.selected).toHaveLength(4);
    expect(first.shortfall).toBe(146);
    expect(first.poolFingerprint).toBe(second.poolFingerprint);
    expect(first.selectionFingerprint).toBe(second.selectionFingerprint);
    expect(first.strata.find((stratum) => stratum.id === "as-active")).toMatchObject({
      available: 2,
      selected: 2,
      target: 40,
    });
  });
});
