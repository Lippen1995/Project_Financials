import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  parseLiveFinancialStatement,
  type LiveFinancialLine,
  type LiveFinancialStatement,
} from "@/server/financials/live-financials-contract";

export type LiveFinancialStatementRecord = Omit<LiveFinancialStatement, "lines">;

export interface LiveFinancialsDataSource {
  readCompanyFinancials(companyId: string): Promise<{
    statements: readonly LiveFinancialStatementRecord[];
    lines: readonly LiveFinancialLine[];
  }>;
}

export interface FinancialsRepository {
  listCompanyStatements(companyId: string): Promise<LiveFinancialStatement[]>;
}

export function isInvestorDemoFinancialSimulationEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return (
    environment.FJORD_DEPLOYMENT_ENVIRONMENT === "investor-demo" &&
    environment.FJORD_FINANCIAL_SIMULATION_ENABLED === "true"
  );
}

export function createFinancialsRepository(
  dataSource: LiveFinancialsDataSource,
): FinancialsRepository {
  return {
    async listCompanyStatements(companyId) {
      const { statements: statementRecords, lines: lineRecords } =
        await dataSource.readCompanyFinancials(companyId);
      const linesByStatementId = new Map<string, LiveFinancialLine[]>();
      const knownStatementIds = new Set(
        statementRecords.map((statement) => statement.liveStatementId),
      );

      for (const line of lineRecords) {
        if (!knownStatementIds.has(line.liveStatementId)) {
          throw new Error(`Live financial line ${line.liveLineId} has no live statement`);
        }
        const statementLines = linesByStatementId.get(line.liveStatementId) ?? [];
        statementLines.push(line);
        linesByStatementId.set(line.liveStatementId, statementLines);
      }

      return statementRecords
        .map((statement) =>
          parseLiveFinancialStatement({
            ...statement,
            lines: (linesByStatementId.get(statement.liveStatementId) ?? []).sort(
              (left, right) => left.sortOrder - right.sortOrder,
            ),
          }),
        )
        .sort((left, right) => right.fiscalYear - left.fiscalYear);
    },
  };
}

const prismaLiveFinancialsDataSource: LiveFinancialsDataSource = {
  async readCompanyFinancials(companyId) {
    return prisma.$transaction(
      async (transaction) => {
        if (isInvestorDemoFinancialSimulationEnabled()) {
          await transaction.$executeRawUnsafe(
            "SET LOCAL app.deployment_environment = 'investor-demo'",
          );
          await transaction.$executeRawUnsafe("SET LOCAL app.fi_sim_enabled = 'on'");
        }

        const [statements, lines] = await Promise.all([
          transaction.$queryRaw<LiveFinancialStatementRecord[]>(Prisma.sql`
      SELECT
        "liveStatementId",
        "reportedStatementId",
        "companyId",
        "fiscalYear",
        "statementScope",
        "statementOrigin",
        "financialDatasetVersion",
        "taxonomyVersion",
        "generatorVersion",
        "currency",
        "unitScale",
        "periodStart",
        "periodEnd",
        "revenue",
        "operatingProfit",
        "netIncome",
        "equity",
        "assets"
      FROM "live_financial_statements_v1"
      WHERE "companyId" = ${companyId}
      ORDER BY "fiscalYear" DESC, "statementScope" ASC
          `),
          transaction.$queryRaw<LiveFinancialLine[]>(Prisma.sql`
      SELECT
        "liveLineId",
        "liveStatementId",
        "reportedFinancialLineItemId",
        "statementType",
        "conceptKey",
        "sourceLabel",
        "metricKey",
        "value",
        "valueOrigin",
        "financialDatasetVersion",
        "taxonomyVersion",
        "generatorVersion",
        "currency",
        "unitScale",
        "sortOrder",
        "reportedSourceSystem",
        "reportedSourceId"
      FROM "live_financial_line_items_v1"
      WHERE "companyId" = ${companyId}
      ORDER BY "fiscalYear" DESC, "statementScope" ASC, "statementType" ASC, "sortOrder" ASC
          `),
        ]);

        return { statements, lines };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  },
};

export const financialsRepository = createFinancialsRepository(prismaLiveFinancialsDataSource);
