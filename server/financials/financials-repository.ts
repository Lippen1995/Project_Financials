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

export type CompanyMapMetricKey =
  | "revenue"
  | "ebit"
  | "preTaxProfit"
  | "netIncome"
  | "equity"
  | "totalAssets"
  | "employees";

export type CompanyMapFinancialQuery = {
  buildId: string;
  organisationForms: string[] | null;
  companyStatuses: Array<"ACTIVE" | "DISSOLVED" | "BANKRUPT">;
  statementScope: "COMPANY" | "CONSOLIDATED";
  currency: string;
};

export type CompanyMapFinancialRankingQuery = CompanyMapFinancialQuery & {
  officialAddressId: string | null;
  limit: number;
  offset: number;
};

export type CompanyMapFinancialRankingRow = {
  orgNumber: string;
  name: string;
  organisationForm: string | null;
  employeeCount: number | null;
  municipality: string | null;
  officialAddressId: string | null;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  groupRootOrgNumber: string | null;
  groupRootName: string | null;
  financial: LatestReportedCompanyMetrics | null;
};

export type CompanyMapFinancialRanking = {
  financialDatasetVersion: string;
  total: number;
  withRevenue: number;
  rows: CompanyMapFinancialRankingRow[];
};

export interface LiveFinancialsDataSource {
  readCompanyFinancials(companyId: string): Promise<{
    statements: readonly LiveFinancialStatementRecord[];
    lines: readonly LiveFinancialLine[];
  }>;
  readLatestReportedCompanyMetrics(): Promise<{
    financialDatasetVersion: string;
    statements: readonly LatestReportedCompanyMetrics[];
  }>;
  readCompanyMapFinancialRanking?(
    query: CompanyMapFinancialRankingQuery,
  ): Promise<CompanyMapFinancialRanking>;
  readCompanyMapMetricCoverage?(
    query: CompanyMapFinancialQuery & { metric: CompanyMapMetricKey },
  ): Promise<{
    financialDatasetVersion: string;
    withMetric: number;
    plottedWithMetric: number;
  }>;
}

export interface FinancialsRepository {
  listCompanyStatements(companyId: string): Promise<LiveFinancialStatement[]>;
  listLatestReportedCompanyMetrics(): Promise<LatestReportedCompanyMetricsSnapshot>;
  listCompanyMapFinancialRanking(
    query: CompanyMapFinancialRankingQuery,
  ): Promise<CompanyMapFinancialRanking>;
  getCompanyMapMetricCoverage(
    query: CompanyMapFinancialQuery & { metric: CompanyMapMetricKey },
  ): Promise<{
    financialDatasetVersion: string;
    withMetric: number;
    plottedWithMetric: number;
  }>;
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
    async listCompanyMapFinancialRanking(query) {
      if (!dataSource.readCompanyMapFinancialRanking) {
        throw new Error("Company-map financial ranking is unavailable.");
      }
      return dataSource.readCompanyMapFinancialRanking(query);
    },
    async getCompanyMapMetricCoverage(query) {
      if (!dataSource.readCompanyMapMetricCoverage) {
        throw new Error("Company-map metric coverage is unavailable.");
      }
      return dataSource.readCompanyMapMetricCoverage(query);
    },
  };
}

function companyMapLatestFinancialsCtes(
  query: Pick<CompanyMapFinancialQuery, "statementScope" | "currency">,
) {
  return Prisma.sql`
    ranked_statements AS (
      SELECT
        statement.*,
        company."orgNumber",
        row_number() OVER (
          PARTITION BY statement."companyId", statement."statementScope"
          ORDER BY statement."fiscalYear" DESC, statement."liveStatementId" ASC
        ) AS "scopeRank"
      FROM "live_financial_statements_v1" statement
      JOIN "Company" company ON company."id" = statement."companyId"
      WHERE statement."statementOrigin" = 'reported'
        AND statement."reportedSourceSystem" = 'BRREG'
        AND statement."statementScope" = ${query.statementScope}::"StatementScope"
    ),
    pre_tax AS (
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
    ),
    latest_financials AS (
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
        AND statement."currency" = ${query.currency}
    )
  `;
}

function companyMapEntityFilters(query: CompanyMapFinancialQuery) {
  const organisationForms = query.organisationForms
    ? Prisma.sql`entity."organisationForm" IN (${Prisma.join(query.organisationForms)})`
    : Prisma.sql`TRUE`;
  return Prisma.sql`
    entity."buildId" = ${query.buildId}::uuid
    AND ${organisationForms}
    AND entity."companyStatus"::text IN (${Prisma.join(query.companyStatuses)})
  `;
}

type CompanyMapFinancialRankingDatabaseRow = Omit<
  CompanyMapFinancialRankingRow,
  "financial"
> &
  Partial<LatestReportedCompanyMetrics> & {
    totalCount: bigint;
    withRevenueCount: bigint;
  };

const companyMapMetricExpressions: Record<CompanyMapMetricKey, Prisma.Sql> = {
  revenue: Prisma.sql`financial."revenue"`,
  ebit: Prisma.sql`financial."ebit"`,
  preTaxProfit: Prisma.sql`financial."preTaxProfit"`,
  netIncome: Prisma.sql`financial."netIncome"`,
  equity: Prisma.sql`financial."equity"`,
  totalAssets: Prisma.sql`financial."totalAssets"`,
  employees: Prisma.sql`entity."employeeCount"`,
};

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
                row_number() OVER (
                  PARTITION BY statement."companyId", statement."statementScope"
                  ORDER BY statement."fiscalYear" DESC, statement."liveStatementId" ASC
                ) AS "scopeRank"
              FROM "live_financial_statements_v1" statement
              JOIN "Company" company ON company."id" = statement."companyId"
              WHERE statement."statementOrigin" = 'reported'
                AND statement."reportedSourceSystem" = 'BRREG'
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
  async readCompanyMapFinancialRanking(query) {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL app.deployment_environment = 'public'",
        );
        await transaction.$executeRawUnsafe(
          "SET LOCAL app.fi_sim_enabled = 'off'",
        );
        const ctes = companyMapLatestFinancialsCtes(query);
        const filters = companyMapEntityFilters(query);
        const addressFilter = query.officialAddressId
          ? Prisma.sql`AND entity."officialAddressId" = ${query.officialAddressId}`
          : Prisma.empty;
        const [revision, [counts], rows] = await Promise.all([
          transaction.financialDatasetRevision.findUnique({
            where: { id: "global" },
            select: { reportedRevision: true },
          }),
          transaction.$queryRaw<
            Array<{ totalCount: bigint; withRevenueCount: bigint }>
          >(Prisma.sql`
            WITH ${ctes}
            SELECT
              (
                SELECT count(*)::bigint
                FROM "CompanyMapEntitySnapshot" entity
                WHERE ${filters}
                  AND entity."resolutionStatus" = 'MATCHED'
                  ${addressFilter}
              ) AS "totalCount",
              (
                SELECT count(*)::bigint
                FROM latest_financials financial
                JOIN "CompanyMapEntitySnapshot" entity
                  ON entity."buildId" = ${query.buildId}::uuid
                  AND entity."orgNumber" = financial."orgNumber"
                WHERE financial."revenue" IS NOT NULL
                  AND ${filters}
                  AND entity."resolutionStatus" = 'MATCHED'
                  ${addressFilter}
              ) AS "withRevenueCount"
          `),
          transaction.$queryRaw<CompanyMapFinancialRankingDatabaseRow[]>(
            Prisma.sql`
              WITH ${ctes}
              SELECT
                entity."orgNumber",
                entity."name",
                entity."organisationForm",
                entity."employeeCount",
                entity."municipality",
                entity."officialAddressId",
                entity."latitude",
                entity."longitude",
                entity."groupRootOrgNumber",
                entity."groupRootName",
                financial."companyId",
                financial."reportedStatementId",
                financial."fiscalYear",
                financial."statementScope",
                financial."currency",
                financial."unitScale",
                financial."revenue",
                financial."ebit",
                financial."preTaxProfit",
                financial."preTaxProfitStatus",
                financial."netIncome",
                financial."equity",
                financial."totalAssets",
                financial."financialDatasetVersion",
                financial."valueOrigin",
                financial."reportedSourceSystem",
                financial."reportedSourceId",
                financial."sourceFilingId",
                financial."publishedAt",
                financial."financialFetchedAt",
                financial."financialNormalizedAt",
                0::bigint AS "totalCount",
                0::bigint AS "withRevenueCount"
              FROM latest_financials financial
              JOIN "CompanyMapEntitySnapshot" entity
                ON entity."buildId" = ${query.buildId}::uuid
                AND entity."orgNumber" = financial."orgNumber"
              WHERE financial."revenue" IS NOT NULL
                AND ${filters}
                AND entity."resolutionStatus" = 'MATCHED'
                ${addressFilter}
              ORDER BY financial."revenue" DESC,
                entity."name" ASC, entity."orgNumber" ASC
              LIMIT ${query.limit}
              OFFSET ${query.offset}
            `,
          ),
        ]);
        const pageRows = [...rows];
        const total = Number(counts?.totalCount ?? 0n);
        const withRevenue = Number(counts?.withRevenueCount ?? 0n);
        const remaining = query.limit - pageRows.length;
        if (remaining > 0) {
          const nullRevenueOffset = Math.max(0, query.offset - withRevenue);
          pageRows.push(
            ...(await transaction.$queryRaw<
              CompanyMapFinancialRankingDatabaseRow[]
            >(Prisma.sql`
              WITH ${ctes}
              SELECT
                entity."orgNumber",
                entity."name",
                entity."organisationForm",
                entity."employeeCount",
                entity."municipality",
                entity."officialAddressId",
                entity."latitude",
                entity."longitude",
                entity."groupRootOrgNumber",
                entity."groupRootName",
                financial."companyId",
                financial."reportedStatementId",
                financial."fiscalYear",
                financial."statementScope",
                financial."currency",
                financial."unitScale",
                financial."revenue",
                financial."ebit",
                financial."preTaxProfit",
                financial."preTaxProfitStatus",
                financial."netIncome",
                financial."equity",
                financial."totalAssets",
                financial."financialDatasetVersion",
                financial."valueOrigin",
                financial."reportedSourceSystem",
                financial."reportedSourceId",
                financial."sourceFilingId",
                financial."publishedAt",
                financial."financialFetchedAt",
                financial."financialNormalizedAt",
                0::bigint AS "totalCount",
                0::bigint AS "withRevenueCount"
              FROM "CompanyMapEntitySnapshot" entity
              LEFT JOIN latest_financials financial
                ON financial."orgNumber" = entity."orgNumber"
              WHERE ${filters}
                AND entity."resolutionStatus" = 'MATCHED'
                AND financial."revenue" IS NULL
                ${addressFilter}
              ORDER BY entity."name" ASC, entity."orgNumber" ASC
              LIMIT ${remaining}
              OFFSET ${nullRevenueOffset}
            `)),
          );
        }
        const financialDatasetVersion = `reported:${revision?.reportedRevision ?? 0n}`;
        const parsedFinancials = parseLatestReportedCompanyMetricsSnapshot({
          financialDatasetVersion,
          statements: pageRows
            .filter(
              (row) => row.companyId !== null && row.companyId !== undefined,
            )
            .map((row) => ({
              companyId: row.companyId,
              reportedStatementId: row.reportedStatementId,
              orgNumber: row.orgNumber,
              fiscalYear: row.fiscalYear,
              statementScope: row.statementScope,
              currency: row.currency,
              unitScale: row.unitScale,
              revenue: row.revenue,
              ebit: row.ebit,
              preTaxProfit: row.preTaxProfit,
              preTaxProfitStatus: row.preTaxProfitStatus,
              netIncome: row.netIncome,
              equity: row.equity,
              totalAssets: row.totalAssets,
              financialDatasetVersion: row.financialDatasetVersion,
              valueOrigin: row.valueOrigin,
              reportedSourceSystem: row.reportedSourceSystem,
              reportedSourceId: row.reportedSourceId,
              sourceFilingId: row.sourceFilingId,
              publishedAt: row.publishedAt,
              financialFetchedAt: row.financialFetchedAt,
              financialNormalizedAt: row.financialNormalizedAt,
            })),
        });
        const financialByOrgNumber = new Map(
          parsedFinancials.statements.map((financial) => [
            financial.orgNumber,
            financial,
          ]),
        );
        return {
          financialDatasetVersion,
          total,
          withRevenue,
          rows: pageRows.map((row) => ({
            orgNumber: row.orgNumber,
            name: row.name,
            organisationForm: row.organisationForm,
            employeeCount: row.employeeCount,
            municipality: row.municipality,
            officialAddressId: row.officialAddressId,
            latitude: row.latitude,
            longitude: row.longitude,
            groupRootOrgNumber: row.groupRootOrgNumber,
            groupRootName: row.groupRootName,
            financial: financialByOrgNumber.get(row.orgNumber) ?? null,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  },
  async readCompanyMapMetricCoverage(query) {
    return prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SET LOCAL app.deployment_environment = 'public'",
        );
        await transaction.$executeRawUnsafe(
          "SET LOCAL app.fi_sim_enabled = 'off'",
        );
        const metricExpression = companyMapMetricExpressions[query.metric];
        const coverageQuery =
          query.metric === "employees"
            ? Prisma.sql`
                SELECT
                  count(entity."employeeCount")::bigint AS "withMetric",
                  count(entity."employeeCount") FILTER (
                    WHERE entity."resolutionStatus" = 'MATCHED'
                  )::bigint AS "plottedWithMetric"
                FROM "CompanyMapEntitySnapshot" entity
                WHERE ${companyMapEntityFilters(query)}
              `
            : Prisma.sql`
                WITH ${companyMapLatestFinancialsCtes(query)}
                SELECT
                  count(${metricExpression})::bigint AS "withMetric",
                  count(${metricExpression}) FILTER (
                    WHERE entity."resolutionStatus" = 'MATCHED'
                  )::bigint AS "plottedWithMetric"
                FROM latest_financials financial
                JOIN "CompanyMapEntitySnapshot" entity
                  ON entity."buildId" = ${query.buildId}::uuid
                  AND entity."orgNumber" = financial."orgNumber"
                WHERE ${companyMapEntityFilters(query)}
              `;
        const [revision, [coverage]] = await Promise.all([
          transaction.financialDatasetRevision.findUnique({
            where: { id: "global" },
            select: { reportedRevision: true },
          }),
          transaction.$queryRaw<
            Array<{ withMetric: bigint; plottedWithMetric: bigint }>
          >(coverageQuery),
        ]);
        return {
          financialDatasetVersion: `reported:${revision?.reportedRevision ?? 0n}`,
          withMetric: Number(coverage?.withMetric ?? 0n),
          plottedWithMetric: Number(coverage?.plottedWithMetric ?? 0n),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  },
};

export const financialsRepository = createFinancialsRepository(
  prismaLiveFinancialsDataSource,
);
