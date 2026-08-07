import { describe, expect, it } from "vitest";

import {
  hasExpectedShareholderRegisterCsvFieldCount,
  parseShareholderRegisterCsvHeader,
  splitShareholderRegisterCsvLine,
} from "@/lib/shareholder-register-csv";

describe("splitShareholderRegisterCsvLine", () => {
  it("treats quote characters as ordinary source data", () => {
    const values = splitShareholderRegisterCsvLine(
      '000000000;TEST ISSUER;A;TEST "OWNER" UNIT;;0000 TEST;NO;1;1',
    );

    expect(values).toHaveLength(9);
    expect(values[3]).toBe('TEST "OWNER" UNIT');
  });

  it("does not let an unmatched quote consume later semicolon fields", () => {
    const values = splitShareholderRegisterCsvLine(
      '000000000;TEST ISSUER;A;"TEST OWNER;;0000 TEST;NO;1;1',
    );

    expect(values).toHaveLength(9);
    expect(values[3]).toBe('"TEST OWNER');
    expect(values[4]).toBe("");
  });

  it("preserves an empty shareholder-name field", () => {
    const values = splitShareholderRegisterCsvLine(
      "000000000;TEST ISSUER;A;;2000;0000 TEST;NO;1;1",
    );

    expect(values).toHaveLength(9);
    expect(values[3]).toBe("");
  });

  it("rejects truncated and extended data rows", () => {
    expect(hasExpectedShareholderRegisterCsvFieldCount(new Array(9).fill("TEST"))).toBe(true);
    expect(hasExpectedShareholderRegisterCsvFieldCount(new Array(8).fill("TEST"))).toBe(false);
    expect(hasExpectedShareholderRegisterCsvFieldCount(new Array(10).fill("TEST"))).toBe(false);
  });
});

describe("parseShareholderRegisterCsvHeader", () => {
  it("accepts the required Skatteetaten shareholder-register columns", () => {
    const result = parseShareholderRegisterCsvHeader(
      [
        "orgnr",
        "selskap",
        "aksjeklasse",
        "navn_aksjonaer",
        "fodselsar_orgnr",
        "postnr_sted",
        "landkode",
        "antall_aksjer",
        "antall_aksjer_selskap",
      ].join(";"),
    );

    expect(result.missing).toEqual([]);
    expect(result.hasExpectedFieldCount).toBe(true);
    expect(result.indexes.issuerOrgNumber).toBe(0);
    expect(result.indexes.shareClass).toBe(2);
    expect(result.indexes.totalCompanyShares).toBe(8);
  });

  it("rejects a header without the fixed share-class field", () => {
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

    expect(result.hasExpectedFieldCount).toBe(false);
    expect(result.missing).toContain("shareClass");
  });

  it("reports missing required columns", () => {
    const result = parseShareholderRegisterCsvHeader("column_a;column_b");

    expect(result.missing).toContain("issuerOrgNumber");
    expect(result.missing).toContain("numberOfShares");
  });
});
