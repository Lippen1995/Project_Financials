import { describe, expect, it } from "vitest";

import {
  parseShareholderRegisterCsvHeader,
  reconcileSurplusCsvFields,
  splitShareholderRegisterCsvLine,
} from "@/lib/shareholder-register-csv";

describe("reconcileSurplusCsvFields", () => {
  const columnCount = 9;
  const addressIndex = 5;

  it("folds an address containing the delimiter back into one field", () => {
    const values = reconcileSurplusCsvFields(
      splitShareholderRegisterCsvLine(
        "998367891;CARE OF SWEDEN AS;Ordinære aksjer;PARIR AB; ;S-51, Tranemo; Sverige;SE;60;100",
      ),
      columnCount,
      addressIndex,
    );

    expect(values).toHaveLength(columnCount);
    expect(values[1]).toBe("CARE OF SWEDEN AS");
    expect(values[5]).toBe("S-51, Tranemo;Sverige");
    expect(values[6]).toBe("SE");
    expect(values[7]).toBe("60");
    expect(values[8]).toBe("100");
  });

  it("handles more than one embedded delimiter", () => {
    const values = reconcileSurplusCsvFields(
      splitShareholderRegisterCsvLine(
        "912345678;DØME AS;Ordinære aksjer;UTLAND AB;1980;Box 1; Gata 2; Ort;SE;5;10",
      ),
      columnCount,
      addressIndex,
    );

    expect(values).toHaveLength(columnCount);
    expect(values[5]).toBe("Box 1;Gata 2;Ort");
    expect(values[8]).toBe("10");
  });

  it("leaves a well-formed row untouched", () => {
    const original = splitShareholderRegisterCsvLine(
      "979938799;NEL ASA;Ordinære aksjer;OLA NORDMANN;1980;0150 OSLO;NO;10;1838457834",
    );

    expect(reconcileSurplusCsvFields(original, columnCount, addressIndex)).toEqual(original);
  });
});

describe("splitShareholderRegisterCsvLine", () => {
  it("keeps double quotes that are part of a company name", () => {
    const values = splitShareholderRegisterCsvLine(
      '916258720;HAWK INFINITY AS;A-aksjer;UAB "ERA CAPITAL" (SELSKAP); ;08240, Vilnius;LT;115178;93957660',
    );

    expect(values).toHaveLength(9);
    expect(values[3]).toBe('UAB "ERA CAPITAL" (SELSKAP)');
  });

  it("splits a row whose name contains an unbalanced double quote", () => {
    const values = splitShareholderRegisterCsvLine(
      '998858690;VIKING ASSISTANCE GROUP AS;Ordinære aksjer;"IF P INSURANCE HOLDING LTD (PUBL; ;10680, STOCKHOLM;SE;820378;820528',
    );

    expect(values).toHaveLength(9);
    expect(values[3]).toBe('"IF P INSURANCE HOLDING LTD (PUBL');
    expect(values[7]).toBe("820378");
    expect(values[8]).toBe("820528");
  });

  it("yields an empty field where the register names no shareholder", () => {
    const values = splitShareholderRegisterCsvLine(
      "979938799;NEL ASA;Ordinære aksjer; ;1980;;NO;10;1838457834",
    );

    expect(values[3]).toBe("");
    expect(values[4]).toBe("1980");
    expect(values[7]).toBe("10");
  });
});

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
