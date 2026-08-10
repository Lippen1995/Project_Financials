import { describe, expect, it, vi } from "vitest";

import {
  createDistressCompanyRecordReader,
  createDistressSnapshotWriteData,
  matchesActiveFinancialDataset,
} from "./distress-repository";

describe("distress company financial reader", () => {
  it("returns company data and financials from one versioned live snapshot", async () => {
    const company = {
      id: "company-1",
      orgNumber: "912345678",
      slug: "fjord-test",
      distressProfile: { distressStatus: "BANKRUPTCY" },
      distressFinancialSnapshot: null,
    };
    const findCompany = vi.fn().mockResolvedValue(company);
    const getCompanyFinancials = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:22",
      statements: [{
        liveStatementId: "reported:statement-1",
        fiscalYear: 2025,
        statementOrigin: "reported",
        financialDatasetVersion: "reported:22",
      }],
    });
    const read = createDistressCompanyRecordReader(
      { findCompany },
      { getCompanyFinancials },
    );

    const result = await read("fjord-test");

    expect(findCompany).toHaveBeenCalledWith("fjord-test");
    expect(getCompanyFinancials).toHaveBeenCalledWith({ companyId: "company-1" });
    expect(result).toMatchObject({
      id: "company-1",
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      financialStatements: [{
        liveStatementId: "reported:statement-1",
        fiscalYear: 2025,
      }],
    });
  });

  it("does not query financials when the company does not exist", async () => {
    const getCompanyFinancials = vi.fn();
    const read = createDistressCompanyRecordReader(
      { findCompany: vi.fn().mockResolvedValue(null) },
      { getCompanyFinancials },
    );

    await expect(read("missing")).resolves.toBeNull();
    expect(getCompanyFinancials).not.toHaveBeenCalled();
  });

  it("does not query financials for a company outside the distress universe", async () => {
    const getCompanyFinancials = vi.fn();
    const read = createDistressCompanyRecordReader(
      {
        findCompany: vi.fn().mockResolvedValue({
          id: "company-1",
          distressProfile: null,
        }),
      },
      { getCompanyFinancials },
    );

    await expect(read("company-1")).resolves.toBeNull();
    expect(getCompanyFinancials).not.toHaveBeenCalled();
  });

  it("returns simulated distress figures with the active dataset version attached", async () => {
    const read = createDistressCompanyRecordReader(
      { findCompany: vi.fn().mockResolvedValue({ id: "company-1" }) },
      {
        getCompanyFinancials: vi.fn().mockResolvedValue({
          datasetMode: "simulated",
          financialDatasetVersion: "simulated:demo-1:3",
          statements: [],
        }),
      },
    );

    // Every distress snapshot is stamped with the dataset version it was computed on, and
    // `matchesActiveFinancialDataset` drops one computed on any other. A simulated dataset is
    // therefore visible as itself rather than hidden behind a refusal.
    expect(await read("company-1")).toMatchObject({
      financialDatasetMode: "simulated",
      financialDatasetVersion: "simulated:demo-1:3",
    });
  });

  it("keeps the financial dataset version on derived distress snapshots", () => {
    const data = createDistressSnapshotWriteData("912345678", {
      distressStatus: "BANKRUPTCY",
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      updatedAt: new Date("2026-08-07T00:00:00.000Z"),
    });

    expect(data).toMatchObject({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
    });
  });

  it("rejects cached snapshots from inactive and unknown dataset versions", () => {
    const active = {
      financialDatasetMode: "reported" as const,
      financialDatasetVersion: "reported:22" as const,
    };

    expect(matchesActiveFinancialDataset({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
    }, active)).toBe(true);
    expect(matchesActiveFinancialDataset({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:21",
    }, active)).toBe(false);
    expect(matchesActiveFinancialDataset({
      financialDatasetMode: null,
      financialDatasetVersion: null,
    }, active)).toBe(false);
  });
});
