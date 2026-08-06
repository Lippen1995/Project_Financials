import { describe, expect, it } from "vitest";

import {
  buildExactAddressKey,
  resolveBusinessAddress,
} from "@/server/company-map/address-resolution";

describe("company-map exact address resolution", () => {
  it("builds the same strict key from Brreg street text and official address parts", () => {
    expect(
      buildExactAddressKey({
        municipalityNumber: "0301",
        addressStreet: "  Storgata 12 a  ",
      }),
    ).toEqual({
      municipalityNumber: "0301",
      normalizedAddressName: "STORGATA",
      houseNumber: 12,
      houseLetter: "A",
      unitNumber: null,
    });
  });

  it("uses the rightmost exact street segment after a care-of line", () => {
    expect(
      buildExactAddressKey({
        municipalityNumber: "0301",
        addressStreet: "c/o Foretaksforvaltning AS, Dronning Mauds gate 15",
      }),
    ).toEqual({
      municipalityNumber: "0301",
      normalizedAddressName: "DRONNING MAUDS GATE",
      houseNumber: 15,
      houseLetter: null,
      unitNumber: null,
    });
  });

  it("accepts only one exact official address match", () => {
    const resolution = resolveBusinessAddress(
      {
        addressStreet: "Storgata 12A",
        municipalityNumber: "0301",
        countryCode: "NO",
        organisationForm: "AS",
      },
      [
        {
          officialAddressId: "official-address-id",
          municipalityNumber: "0301",
          addressName: "Storgata",
          houseNumber: 12,
          houseLetter: "A",
          unitNumber: null,
          latitude: 59.91,
          longitude: 10.75,
        },
      ],
    );

    expect(resolution).toMatchObject({
      status: "MATCHED",
      officialAddressId: "official-address-id",
      latitude: 59.91,
      longitude: 10.75,
    });
  });

  it.each([
    {
      input: { addressStreet: null, municipalityNumber: "0301", countryCode: "NO" },
      expected: "NO_BUSINESS_ADDRESS",
    },
    {
      input: { addressStreet: "Postboks 1", municipalityNumber: "0301", countryCode: "NO" },
      expected: "NON_GEOGRAPHIC_ADDRESS",
    },
    {
      input: { addressStreet: "Storgata", municipalityNumber: "0301", countryCode: "NO" },
      expected: "INCOMPLETE_OR_INVALID",
    },
    {
      input: { addressStreet: "Storgata 12", municipalityNumber: "0301", countryCode: "SE" },
      expected: "OUTSIDE_NORWAY",
    },
  ])("classifies an unplottable business address as $expected", ({ input, expected }) => {
    expect(
      resolveBusinessAddress({ ...input, organisationForm: "AS" }, []),
    ).toEqual({ status: expected });
  });

  it("withholds a person-linked entity even when its address has a unique match", () => {
    expect(
      resolveBusinessAddress(
        {
          addressStreet: "Storgata 12",
          municipalityNumber: "0301",
          countryCode: "NO",
          organisationForm: "ENK",
        },
        [
          {
            officialAddressId: "official-address-id",
            municipalityNumber: "0301",
            addressName: "Storgata",
            houseNumber: 12,
            houseLetter: null,
            unitNumber: null,
            latitude: 59.91,
            longitude: 10.75,
          },
        ],
      ),
    ).toEqual({ status: "PRIVACY_WITHHELD" });
  });

  it("attributes a person-linked entity with no address to the actual address omission", () => {
    expect(
      resolveBusinessAddress(
        {
          addressStreet: null,
          municipalityNumber: null,
          countryCode: "NO",
          organisationForm: "ENK",
        },
        [],
      ),
    ).toEqual({ status: "NO_BUSINESS_ADDRESS" });
  });

  it("distinguishes no match from an ambiguous exact key", () => {
    const input = {
      addressStreet: "Storgata 12",
      municipalityNumber: "0301",
      countryCode: "NO",
      organisationForm: "AS",
    };
    const candidate = {
      officialAddressId: "official-address-id-1",
      municipalityNumber: "0301",
      addressName: "Storgata",
      houseNumber: 12,
      houseLetter: null,
      unitNumber: null,
      latitude: 59.91,
      longitude: 10.75,
    };

    expect(resolveBusinessAddress(input, [])).toEqual({ status: "NO_EXACT_MATCH" });
    expect(
      resolveBusinessAddress(input, [
        candidate,
        { ...candidate, officialAddressId: "official-address-id-2" },
      ]),
    ).toEqual({ status: "AMBIGUOUS_EXACT_MATCH" });
  });
});
