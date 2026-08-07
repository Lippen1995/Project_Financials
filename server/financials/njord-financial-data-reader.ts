import type {
  FinancialDatasetMode,
  FinancialDatasetVersion,
  FinancialStatementOrigin,
  FinancialValueOrigin,
} from "@/lib/types";
import { prisma } from "@/lib/prisma";
import {
  financialsRepository,
  type FinancialsRepository,
} from "@/server/financials/financials-repository";

type CompanyIdentity = {
  id: string;
  orgNumber: string;
  name: string;
};

export type NjordDepreciationAmortizationLine = {
  liveLineId: string;
  value: bigint;
  currency: string;
  unitScale: number;
  valueOrigin: FinancialValueOrigin;
  financialDatasetVersion: FinancialDatasetVersion;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

export type NjordFinancialStatement = {
  liveStatementId: string;
  reportedStatementId: string | null;
  companyId: string;
  orgNumber: string;
  name: string;
  fiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  statementOrigin: FinancialStatementOrigin;
  financialDatasetVersion: FinancialDatasetVersion;
  currency: string;
  revenue: bigint | null;
  operatingProfit: bigint | null;
  netIncome: bigint | null;
  equity: bigint | null;
  assets: bigint | null;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
  depreciationAmortization: NjordDepreciationAmortizationLine | null;
};

export type NjordFinancialSnapshot = {
  financialDatasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statements: NjordFinancialStatement[];
};

export function createNjordFinancialDataReader(
  companyStore: {
    findCompanies(orgNumbers: string[]): Promise<CompanyIdentity[]>;
  },
  repository: Pick<FinancialsRepository, "getCompaniesFinancials">,
) {
  return {
    async readCompanies(orgNumbers: string[]): Promise<NjordFinancialSnapshot> {
      const companies = await companyStore.findCompanies(orgNumbers);
      const companyById = new Map(companies.map((company) => [company.id, company]));
      const financials = await repository.getCompaniesFinancials({
        companyIds: companies.map((company) => company.id),
      });
      if (financials.datasetMode === "simulated") {
        throw new Error(
          "Simulated Njord financial calculations require value-origin labeling before use.",
        );
      }

      return {
        financialDatasetMode: financials.datasetMode,
        financialDatasetVersion: financials.financialDatasetVersion,
        statements: financials.statements.flatMap((statement) => {
          const company = companyById.get(statement.companyId);
          if (!company) return [];
          const depreciationAmortizationLines = statement.lines.filter(
            (line) =>
              line.metricKey === "depreciation_amortization" &&
              line.value !== null,
          );
          const depreciationAmortization = depreciationAmortizationLines.length === 1
            ? depreciationAmortizationLines[0]
            : null;
          return [{
            liveStatementId: statement.liveStatementId,
            reportedStatementId: statement.reportedStatementId,
            companyId: statement.companyId,
            orgNumber: company.orgNumber,
            name: company.name,
            fiscalYear: statement.fiscalYear,
            statementScope: statement.statementScope,
            statementOrigin: statement.statementOrigin,
            financialDatasetVersion: statement.financialDatasetVersion,
            currency: statement.currency,
            revenue: statement.revenue,
            operatingProfit: statement.operatingProfit,
            netIncome: statement.netIncome,
            equity: statement.equity,
            assets: statement.assets,
            sourceSystem: statement.sourceSystem,
            sourceEntityType: statement.sourceEntityType,
            sourceId: statement.sourceId,
            fetchedAt: statement.fetchedAt,
            normalizedAt: statement.normalizedAt,
            depreciationAmortization: depreciationAmortization
              ? {
                  liveLineId: depreciationAmortization.liveLineId,
                  value: depreciationAmortization.value!,
                  currency: depreciationAmortization.currency,
                  unitScale: depreciationAmortization.unitScale,
                  valueOrigin: depreciationAmortization.valueOrigin,
                  financialDatasetVersion:
                    depreciationAmortization.financialDatasetVersion,
                  sourceSystem: depreciationAmortization.sourceSystem,
                  sourceEntityType: depreciationAmortization.sourceEntityType,
                  sourceId: depreciationAmortization.sourceId,
                  fetchedAt: depreciationAmortization.fetchedAt,
                  normalizedAt: depreciationAmortization.normalizedAt,
                }
              : null,
          }];
        }),
      };
    },
  };
}

export const njordFinancialDataReader = createNjordFinancialDataReader(
  {
    async findCompanies(orgNumbers) {
      return prisma.company.findMany({
        where: { orgNumber: { in: orgNumbers } },
        select: { id: true, orgNumber: true, name: true },
      });
    },
  },
  financialsRepository,
);
