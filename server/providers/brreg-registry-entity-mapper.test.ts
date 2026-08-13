import { describe, expect, it } from "vitest";

import {
  mapBrregEntityNames,
  mapBrregRegistryEntity,
} from "@/server/providers/brreg-registry-entity-mapper";

describe("Brreg registry-entity mapper", () => {
  it("uses only forretningsadresse and prepares its exact-match components", () => {
    const mapped = mapBrregRegistryEntity({
      organisasjonsnummer: "123456789",
      navn: "Juridisk enhet",
      organisasjonsform: { kode: "AS" },
      forretningsadresse: {
        adresse: ["Ankerveien 38 B"],
        postnummer: "0785",
        poststed: "OSLO",
        kommune: "OSLO",
        kommunenummer: "0301",
        landkode: "NO",
      },
    });

    expect(mapped).toMatchObject({
      addressStreet: "Ankerveien 38 B",
      postalCode: "0785",
      municipalityNumber: "0301",
      businessAddressStreet: "Ankerveien 38 B",
      businessAddressMunicipalityNumber: "0301",
      businessAddressNormalizedName: "ANKERVEIEN",
      businessAddressHouseNumber: 38,
      businessAddressHouseLetter: "B",
      businessAddressUnitNumber: null,
    });
  });

  it("mirrors the charter facts Brreg publishes with the entity", () => {
    // Field-for-field shape of REACH SUBSEA ASA (922493626) in the enhet v2 representation.
    const mapped = mapBrregRegistryEntity({
      organisasjonsnummer: "922493626",
      navn: "REACH SUBSEA ASA",
      organisasjonsform: { kode: "ASA" },
      stiftelsesdato: "1909-08-19",
      vedtektsdato: "2025-03-05",
      vedtektsfestetFormaal: [
        "Yte ingeniør-, konstruksjons- og servicetjenester for",
        "offshoreenergiindustrien, skipsfart og annen transportvirksomhet.",
      ],
      aktivitet: ["Yte ingeniør-, konstruksjons- og servicetjenester."],
      maalform: "Bokmål",
      registrertIMvaregisteret: true,
      registrertIForetaksregisteret: true,
      registreringsdatoForetaksregisteret: "1988-10-18",
      sisteInnsendteAarsregnskap: "2024",
      kapital: {
        belop: 327377982.0,
        antallAksjer: 327377982,
        type: "Aksjekapital",
        valuta: "NOK",
        innfortDato: "2025-03-10",
      },
      historiskeNavn: [
        { navn: "NOMADIC SHIPPING ASA", fraDato: "1996-01-22 21:03:00", tilDato: "2003-05-19 13:02:17" },
        { navn: "GREEN REEFERS ASA", fraDato: "2003-05-19 13:02:17", tilDato: "2012-08-18 15:00:52" },
      ],
    });

    expect(mapped).toMatchObject({
      statutoryPurpose:
        "Yte ingeniør-, konstruksjons- og servicetjenester for offshoreenergiindustrien, skipsfart og annen transportvirksomhet.",
      activityDescription: "Yte ingeniør-, konstruksjons- og servicetjenester.",
      languageForm: "Bokmål",
      vatRegistered: true,
      registeredInBusinessRegister: true,
      lastSubmittedAnnualReportYear: 2024,
      capitalType: "Aksjekapital",
      shareCapital: 327377982,
      shareCapitalCurrency: "NOK",
      shareCount: 327377982n,
    });
    expect(mapped.foundedAt?.toISOString().slice(0, 10)).toBe("1909-08-19");
    expect(mapped.statutesDate?.toISOString().slice(0, 10)).toBe("2025-03-05");
    expect(mapped.businessRegisterRegisteredAt?.toISOString().slice(0, 10)).toBe("1988-10-18");
    expect(mapped.previousNames).toEqual([
      { name: "NOMADIC SHIPPING ASA", fromDate: "1996-01-22T21:03:00", toDate: "2003-05-19T13:02:17" },
      { name: "GREEN REEFERS ASA", fromDate: "2003-05-19T13:02:17", toDate: "2012-08-18T15:00:52" },
    ]);
  });

  it("leaves the charter fields null for an entity without them", () => {
    const mapped = mapBrregRegistryEntity({
      organisasjonsnummer: "123456789",
      navn: "Juridisk enhet",
      organisasjonsform: { kode: "AS" },
      historiskeNavn: [],
    });

    expect(mapped).toMatchObject({
      foundedAt: null,
      statutoryPurpose: null,
      activityDescription: null,
      shareCapital: null,
      shareCount: null,
      previousNames: null,
    });
  });

  it("flattens current and historic names into the name index", () => {
    const names = mapBrregEntityNames({
      organisasjonsnummer: "922493626",
      navn: "REACH SUBSEA ASA",
      historiskeNavn: [
        { navn: "NOMADIC SHIPPING ASA", fraDato: "1996-01-22 21:03:00", tilDato: "2003-05-19 13:02:17" },
        { navn: "GREEN REEFERS ASA", fraDato: "2003-05-19 13:02:17", tilDato: "2012-08-18 15:00:52" },
      ],
    });

    expect(names.map((row) => [row.name, row.isCurrent])).toEqual([
      ["REACH SUBSEA ASA", true],
      ["NOMADIC SHIPPING ASA", false],
      ["GREEN REEFERS ASA", false],
    ]);
    // The current name starts where the last historic period ended.
    expect(names[0].fromDate?.toISOString()).toBe(new Date("2012-08-18T15:00:52").toISOString());
    expect(names[0].toDate).toBeNull();
    expect(names.every((row) => row.orgNumber === "922493626")).toBe(true);
    expect(names.map((row) => row.normalizedName)).toEqual([
      "REACH SUBSEA ASA",
      "NOMADIC SHIPPING ASA",
      "GREEN REEFERS ASA",
    ]);
  });

  it("indexes the current name even when the entity has no history", () => {
    const names = mapBrregEntityNames({
      organisasjonsnummer: "123456789",
      navn: "  Juridisk enhet  ",
    });

    expect(names).toEqual([
      {
        orgNumber: "123456789",
        name: "Juridisk enhet",
        normalizedName: "JURIDISK ENHET",
        isCurrent: true,
        fromDate: null,
        toDate: null,
      },
    ]);
  });

  it("indexes nothing for an entity without an org number", () => {
    expect(mapBrregEntityNames({ navn: "MANGLER ORGNR AS" })).toEqual([]);
  });

  it("does not substitute postadresse when forretningsadresse is absent", () => {
    const mapped = mapBrregRegistryEntity({
      organisasjonsnummer: "123456789",
      navn: "Juridisk enhet",
      organisasjonsform: { kode: "AS" },
      postadresse: {
        adresse: ["Postboks 1"],
        postnummer: "0001",
        poststed: "OSLO",
        kommunenummer: "0301",
        landkode: "NO",
      },
    });

    expect(mapped).toMatchObject({
      addressStreet: "Postboks 1",
      postalCode: "0001",
      municipalityNumber: "0301",
      countryCode: "NO",
      businessAddressStreet: null,
      businessAddressPostalCode: null,
      businessAddressMunicipalityNumber: null,
      businessAddressCountryCode: null,
      businessAddressNormalizedName: null,
      businessAddressHouseNumber: null,
    });
  });
});
