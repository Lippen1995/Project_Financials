import { describe, expect, it } from "vitest";

import {
  EQUITY_RATIO_CEILING,
  LIQUIDITY_RATIO_CEILING,
  buildDistressProfileFromPayload,
  calculateDistressScore,
  calculateEquityRatio,
  calculateLiquidityRatio,
  deriveDistressStatus,
  extractCurrentAssets,
  extractCurrentLiabilities,
  extractInterestBearingDebt,
  getSectorCodeFromIndustryCode,
  toHealthScore,
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

  it("caps the equity ratio of a shell whose assets have collapsed to a few kroner", () => {
    // A real case: -4 055 466 in equity against 1 krone of assets is -405 546 600 %.
    expect(calculateEquityRatio(-4_055_466, 1)).toBe(-EQUITY_RATIO_CEILING);
    expect(calculateEquityRatio(-150, 100)).toBe(-150);
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

  it("reads current assets and current liabilities from the normalized balance sheet", () => {
    const payload = {
      eiendeler: {
        omloepsmidler: {
          sumOmloepsmidler: 93716,
        },
      },
      egenkapitalGjeld: {
        gjeldOversikt: {
          kortsiktigGjeld: {
            sumKortsiktigGjeld: 89585,
          },
        },
      },
    };

    expect(extractCurrentAssets(payload)).toBe(93716);
    expect(extractCurrentLiabilities(payload)).toBe(89585);
    expect(extractCurrentAssets({})).toBeNull();
    expect(extractCurrentLiabilities({})).toBeNull();
  });

  it("calculates liquidity ratio only when both sides are present and non-zero", () => {
    expect(calculateLiquidityRatio(50, 100)).toBe(0.5);
    expect(calculateLiquidityRatio(150, 100)).toBe(1.5);
    expect(calculateLiquidityRatio(50, 0)).toBeNull();
    expect(calculateLiquidityRatio(null, 100)).toBeNull();
  });

  it("caps a liquidity ratio from near-zero short-term debt, which would otherwise overflow storage", () => {
    expect(calculateLiquidityRatio(10_000_000, 1)).toBe(LIQUIDITY_RATIO_CEILING);
    expect(calculateLiquidityRatio(-10_000_000, 1)).toBe(-LIQUIDITY_RATIO_CEILING);
    expect(calculateLiquidityRatio(999, 1)).toBe(999);
  });
});

describe("distress score", () => {
  it("returns null when no financial signal exists, so status alone never renders a health bar", () => {
    expect(
      calculateDistressScore({
        status: "BANKRUPTCY",
        daysInStatus: 400,
        equityRatio: null,
        liquidityRatio: null,
        ebit: null,
      }),
    ).toBeNull();
  });

  it("scores a bankrupt company with negative equity and no liquidity as severely distressed", () => {
    const score = calculateDistressScore({
      status: "BANKRUPTCY",
      daysInStatus: 400,
      equityRatio: -18,
      liquidityRatio: 0.31,
      ebit: -340,
      revenueTrend: [
        { fiscalYear: 2021, revenue: 3400 },
        { fiscalYear: 2025, revenue: 1200 },
      ],
    });

    // 45 status + 25 equity + 15 liquidity + 10 ebit + 5 revenue decline + 3 duration, clamped
    expect(score).toBe(100);
    expect(toHealthScore(score)).toBe(0);
  });

  it("scores a solvent company in voluntary liquidation as comparatively healthy", () => {
    const score = calculateDistressScore({
      status: "LIQUIDATION",
      daysInStatus: 30,
      equityRatio: 22,
      liquidityRatio: 0.95,
      ebit: -4,
      revenueTrend: [
        { fiscalYear: 2021, revenue: 90 },
        { fiscalYear: 2025, revenue: 100 },
      ],
    });

    // 22 status + 5 equity + 7 liquidity + 10 ebit
    expect(score).toBe(44);
    expect(toHealthScore(score)).toBe(56);
  });

  it("clamps to the 0-100 range and inverts into a health score", () => {
    expect(toHealthScore(null)).toBeNull();
    expect(toHealthScore(0)).toBe(100);

    const score = calculateDistressScore({
      status: "BANKRUPTCY",
      daysInStatus: 2000,
      equityRatio: -100,
      liquidityRatio: 0.01,
      ebit: -1000,
      revenueTrend: [
        { fiscalYear: 2021, revenue: 1000 },
        { fiscalYear: 2025, revenue: 1 },
      ],
    });

    expect(score).toBe(100);
  });

  it("ignores a revenue trend that is flat or growing", () => {
    const declining = calculateDistressScore({
      status: "RECONSTRUCTION",
      equityRatio: 20,
      revenueTrend: [
        { fiscalYear: 2021, revenue: 100 },
        { fiscalYear: 2025, revenue: 50 },
      ],
    });
    const growing = calculateDistressScore({
      status: "RECONSTRUCTION",
      equityRatio: 20,
      revenueTrend: [
        { fiscalYear: 2021, revenue: 100 },
        { fiscalYear: 2025, revenue: 120 },
      ],
    });

    expect(declining).toBe(40);
    expect(growing).toBe(35);
  });
});
