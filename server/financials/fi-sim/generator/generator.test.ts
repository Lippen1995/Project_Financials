import { describe, expect, it } from "vitest";

import { FI_SIM_PROFILES, type FiSimProfileKey } from "../catalog/profiles";
import {
  FI_SIM_GENERATOR_VERSION,
  generateCompanyFinancials,
  type FiSimAnchor,
  type FiSimCompanyInput,
  type FiSimGeneratedPackage,
} from "./generator";
import { validatePackages } from "./validator";

const LATEST_COMPLETED_FISCAL_YEAR = 2025;

const PROFILE_INDUSTRY_CODES: Record<FiSimProfileKey, string | null> = {
  SERVICE: "62.010",
  TRADE: "47.111",
  MANUFACTURING_CONSTRUCTION: "41.200",
  PROPERTY: "68.209",
  HOLDING_INVESTMENT: "64.209",
  // No SN2007 code selects a dormant company, so the manifest classifies it by hand.
  DORMANT_PRE_REVENUE: null,
};

const profileKeys = Object.keys(FI_SIM_PROFILES) as FiSimProfileKey[];

function input(overrides: Partial<FiSimCompanyInput> = {}): FiSimCompanyInput {
  return {
    companyId: "company-1",
    orgNumber: "912345678",
    registeredAt: new Date("2005-03-14T00:00:00.000Z"),
    signals: { industryCode: "62.010", organisationForm: "AS" },
    fiscalYears: [2021, 2022, 2023, 2024, 2025],
    latestCompletedFiscalYear: LATEST_COMPLETED_FISCAL_YEAR,
    statementScope: "COMPANY",
    currency: "NOK",
    unitScale: 1,
    anchorsByFiscalYear: {},
    ...overrides,
  };
}

function forProfile(profile: FiSimProfileKey, overrides: Partial<FiSimCompanyInput> = {}) {
  const industryCode = PROFILE_INDUSTRY_CODES[profile];
  return input({
    signals: { industryCode, organisationForm: "AS" },
    ...(industryCode === null ? { profileOverride: profile } : {}),
    ...overrides,
  });
}

function anchor(conceptKey: string, value: bigint, id = `line-${conceptKey}`): FiSimAnchor {
  return {
    conceptKey,
    reportedFinancialLineItemId: id,
    value,
    currency: "NOK",
    unitScale: 1,
  };
}

function lineFor(pkg: FiSimGeneratedPackage, conceptKey: string) {
  return [...pkg.income.lines, ...pkg.balance.lines].find(
    (line) => line.conceptKey === conceptKey,
  );
}

function valueOf(pkg: FiSimGeneratedPackage, conceptKey: string) {
  const line = lineFor(pkg, conceptKey);
  if (!line) throw new Error(`${conceptKey} is not published on ${pkg.fiscalYear}`);
  return line.resolvedValue;
}

/** Byte-stable snapshot of everything the generator produces, BigInt included. */
function stableShape(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? `${item.toString()}n` : item,
  );
}

describe("FI-SIM generator determinism", () => {
  it("produces byte-identical output for the same input and versions", () => {
    const first = generateCompanyFinancials(input());
    const second = generateCompanyFinancials(input());

    expect(stableShape(first)).toBe(stableShape(second));
    expect(first.generatorVersion).toBe(FI_SIM_GENERATOR_VERSION);
  });

  it("gives two organisation numbers different figures", () => {
    const first = generateCompanyFinancials(input({ orgNumber: "912345678" }));
    const second = generateCompanyFinancials(input({ orgNumber: "998877665" }));

    expect(stableShape(first.packages)).not.toBe(stableShape(second.packages));
  });

  it("keeps a year's figures when the caller asks for a different span", () => {
    // The seed counts back from the newest closed year, so 2024 is 2024 whether it was asked for
    // alone or as the tail of a five-year request.
    const long = generateCompanyFinancials(input({ fiscalYears: [2022, 2023, 2024] }));
    const short = generateCompanyFinancials(input({ fiscalYears: [2024] }));
    const fromLong = long.packages.find((pkg) => pkg.fiscalYear === 2024);
    const fromShort = short.packages.find((pkg) => pkg.fiscalYear === 2024);

    expect(fromLong?.income.lines).toEqual(fromShort?.income.lines);
  });

  it("redraws when the reported anchors change", () => {
    const withoutAnchor = generateCompanyFinancials(input());
    const withAnchor = generateCompanyFinancials(
      input({ anchorsByFiscalYear: { 2025: [anchor("OperatingIncomeTotal", 12_000_000n)] } }),
    );

    expect(stableShape(withoutAnchor.packages)).not.toBe(stableShape(withAnchor.packages));
  });
});

describe("FI-SIM generator identities", () => {
  it.each(profileKeys)("%s balances exactly across every generated year", (profile) => {
    const generation = generateCompanyFinancials(forProfile(profile));

    expect(generation.failures).toEqual([]);
    expect(generation.packages).toHaveLength(5);
    expect(validatePackages(generation.packages)).toEqual({ valid: true, issues: [] });
    for (const pkg of generation.packages) {
      expect(valueOf(pkg, "AssetsTotal")).toBe(valueOf(pkg, "EquityAndLiabilitiesTotal"));
      expect(pkg.validationStatus).toBe("VALID");
      expect(pkg.residualAmount).toBeNull();
    }
  });

  it.each(profileKeys)("%s validates for a spread of companies and spans", (profile) => {
    // A property sweep rather than one fixture: the seed decides which optional lines a company
    // publishes, so a profile can only be called sound if the whole band of draws is sound.
    for (let index = 0; index < 40; index += 1) {
      const orgNumber = `9${(10_000_000 + index * 7919).toString().padStart(8, "0")}`.slice(0, 9);
      for (const years of [1, 3, 5]) {
        for (const statementScope of ["COMPANY", "CONSOLIDATED"] as const) {
          const fiscalYears = Array.from(
            { length: years },
            (_, offset) => LATEST_COMPLETED_FISCAL_YEAR - offset,
          );
          const generation = generateCompanyFinancials(
            forProfile(profile, { orgNumber, fiscalYears, statementScope }),
          );
          expect(generation.failures, `${orgNumber} ${profile}`).toEqual([]);
          expect(generation.packages).toHaveLength(years);
          expect(validatePackages(generation.packages).issues).toEqual([]);
        }
      }
    }
  });

  it("carries accumulated results from one year into the next", () => {
    const generation = generateCompanyFinancials(input());
    const ordered = [...generation.packages].sort((left, right) => left.fiscalYear - right.fiscalYear);

    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      expect(current.bridge.openingAccumulatedResults).toBe(
        valueOf(previous, "AccumulatedResults"),
      );
      expect(current.bridge.closingAccumulatedResults).toBe(
        valueOf(current, "AccumulatedResults"),
      );
      expect(
        current.bridge.openingAccumulatedResults +
          current.bridge.profitForPeriod -
          current.bridge.assumedDistribution +
          current.bridge.explicitCapitalAdjustment,
      ).toBe(current.bridge.closingAccumulatedResults);
    }
  });

  it("publishes a different line set for a shop than for a property company", () => {
    const trade = generateCompanyFinancials(forProfile("TRADE"));
    const property = generateCompanyFinancials(forProfile("PROPERTY"));
    const concepts = (generation: typeof trade) =>
      new Set(generation.packages[0].income.lines.map((line) => line.conceptKey));

    expect(concepts(trade).has("MerchandiseRevenue")).toBe(true);
    expect(concepts(trade).has("RentalRevenue")).toBe(false);
    expect(concepts(property).has("RentalRevenue")).toBe(true);
    expect(concepts(property).has("MerchandiseRevenue")).toBe(false);
  });

  it("never writes a metric key on a generated line", () => {
    // Spec section 11: a simulated line must arrive unmapped and be mapped by the same engine
    // that maps reported lines. There is no field here to write one into, and that is the point.
    const generation = generateCompanyFinancials(input());
    for (const line of generation.packages.flatMap((pkg) => pkg.income.lines)) {
      expect(Object.keys(line)).not.toContain("metricKey");
    }
  });
});

describe("FI-SIM generator anchors", () => {
  it("references reported anchors instead of copying them into synthetic values", () => {
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: {
          2025: [anchor("OperatingIncomeTotal", 100n), anchor("OperatingResult", 20n)],
        },
      }),
    );
    const pkg = generation.packages[0];
    const income = lineFor(pkg, "OperatingIncomeTotal");

    expect(income?.syntheticValue).toBeNull();
    expect(income?.reportedFinancialLineItemId).toBe("line-OperatingIncomeTotal");
    expect(income?.derivationRuleId).toBeNull();
    expect(income?.resolvedValue).toBe(100n);
    expect(pkg.income.statementOrigin).toBe("HYBRID");
  });

  it("solves the active cost lines to the difference the anchors leave", () => {
    // Spec section 9.3: reported revenue 100 and reported operating result 20 means the active
    // synthetic cost lines must total exactly 80.
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: {
          2025: [anchor("OperatingIncomeTotal", 100n), anchor("OperatingResult", 20n)],
        },
      }),
    );
    const pkg = generation.packages[0];
    const expenseChildren = pkg.income.lines.filter(
      (line) => line.presentationRole === "OperatingExpense",
    );

    expect(valueOf(pkg, "OperatingExpenseTotal")).toBe(80n);
    expect(expenseChildren.reduce((sum, line) => sum + line.resolvedValue, 0n)).toBe(80n);
    expect(expenseChildren.every((line) => line.syntheticValue !== null)).toBe(true);
  });

  it("absorbs a reported equity anchor through the bridge rather than moving it", () => {
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: { 2025: [anchor("EquityTotal", 4_000_000n)] },
      }),
    );
    const pkg = generation.packages[0];

    expect(valueOf(pkg, "EquityTotal")).toBe(4_000_000n);
    expect(lineFor(pkg, "EquityTotal")?.syntheticValue).toBeNull();
    expect(validatePackages([pkg]).issues).toEqual([]);
  });

  it("fails on anchors that contradict each other beyond the review tolerance", () => {
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: {
          2025: [
            anchor("OperatingIncomeTotal", 1_000_000n),
            anchor("OperatingExpenseTotal", 600_000n),
            anchor("OperatingResult", 250_000n),
          ],
        },
      }),
    );

    expect(generation.packages).toEqual([]);
    expect(generation.failures).toEqual([
      expect.objectContaining({ code: "CONTRADICTORY_REPORTED_ANCHORS", fiscalYear: 2025 }),
    ]);
  });

  it("shows a small contradiction as a rounding difference line", () => {
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: {
          2025: [
            anchor("OperatingIncomeTotal", 10_000_000n),
            anchor("OperatingExpenseTotal", 9_000_000n),
            anchor("OperatingResult", 1_000_050n),
          ],
        },
      }),
    );
    const pkg = generation.packages[0];

    expect(pkg.income.residuals).toEqual([{
      identityId: "OperatingResult",
      conceptKey: "RoundingDifferenceIncome",
      amount: 50n,
      severity: "ROUNDING",
    }]);
    expect(valueOf(pkg, "RoundingDifferenceIncome")).toBe(50n);
    expect(pkg.validationStatus).toBe("VALID");
    expect(validatePackages([pkg]).issues).toEqual([]);
  });

  it("marks a larger contradiction for manual review on its own line", () => {
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: {
          2025: [
            anchor("OperatingIncomeTotal", 10_000_000n),
            anchor("OperatingExpenseTotal", 9_000_000n),
            anchor("OperatingResult", 1_000_800n),
          ],
        },
      }),
    );
    const pkg = generation.packages[0];

    expect(pkg.income.residuals[0]?.conceptKey).toBe("UnallocatedResidualIncome");
    expect(pkg.income.residuals[0]?.severity).toBe("REVIEW");
    expect(pkg.validationStatus).toBe("MANUAL_REVIEW");
    expect(validatePackages([pkg]).issues).toEqual([]);
  });

  it("leaves the anchor records it was given byte-identical", () => {
    // The database-level version of this port lives in the foundation verification script, which
    // hashes the reported rows before and after a real dataset is written. This is the in-process
    // half: the generator must not mutate the anchor objects it is handed either.
    const anchors = {
      2024: [anchor("OperatingIncomeTotal", 8_000_000n), anchor("TaxExpense", 250_000n)],
      2025: [anchor("OperatingIncomeTotal", 9_000_000n), anchor("EquityTotal", 3_000_000n)],
    };
    const before = stableShape(anchors);

    generateCompanyFinancials(input({ fiscalYears: [2024, 2025], anchorsByFiscalYear: anchors }));

    expect(stableShape(anchors)).toBe(before);
  });

  it("refuses an anchor measured in another unit than the statement", () => {
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: {
          2025: [{ ...anchor("OperatingIncomeTotal", 100n), unitScale: 1000 }],
        },
      }),
    );

    expect(generation.failures).toEqual([
      expect.objectContaining({ code: "INVALID_UNIT_OR_CURRENCY" }),
    ]);
  });

  it("refuses an anchor with no reported line to reference", () => {
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2025],
        anchorsByFiscalYear: { 2025: [anchor("OperatingIncomeTotal", 100n, "")] },
      }),
    );

    expect(generation.failures).toEqual([
      expect.objectContaining({ code: "MISSING_REPORTED_ANCHOR_REFERENCE" }),
    ]);
  });
});

describe("FI-SIM generator periods and profiles", () => {
  it("never opens a period before the company existed", () => {
    const generation = generateCompanyFinancials(
      input({ registeredAt: new Date("2023-06-01T00:00:00.000Z") }),
    );

    expect(generation.packages.map((pkg) => pkg.fiscalYear)).toEqual([2024, 2025]);
    expect(generation.skipped.map((entry) => entry.fiscalYear)).toEqual([2021, 2022, 2023]);
    for (const pkg of generation.packages) {
      expect(pkg.periodStart.getTime()).toBeGreaterThanOrEqual(
        new Date("2023-06-01T00:00:00.000Z").getTime(),
      );
    }
  });

  it("never generates a fiscal year that has not closed", () => {
    const generation = generateCompanyFinancials(input({ fiscalYears: [2025, 2026] }));

    expect(generation.packages.map((pkg) => pkg.fiscalYear)).toEqual([2025]);
    expect(generation.skipped).toEqual([
      { fiscalYear: 2026, reason: "2026 is not a completed fiscal year" },
    ]);
  });

  it("refuses more than five years", () => {
    const generation = generateCompanyFinancials(
      input({ fiscalYears: [2020, 2021, 2022, 2023, 2024, 2025] }),
    );

    expect(generation.failures).toEqual([
      expect.objectContaining({ code: "INVALID_PERIOD" }),
    ]);
  });

  it("refuses a company whose founding date is unknown", () => {
    const generation = generateCompanyFinancials(input({ registeredAt: null }));

    expect(generation.packages).toEqual([]);
    expect(generation.failures).toEqual([
      expect.objectContaining({ code: "INVALID_PERIOD" }),
    ]);
  });

  it("gives banks and insurers no misleading general profile", () => {
    for (const industryCode of ["64.190", "65.120"]) {
      const generation = generateCompanyFinancials(
        input({ signals: { industryCode, organisationForm: "ASA" } }),
      );
      expect(generation.profile).toBeNull();
      expect(generation.packages).toEqual([]);
      expect(generation.failures).toEqual([
        expect.objectContaining({ code: "UNSUPPORTED_SIMULATION_PROFILE" }),
      ]);
    }
  });

  it("records which rule chose the profile", () => {
    const byIndustry = generateCompanyFinancials(forProfile("PROPERTY"));
    const byManifest = generateCompanyFinancials(forProfile("DORMANT_PRE_REVENUE"));

    expect(byIndustry.profileRuleId).toBe("industry.property");
    expect(byManifest.profileRuleId).toBe("manifest.explicit");
  });
});

describe("FI-SIM generator scale", () => {
  const reachHeadlines = {
    // Reach Subsea ASA's real group figures, in whole kroner.
    2025: { revenue: 2_677_042_000n, operatingProfit: 149_431_000n, netIncome: null, equity: 1_218_266_000n, assets: 3_605_794_000n },
    2024: { revenue: 2_717_702_000n, operatingProfit: 363_756_000n, netIncome: null, equity: 1_091_913_000n, assets: 3_247_702_000n },
    2023: { revenue: 1_995_903_000n, operatingProfit: 331_786_000n, netIncome: null, equity: 928_005_000n, assets: 2_687_882_000n },
  };

  it("publishes the figure the company reported when there is nothing to anchor to", () => {
    // A statement ingested from an annual report has headline figures and no line items, so the
    // schema has nothing to anchor. Inventing a number next to the reported one is worse than
    // useless — this is the defect that put 27 millioner beside a reported 2,7 milliarder.
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2023, 2024, 2025],
        statementScope: "CONSOLIDATED",
        reportedHeadlineByFiscalYear: reachHeadlines,
      }),
    );

    expect(generation.failures).toEqual([]);
    for (const pkg of generation.packages) {
      const expected = reachHeadlines[pkg.fiscalYear as keyof typeof reachHeadlines];
      expect(valueOf(pkg, "OperatingIncomeTotal")).toBe(expected.revenue);
      expect(valueOf(pkg, "OperatingResult")).toBe(expected.operatingProfit);
      expect(valueOf(pkg, "AssetsTotal")).toBe(expected.assets);
      expect(valueOf(pkg, "EquityTotal")).toBe(expected.equity);
    }
    expect(validatePackages(generation.packages).issues).toEqual([]);
  });

  it("sizes a year with no reported figures from the nearest year that has them", () => {
    // 2021 and 2022 have nothing. Without calibration they were drawn from an industry band and
    // came out two orders of magnitude below the years on either side.
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2021, 2022, 2023, 2024, 2025],
        statementScope: "CONSOLIDATED",
        reportedHeadlineByFiscalYear: reachHeadlines,
      }),
    );

    expect(generation.failures).toEqual([]);
    const revenueByYear = new Map(
      generation.packages.map((pkg) => [pkg.fiscalYear, valueOf(pkg, "OperatingIncomeTotal")]),
    );
    for (const fiscalYear of [2021, 2022]) {
      const revenue = revenueByYear.get(fiscalYear)!;
      // Within an order of magnitude of the nearest reported year, rather than 1/70th of it.
      expect(revenue).toBeGreaterThan(reachHeadlines[2023].revenue / 10n);
      expect(revenue).toBeLessThan(reachHeadlines[2023].revenue * 10n);
    }
  });

  it("keeps drawing from the profile band for a company that reported nothing at all", () => {
    const withHeadlines = generateCompanyFinancials(
      input({ fiscalYears: [2025], reportedHeadlineByFiscalYear: reachHeadlines }),
    );
    const without = generateCompanyFinancials(input({ fiscalYears: [2025] }));

    expect(valueOf(withHeadlines.packages[0], "OperatingIncomeTotal")).toBe(
      reachHeadlines[2025].revenue,
    );
    expect(valueOf(without.packages[0], "OperatingIncomeTotal")).not.toBe(
      reachHeadlines[2025].revenue,
    );
  });

  it("says on the line where a reported headline figure came from", () => {
    // The value is the reported one but the line is still synthetic, because it was not resolved
    // through a reported line item. The rule id is what tells the two apart afterwards.
    const generation = generateCompanyFinancials(
      input({ fiscalYears: [2024], reportedHeadlineByFiscalYear: reachHeadlines }),
    );
    const line = lineFor(generation.packages[0], "OperatingIncomeTotal");

    expect(line?.reportedFinancialLineItemId).toBeNull();
    expect(line?.syntheticValue).toBe(reachHeadlines[2024].revenue);
    expect(line?.derivationRuleId).toBe("calibration.reported-headline");
  });

  it("still lets a real anchor win over a headline figure", () => {
    // The headline is the fallback for a figure that could not be anchored. Where a line item does
    // exist, it is the anchor that binds — the headline never overrides it.
    const generation = generateCompanyFinancials(
      input({
        fiscalYears: [2024],
        reportedHeadlineByFiscalYear: {
          2024: {
            revenue: 2_717_702_000n,
            operatingProfit: null,
            netIncome: null,
            equity: null,
            assets: null,
          },
        },
        anchorsByFiscalYear: { 2024: [anchor("OperatingIncomeTotal", 2_500_000_000n)] },
      }),
    );
    const line = lineFor(generation.packages[0], "OperatingIncomeTotal");

    expect(line?.reportedFinancialLineItemId).toBe("line-OperatingIncomeTotal");
    expect(line?.syntheticValue).toBeNull();
    expect(line?.resolvedValue).toBe(2_500_000_000n);
  });
});
