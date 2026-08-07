import { describe, expect, it, vi } from "vitest";

import {
  assertFinancialEvidenceDataset,
  createDdFinancialEvidenceReader,
} from "./dd-financial-evidence-reader";

const timestamp = new Date("2026-08-07T00:00:00.000Z");

function statement(overrides: Record<string, unknown> = {}) {
  return {
    liveStatementId: "reported:statement-company",
    reportedStatementId: "statement-company",
    companyId: "company-1",
    fiscalYear: 2025,
    statementScope: "COMPANY",
    statementOrigin: "reported",
    financialDatasetVersion: "reported:22",
    sourceSystem: "BRREG",
    sourceEntityType: "annual-account",
    sourceId: "source-company",
    fetchedAt: timestamp,
    normalizedAt: timestamp,
    ...overrides,
  };
}

describe("DD financial evidence reader", () => {
  it("returns one reported headline per year with dataset provenance", async () => {
    const getCompanyFinancials = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:22",
      statements: [
        statement(),
        statement({
          liveStatementId: "reported:statement-group",
          reportedStatementId: "statement-group",
          statementScope: "CONSOLIDATED",
          sourceId: "source-group",
        }),
        statement({
          liveStatementId: "reported:statement-2024",
          reportedStatementId: "statement-2024",
          fiscalYear: 2024,
          sourceId: "source-2024",
        }),
      ],
    });
    const reader = createDdFinancialEvidenceReader({ getCompanyFinancials });

    const result = await reader.loadCompanyStatements("company-1");

    expect(getCompanyFinancials).toHaveBeenCalledWith({ companyId: "company-1" });
    expect(result).toMatchObject({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      statements: [
        {
          id: "statement-group",
          liveStatementId: "reported:statement-group",
          reportedStatementId: "statement-group",
          fiscalYear: 2025,
        },
        {
          id: "statement-2024",
          liveStatementId: "reported:statement-2024",
          reportedStatementId: "statement-2024",
          fiscalYear: 2024,
        },
      ],
    });
  });

  it("resolves a reported live ID to the existing reported foreign key", async () => {
    const getCompanyFinancials = vi.fn().mockResolvedValue({
      datasetMode: "reported",
      financialDatasetVersion: "reported:22",
      statements: [statement()],
    });
    const reader = createDdFinancialEvidenceReader({ getCompanyFinancials });

    const result = await reader.resolveReportedStatement(
      "company-1",
      "reported:statement-company",
    );

    expect(result).toMatchObject({
      liveStatementId: "reported:statement-company",
      reportedStatementId: "statement-company",
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
    });
  });

  it("continues to resolve the legacy reported statement ID", async () => {
    const reader = createDdFinancialEvidenceReader({
      getCompanyFinancials: vi.fn().mockResolvedValue({
        datasetMode: "reported",
        financialDatasetVersion: "reported:22",
        statements: [statement()],
      }),
    });

    await expect(
      reader.resolveReportedStatement("company-1", "statement-company"),
    ).resolves.toMatchObject({ reportedStatementId: "statement-company" });
  });

  it("blocks synthetic statements from reported evidence foreign keys", async () => {
    const getCompanyFinancials = vi.fn().mockResolvedValue({
      datasetMode: "simulated",
      financialDatasetVersion: "simulated:demo-1:3",
      statements: [statement({
        liveStatementId: "simulated:statement-1",
        reportedStatementId: null,
        statementOrigin: "simulated",
        financialDatasetVersion: "simulated:demo-1:3",
        sourceSystem: "FI-SIM",
      })],
    });
    const reader = createDdFinancialEvidenceReader({ getCompanyFinancials });

    await expect(
      reader.resolveReportedStatement("company-1", "simulated:statement-1"),
    ).rejects.toThrow(/synthetic|simulated/i);
  });

  it("blocks reported evidence mutations while the simulated dataset is active", async () => {
    const reader = createDdFinancialEvidenceReader({
      getCompanyFinancials: vi.fn().mockResolvedValue({
        datasetMode: "simulated",
        financialDatasetVersion: "simulated:demo-1:3",
        statements: [statement()],
      }),
    });

    await expect(
      reader.resolveReportedStatement("company-1", "statement-company"),
    ).rejects.toThrow(/labeling/i);
  });

  it("fails closed when simulated evidence cannot yet be labeled in the DD UI", async () => {
    const reader = createDdFinancialEvidenceReader({
      getCompanyFinancials: vi.fn().mockResolvedValue({
        datasetMode: "simulated",
        financialDatasetVersion: "simulated:demo-1:3",
        statements: [],
      }),
    });

    await expect(reader.loadCompanyStatements("company-1")).rejects.toThrow(/labeling/i);
  });

  it("rejects persisted evidence from inactive or unknown datasets", () => {
    const active = {
      financialDatasetMode: "reported" as const,
      financialDatasetVersion: "reported:22" as const,
    };

    expect(() => assertFinancialEvidenceDataset({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
    }, active)).not.toThrow();
    expect(() => assertFinancialEvidenceDataset({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:21",
    }, active)).toThrow(/inactive/i);
    expect(() => assertFinancialEvidenceDataset({
      financialDatasetMode: null,
      financialDatasetVersion: null,
    }, active)).toThrow(/unversioned/i);
    expect(() => assertFinancialEvidenceDataset({
      financialDatasetMode: "reported",
      financialDatasetVersion: "reported:22",
      financialDatasetQuarantined: true,
    }, active)).toThrow(/quarantined/i);
  });
});
