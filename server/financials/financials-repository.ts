import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  parseLiveFinancialStatement,
  type FinancialDatasetVersion,
  type LiveFinancialLine,
  type LiveFinancialStatement,
} from "@/server/financials/live-financials-contract";

export type LiveFinancialStatementRecord = Omit<LiveFinancialStatement, "lines">;
export type LiveFinancialDatasetMode = "reported" | "simulated";
export type FinancialCompanyReference =
  | { companyId: string; orgNumber?: never }
  | { orgNumber: string; companyId?: never };
export type LiveCompanyFinancials = {
  datasetMode: LiveFinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statements: LiveFinancialStatement[];
};

export interface LiveFinancialsDataSource {
  readCompanyFinancials(reference: FinancialCompanyReference): Promise<{
    datasetMode: LiveFinancialDatasetMode;
    financialDatasetVersion: FinancialDatasetVersion;
    statements: readonly LiveFinancialStatementRecord[];
    lines: readonly LiveFinancialLine[];
  }>;
}

export interface FinancialsRepository {
  getCompanyFinancials(reference: FinancialCompanyReference): Promise<LiveCompanyFinancials>;
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
  async function getCompanyFinancials(
    reference: FinancialCompanyReference,
  ): Promise<LiveCompanyFinancials> {
    const {
      datasetMode,
      financialDatasetVersion,
      statements: statementRecords,
      lines: lineRecords,
    } = await dataSource.readCompanyFinancials(reference);
    if (!financialDatasetVersion.startsWith(`${datasetMode}:`)) {
      throw new Error(
        `Live financial datasetMode ${datasetMode} does not match version ${financialDatasetVersion}`,
      );
    }
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

    const statements = statementRecords
      .map((statement) =>
        parseLiveFinancialStatement({
          ...statement,
          lines: (linesByStatementId.get(statement.liveStatementId) ?? []).sort(
            (left, right) => left.sortOrder - right.sortOrder,
          ),
        }),
      )
      .sort((left, right) => right.fiscalYear - left.fiscalYear);

    if (
      statements.some(
        (statement) => statement.financialDatasetVersion !== financialDatasetVersion,
      )
    ) {
      throw new Error("Live statement dataset version does not match the active dataset");
    }

    return { datasetMode, financialDatasetVersion, statements };
  }

  return {
    getCompanyFinancials,
    async listCompanyStatements(companyId) {
      return (await getCompanyFinancials({ companyId })).statements;
    },
  };
}

const prismaLiveFinancialsDataSource: LiveFinancialsDataSource = {
  async readCompanyFinancials(reference) {
    return prisma.$transaction(
      async (transaction) => {
        if (isInvestorDemoFinancialSimulationEnabled()) {
          await transaction.$executeRawUnsafe(
            "SET LOCAL app.deployment_environment = 'investor-demo'",
          );
          await transaction.$executeRawUnsafe("SET LOCAL app.fi_sim_enabled = 'on'");
        }

        const companyPredicate =
          "companyId" in reference
            ? Prisma.sql`"companyId" = ${reference.companyId}`
            : Prisma.sql`EXISTS (
                SELECT 1 FROM "Company" company
                WHERE company."id" = financial."companyId"
                  AND company."orgNumber" = ${reference.orgNumber}
              )`;
        const [datasetRows, statements, lines] = await Promise.all([
          transaction.$queryRaw<
            Array<{
              datasetMode: LiveFinancialDatasetMode;
              financialDatasetVersion: FinancialDatasetVersion;
            }>
          >(Prisma.sql`
            SELECT "datasetMode", "financialDatasetVersion"
            FROM "live_financial_dataset_v1"
          `),
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
        "sourceSystem",
        "sourceEntityType",
        "sourceId",
        "fetchedAt",
        "normalizedAt",
        "rawPayload",
        "currency",
        "unitScale",
        "periodStart",
        "periodEnd",
        "revenue",
        "operatingProfit",
        "netIncome",
        "equity",
        "assets"
      FROM "live_financial_statements_v2" financial
      WHERE ${companyPredicate}
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
        "statementOrigin",
        "financialDatasetVersion",
        "taxonomyVersion",
        "generatorVersion",
        "currency",
        "unitScale",
        "sortOrder",
        "reportedSourceSystem",
        "reportedSourceId",
        "sourceSystem",
        "sourceEntityType",
        "sourceId",
        "fetchedAt",
        "normalizedAt",
        "rawPayload",
        "derivationRuleId"
      FROM "live_financial_line_items_v2" financial
      WHERE ${companyPredicate}
      ORDER BY "fiscalYear" DESC, "statementScope" ASC, "statementType" ASC, "sortOrder" ASC
          `),
        ]);

        const dataset = datasetRows[0];
        if (!dataset) {
          throw new Error("Live financial dataset metadata is unavailable");
        }

        return { ...dataset, statements, lines };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  },
};

export const financialsRepository = createFinancialsRepository(prismaLiveFinancialsDataSource);
