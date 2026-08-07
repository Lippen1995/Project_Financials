import type {
  FinancialDatasetMode,
  FinancialDatasetVersion,
  FinancialStatementOrigin,
} from "@/lib/types";
import {
  financialsRepository,
  type FinancialCompaniesQuery,
  type LiveCompanyFinancials,
} from "@/server/financials/financials-repository";
import { toSafeNumber } from "@/server/financials/number-utils";

export type WatchlistFinancialStatement = {
  year: number;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  equity: number | null;
  assets: number | null;
  statementOrigin: FinancialStatementOrigin;
  financialDatasetVersion: FinancialDatasetVersion;
};

export type WatchlistFinancialsSnapshot = {
  datasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statementsByCompany: Record<string, WatchlistFinancialStatement[]>;
};

type WatchlistFinancialsRepository = {
  getCompaniesFinancials(query: FinancialCompaniesQuery): Promise<LiveCompanyFinancials>;
};

export function createWatchlistFinancialsService(
  repository: WatchlistFinancialsRepository = financialsRepository,
) {
  return {
    async load(companyIds: string[]): Promise<WatchlistFinancialsSnapshot> {
      const snapshot = await repository.getCompaniesFinancials({
        companyIds,
        statementScope: "COMPANY",
      });
      if (snapshot.datasetMode === "simulated") {
        throw new Error(
          "Simulated watchlist financials require statement labeling before display.",
        );
      }
      const statementsByCompany: Record<string, WatchlistFinancialStatement[]> = {};

      for (const statement of snapshot.statements) {
        const statements = statementsByCompany[statement.companyId] ?? [];
        statements.push({
          year: statement.fiscalYear,
          revenue: toSafeNumber(statement.revenue),
          operatingProfit: toSafeNumber(statement.operatingProfit),
          netIncome: toSafeNumber(statement.netIncome),
          equity: toSafeNumber(statement.equity),
          assets: toSafeNumber(statement.assets),
          statementOrigin: statement.statementOrigin,
          financialDatasetVersion: statement.financialDatasetVersion,
        });
        statementsByCompany[statement.companyId] = statements;
      }

      for (const statements of Object.values(statementsByCompany)) {
        statements.sort((left, right) => left.year - right.year);
      }

      return {
        datasetMode: snapshot.datasetMode,
        financialDatasetVersion: snapshot.financialDatasetVersion,
        statementsByCompany,
      };
    },
  };
}

export const watchlistFinancialsService = createWatchlistFinancialsService();
