import { describe, expect, it } from "vitest";

import { parseShareholderRegisterCsvHeader } from "@/lib/shareholder-register-csv";

describe("parseShareholderRegisterCsvHeader", () => {
  it("accepts the required Skatteetaten shareholder-register columns", () => {
    const result = parseShareholderRegisterCsvHeader(
      [
        "orgnr",
        "selskap",
        "navn_aksjonaer",
        "fodselsar_orgnr",
        "postnr_sted",
        "landkode",
        "antall_aksjer",
        "antall_aksjer_selskap",
      ].join(";"),
    );

    expect(result.missing).toEqual([]);
    expect(result.indexes.issuerOrgNumber).toBe(0);
    expect(result.indexes.totalCompanyShares).toBe(7);
  });

  it("reports missing required columns", () => {
    const result = parseShareholderRegisterCsvHeader("column_a;column_b");

    expect(result.missing).toContain("issuerOrgNumber");
    expect(result.missing).toContain("numberOfShares");
  });
});
