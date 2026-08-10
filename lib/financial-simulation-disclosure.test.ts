import { describe, expect, it } from "vitest";

import {
  SIMULATED_EXPORT_DISCLAIMER,
  SIMULATED_FINANCIALS_NOTICE,
  SIMULATED_LINE_MARKER,
  SIMULATED_LINE_NOTICE,
  buildFinancialDisclosure,
  financialDisclosureFor,
  isSimulatedStatementOrigin,
  isSyntheticValueOrigin,
  simulatedAnswerNotice,
} from "@/lib/financial-simulation-disclosure";

describe("financial simulation disclosure", () => {
  it("says nothing on a reported dataset", () => {
    expect(financialDisclosureFor("reported", "reported:21")).toEqual({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:21",
      simulated: false,
      notice: null,
    });
    expect(simulatedAnswerNotice(financialDisclosureFor("reported", "reported:21"))).toBeNull();
  });

  it("discloses a simulated dataset even when it holds no statements for the company", () => {
    // Otherwise the one company the demo has no figures for is the one that looks like it has an
    // honest reported gap.
    const disclosure = buildFinancialDisclosure({
      datasetMode: "simulated",
      financialDatasetVersion: "simulated:demo-1:3",
    });

    expect(disclosure.simulated).toBe(true);
    expect(disclosure.notice).toBe(SIMULATED_FINANCIALS_NOTICE);
  });

  it("names the dataset in an assistant's answer, in fixed words", () => {
    // Left to a model, the sentence comes out differently every time and a reader learns to skim
    // past it. One string, always the same, always with the version.
    const notice = simulatedAnswerNotice(
      financialDisclosureFor("simulated", "simulated:demo-1:3"),
    );

    expect(notice).toBe(`${SIMULATED_FINANCIALS_NOTICE}. Datasett: simulated:demo-1:3.`);
  });

  it("separates the statement claim from the line claim", () => {
    // A hybrid statement carries reported figures next to generated ones, so "this dataset is a
    // demo" and "this number was invented" are two different sentences and both are needed.
    expect(SIMULATED_FINANCIALS_NOTICE).not.toBe(SIMULATED_LINE_NOTICE);
    expect(SIMULATED_LINE_MARKER.length).toBeLessThanOrEqual(4);
    expect(SIMULATED_EXPORT_DISCLAIMER).toContain("synthetic");
  });

  it("treats hybrid statements as simulated and reported values as reported", () => {
    expect(isSimulatedStatementOrigin("hybrid")).toBe(true);
    expect(isSimulatedStatementOrigin("simulated")).toBe(true);
    expect(isSimulatedStatementOrigin("reported")).toBe(false);
    expect(isSyntheticValueOrigin("synthetic")).toBe(true);
    expect(isSyntheticValueOrigin("reported")).toBe(false);
  });
});
