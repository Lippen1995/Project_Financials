import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  parseLatestReportedCompanyMetricsSnapshot,
  parseLiveFinancialStatement,
  type LatestReportedCompanyMetrics,
  type LatestReportedCompanyMetricsSnapshot,
  type LiveFinancialLine,
  type LiveFinancialStatement,
} from "@/server/financials/live-financials-contract";

export type LiveFinancialStatementRecord = Omit<
  LiveFinancialStatement,
  "lines"
>;

export interface LiveFinancialsDataSource {
  readCompanyFinancials(companyId: string): Promise<{
    statements: readonly LiveFinancialStatementRecord[];
    lines: readonly LiveFinancialLine[];
  }>;
  readLatestReportedCompanyMetrics(): Promise<{
    financialDatasetVersion: string;
    statements: readonly LatestReportedCompanyMetrics[];
  }>;
}

export interface FinancialsRepository {
  listCompanyStatements(companyId: string): Promise<LiveFinancialStatement[]>;
  listLatestReportedCompanyMetrics(): Promise<LatestReportedCompanyMetricsSnapshot>;
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
          throw new Error(
            `Live financial line ${line.liveLineId} has no live statement`,
          );
        }
        const statementLines =
          linesByStatementId.get(line.liveStatementId) ?? [];
        statementLines.push(line);
        linesByStatementId.set(line.liveStatementId, statementLines);
      }

      return statementRecords
        .map((statement) =>
          parseLiveFinancialStatement({
            ...statement,
            lines: (
              linesByStatementId.get(statement.liveStatementId) ?? []
            ).sort((left, right) => left.sortOrder - right.sortOrder),
          }),
        )
        .sort((left, right) => right.fiscalYear - left.fiscalYear);
    },
    async listLatestReportedCompanyMetrics() {
      return parseLatestReportedCompanyMetricsSnapshot(
        await dataSource.readLatestReportedCompanyMetrics(),
      );
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
          await transaction.$executeRawUnsafe(
            "SET LOCAL app.fi_sim_enabled = 'on'",
          );
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
  async readLatestReportedCompanyMetrics() {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL app.deployment_environment = 'public'",
        );
        await transaction.$executeRawUnsafe(
          "SET LOCAL app.fi_sim_enabled = 'off'",
        );

        const [revision, statements] = await Promise.all([
          transaction.financialDatasetRevision.findUnique({
            where: { id: "global" },
            select: { reportedRevision: true },
          }),
          transaction.$queryRaw<LatestReportedCompanyMetrics[]>(Prisma.sql`
            WITH ranked_statements AS (
              SELECT
                statement.*,
                company."orgNumber",
                provenance."reportedSourceSystem",
                provenance."reportedSourceId",
                provenance."sourceFilingId",
                provenance."publishedAt",
                provenance."financialFetchedAt",
                provenance."financialNormalizedAt",
                row_number() OVER (
                  PARTITION BY statement."companyId", statement."statementScope"
                  ORDER BY statement."fiscalYear" DESC, statement."liveStatementId" ASC
                ) AS "scopeRank"
              FROM "live_financial_statements_v1" statement
              JOIN "reported_financial_statement_provenance_v1" provenance
                ON provenance."reportedStatementId" = statement."reportedStatementId"
              JOIN "Company" company ON company."id" = statement."companyId"
              WHERE statement."statementOrigin" = 'reported'
                AND provenance."reportedSourceSystem" = 'BRREG'
            ), pre_tax AS (
              SELECT
                line."liveStatementId",
                CASE
                  WHEN count(*) FILTER (
                    WHERE line."metricKey" = 'profit_before_tax'
                  ) = 1
                  THEN max(line."value" * line."unitScale") FILTER (
                    WHERE line."metricKey" = 'profit_before_tax'
                  )
                  ELSE NULL
                END AS "preTaxProfit",
                CASE
                  WHEN count(*) FILTER (
                    WHERE line."metricKey" = 'profit_before_tax'
                  ) > 1 THEN 'AMBIGUOUS'
                  WHEN count(*) FILTER (
                    WHERE line."metricKey" = 'profit_before_tax'
                  ) = 1
                    AND max(line."value") FILTER (
                      WHERE line."metricKey" = 'profit_before_tax'
                    ) IS NOT NULL THEN 'AVAILABLE'
                  ELSE 'MISSING'
                END AS "preTaxProfitStatus"
              FROM "live_financial_line_items_v1" line
              WHERE line."statementOrigin" = 'reported'
              GROUP BY line."liveStatementId"
            )
            SELECT
              statement."companyId",
              statement."reportedStatementId",
              statement."orgNumber",
              statement."fiscalYear",
              statement."statementScope",
              statement."currency",
              1 AS "unitScale",
              statement."revenue" * statement."unitScale" AS "revenue",
              statement."operatingProfit" * statement."unitScale" AS "ebit",
              pre_tax."preTaxProfit",
              COALESCE(pre_tax."preTaxProfitStatus", 'MISSING') AS "preTaxProfitStatus",
              statement."netIncome" * statement."unitScale" AS "netIncome",
              statement."equity" * statement."unitScale" AS "equity",
              statement."assets" * statement."unitScale" AS "totalAssets",
              statement."financialDatasetVersion",
              'reported'::text AS "valueOrigin",
              statement."reportedSourceSystem",
              statement."reportedSourceId",
              statement."sourceFilingId",
              statement."publishedAt",
              statement."financialFetchedAt",
              statement."financialNormalizedAt"
            FROM ranked_statements statement
            LEFT JOIN pre_tax ON pre_tax."liveStatementId" = statement."liveStatementId"
            WHERE statement."scopeRank" = 1
            ORDER BY statement."companyId", statement."statementScope"
          `),
        ]);

        return {
          financialDatasetVersion: `reported:${revision?.reportedRevision ?? 0n}`,
          statements,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  },
};

export const financialsRepository = createFinancialsRepository(
  prismaLiveFinancialsDataSource,
);
