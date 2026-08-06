import { describe, expect, it } from "vitest";

import {
  parseOfficialAddressRecord,
  selectNationwideCsvDistribution,
} from "@/server/providers/kartverket-address-provider";

describe("Kartverket official address provider", () => {
  it("selects the nationwide WGS84 CSV distribution from the official Atom feed", () => {
    const distribution = selectNationwideCsvDistribution(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>CSV-format, Landsdekkende</title>
          <updated>2026-08-01T16:54:33</updated>
          <link href="https://nedlasting.geonorge.no/address_25833_CSV.zip" />
        </entry>
        <entry>
          <title>CSV-format, Landsdekkende</title>
          <updated>2026-08-01T16:54:35</updated>
          <link href="https://nedlasting.geonorge.no/address_4258_CSV.zip" />
        </entry>
      </feed>
    `);

    expect(distribution).toEqual({
      sourceUrl: "https://nedlasting.geonorge.no/address_4258_CSV.zip",
      sourceUpdatedAt: new Date("2026-08-01T16:54:35.000Z"),
      coordinateSystem: "EPSG:4258",
      datasetVersion: "matrikkelen-address-2026-08-01T16:54:35.000Z-epsg4258",
    });
  });

  it("normalizes an official vegadresse row without changing its source identity", () => {
    const address = parseOfficialAddressRecord({
      lokalid: "285666798",
      kommunenummer: "0301",
      adressetype: "vegadresse",
      adressenavn: "Ankerveien",
      nummer: "38",
      bokstav: "B",
      "EPSG-kode": "4258",
      Nord: "59.955924",
      Øst: "10.664108",
      postnummer: "0785",
      poststed: "OSLO",
      oppdateringsdato: "15.06.2020 18:02:11.793",
      datauttaksdato: "31.07.2026 23:25:37",
      adresseId: "285666798",
      uuidAdresse: "f0b840da-bb4f-5b09-a463-0695a5a0d7bb",
    });

    expect(address).toEqual({
      officialAddressId: "f0b840da-bb4f-5b09-a463-0695a5a0d7bb",
      municipalityNumber: "0301",
      addressType: "vegadresse",
      addressName: "Ankerveien",
      normalizedAddressName: "ANKERVEIEN",
      houseNumber: 38,
      houseLetter: "B",
      unitNumber: null,
      postalCode: "0785",
      postalPlace: "OSLO",
      latitude: 59.955924,
      longitude: 10.664108,
      sourceUpdatedAt: new Date("2020-06-15T18:02:11.793Z"),
      dataExtractedAt: new Date("2026-07-31T23:25:37.000Z"),
    });
  });

  it("rejects non-street, non-WGS84, and incomplete records", () => {
    const base = {
      uuidAdresse: "official-id",
      kommunenummer: "0301",
      adressetype: "vegadresse",
      adressenavn: "Ankerveien",
      nummer: "38",
      "EPSG-kode": "4258",
      Nord: "59.955924",
      Øst: "10.664108",
      datauttaksdato: "31.07.2026 23:25:37",
    };

    expect(parseOfficialAddressRecord({ ...base, adressetype: "matrikkeladresse" })).toBeNull();
    expect(parseOfficialAddressRecord({ ...base, "EPSG-kode": "25833" })).toBeNull();
    expect(parseOfficialAddressRecord({ ...base, adressenavn: "" })).toBeNull();
  });
});
