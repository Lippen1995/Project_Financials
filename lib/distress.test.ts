import { describe, expect, it } from "vitest";

import {
  buildDistressProfileFromPayload,
  calculateEquityRatio,
  deriveDistressStatus,
  extractInterestBearingDebt,
  getSectorCodeFromIndustryCode,
} from "@/lib/distress";

describe("distress helpers", () => {
  it("maps bankruptcy before other distress signals", () => {
    expect(
      deriveDistressStatus({
        konkurs: true,
        underAvvikling: true,
        underRekonstruksjonsforhandlingDato: "2026-03-01",
      }),
    ).toBe("BANKRUPTCY");
  });

  it("maps reconstruction when reconstruction date is present", () => {
    expect(
      deriveDistressStatus({
        underRekonstruksjonsforhandlingDato: "2026-03-01",
      }),
    ).toBe("RECONSTRUCTION");
  });

  it("uses the selected distress date to calculate status duration", () => {
    const fetchedAt = new Date("2026-04-01T00:00:00.000Z");
    const profile = buildDistressProfileFromPayload({
      payload: {
        underRekonstruksjonsforhandlingDato: "2026-03-01",
      },
      orgNumber: "123456789",
      fetchedAt,
      normalizedAt: fetchedAt,
    });

    expect(profile?.distressStatus).toBe("RECONSTRUCTION");
    expect(profile?.statusStartedAt?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(profile?.daysInStatus).toBe(31);
  });

  it("derives sector code from the two first digits of the industry code", () => {
    expect(getSectorCodeFromIndustryCode("43.210")).toBe("43");
    expect(getSectorCodeFromIndustryCode("01.110")).toBe("01");
    expect(getSectorCodeFromIndustryCode(null)).toBeNull();
  });

  it("calculates equity ratio only when equity and assets are present", () => {
    expect(calculateEquityRatio(25, 100)).toBe(25);
    expect(calculateEquityRatio(25, 0)).toBeNull();
    expect(calculateEquityRatio(null, 100)).toBeNull();
  });

  it("extracts interest-bearing debt conservatively from explicit debt fields", () => {
    expect(
      extractInterestBearingDebt({
        egenkapitalGjeld: {
          gjeldOversikt: {
            langsiktigGjeld: {
              gjeldTilKredittinstitusjoner: 1250000,
            },
          },
        },
      }),
    ).toBe(1250000);

    expect(
      extractInterestBearingDebt({
        egenkapitalGjeld: {
          gjeldOversikt: {
            sumGjeld: 5000000,
          },
        },
      }),
    ).toBeNull();
  });
});
