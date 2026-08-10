import { describe, expect, it } from "vitest";

import { generateCompanyFinancials, type FiSimGeneratedPackage } from "./generator";
import { validatePackage } from "./validator";

function samplePackage(): FiSimGeneratedPackage {
  const generation = generateCompanyFinancials({
    companyId: "company-1",
    orgNumber: "912345678",
    registeredAt: new Date("2010-01-01T00:00:00.000Z"),
    signals: { industryCode: "47.111", organisationForm: "AS" },
    fiscalYears: [2025],
    latestCompletedFiscalYear: 2025,
    statementScope: "COMPANY",
    currency: "NOK",
    unitScale: 1,
    anchorsByFiscalYear: {},
  });
  return generation.packages[0];
}

/** Deep-copies a package so a test can corrupt one line without touching the others. */
function tamper(
  change: (pkg: FiSimGeneratedPackage) => FiSimGeneratedPackage,
): FiSimGeneratedPackage {
  return change(samplePackage());
}

describe("FI-SIM validator", () => {
  it("accepts what the generator produced", () => {
    expect(validatePackage(samplePackage())).toEqual({ valid: true, issues: [] });
  });

  it("catches a total that no longer equals its children", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      income: {
        ...sample.income,
        lines: sample.income.lines.map((line) =>
          line.conceptKey === "OperatingIncomeTotal"
            ? { ...line, resolvedValue: line.resolvedValue + 1n, syntheticValue: line.resolvedValue + 1n }
            : line,
        ),
      },
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({ identityId: "OperatingIncomeTotal" }),
    );
  });

  it("catches a balance sheet whose sides stopped matching", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      balance: {
        ...sample.balance,
        lines: sample.balance.lines.map((line) =>
          line.conceptKey === "Cash"
            ? { ...line, resolvedValue: line.resolvedValue + 1_000n, syntheticValue: line.resolvedValue + 1_000n }
            : line,
        ),
      },
    }));

    expect(validatePackage(pkg).issues.map((issue) => issue.identityId)).toContain(
      "CurrentAssetsTotal",
    );
  });

  it("catches a synthetic value with no derivation rule", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      income: {
        ...sample.income,
        lines: sample.income.lines.map((line, index) =>
          index === 0 ? { ...line, derivationRuleId: null } : line,
        ),
      },
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/which rule derived it/) }),
    );
  });

  it("catches a line that both references an anchor and carries a value", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      income: {
        ...sample.income,
        lines: sample.income.lines.map((line, index) =>
          index === 0 ? { ...line, reportedFinancialLineItemId: "line-1" } : line,
        ),
      },
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(/reference a reported anchor or carry a synthetic value/),
      }),
    );
  });

  it("catches an anchor reference on a statement declared fully simulated", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      income: {
        ...sample.income,
        statementOrigin: "SIMULATED",
        lines: sample.income.lines.map((line, index) =>
          index === 0
            ? { ...line, reportedFinancialLineItemId: "line-1", syntheticValue: null, derivationRuleId: null }
            : line,
        ),
      },
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(/cannot reference a reported anchor/),
      }),
    );
  });

  it("catches a label that drifted away from the catalog", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      income: {
        ...sample.income,
        lines: sample.income.lines.map((line, index) =>
          index === 0 ? { ...line, sourceLabel: "Omsetning" } : line,
        ),
      },
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({ message: expect.stringMatching(/does not match the catalog/) }),
    );
  });

  it("catches a period that does not belong to its fiscal year", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      periodStart: new Date("2019-01-01T00:00:00.000Z"),
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({ identityId: "Period" }),
    );
  });

  it("catches a multi-year bridge whose steps do not add up", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      bridge: { ...sample.bridge, assumedDistribution: sample.bridge.assumedDistribution + 1n },
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({ identityId: "AccumulatedResultsBridge" }),
    );
  });

  it("refuses a residual that no published line carries", () => {
    const pkg = tamper((sample) => ({
      ...sample,
      income: {
        ...sample.income,
        residuals: [{
          identityId: "OperatingIncomeTotal",
          conceptKey: "RoundingDifferenceIncome",
          amount: 5n,
          severity: "ROUNDING",
        }],
      },
    }));

    const issues = validatePackage(pkg).issues;
    expect(issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(/does not carry the recorded differences/),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ identityId: "OperatingIncomeTotal" }),
    );
  });

  it("refuses a statement that absorbs two material contradictions", () => {
    // Several small rounding differences on one statement are ordinary. Two differences big
    // enough to need a human are not something a demo gets to net off against each other.
    const pkg = tamper((sample) => ({
      ...sample,
      income: {
        ...sample.income,
        residuals: [
          {
            identityId: "OperatingIncomeTotal",
            conceptKey: "UnallocatedResidualIncome",
            amount: 5n,
            severity: "REVIEW" as const,
          },
          {
            identityId: "ProfitBeforeTax",
            conceptKey: "UnallocatedResidualIncome",
            amount: 7n,
            severity: "REVIEW" as const,
          },
        ],
      },
    }));

    expect(validatePackage(pkg).issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringMatching(/two material contradictions/),
      }),
    );
  });
});
