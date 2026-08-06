import { describe, expect, it } from "vitest";

import { mapBrregRegistryEntity } from "@/server/providers/brreg-registry-entity-mapper";

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
