import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { financialRuntimePrisma } from "@/server/financials/financial-runtime-client";
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
export type FinancialCompaniesQuery = {
  companyIds: string[];
  fiscalYear?: number;
  statementScope?: "COMPANY" | "CONSOLIDATED";
};
type FinancialReadQuery =
  | FinancialCompanyReference
  | (FinancialCompaniesQuery & { includeLines?: boolean });
export type LiveCompanyFinancials = {
  datasetMode: LiveFinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statements: LiveFinancialStatement[];
};
export type LiveFinancialHeadline = Pick<
  LiveFinancialStatementRecord,
  | "liveStatementId"
  | "companyId"
  | "fiscalYear"
  | "statementScope"
  | "statementOrigin"
  | "financialDatasetVersion"
  | "sourceSystem"
  | "sourceEntityType"
  | "sourceId"
  | "fetchedAt"
  | "normalizedAt"
  | "revenue"
  | "operatingProfit"
  | "netIncome"
  | "equity"
  | "assets"
>;
export type LiveCompanyFinancialHeadlines = {
  datasetMode: LiveFinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statements: LiveFinancialHeadline[];
};

/**
 * One headline per company, picked in the database rather than in the caller.
 *
 * Every universe-shaped surface used to load a page of companies, ask for every statement they
 * have, and then reduce to "the newest one" in JavaScript. That is the same selection written
 * three times with three different tie-breaks, and it reads line items nobody uses. The selection
 * belongs in one place and in one snapshot, so this is it.
 *
 * `scopePreference` decides the tie between a company statement and a group statement of the same
 * year — screening wants the group figures, search ranking wants the entity's own. Omitting it
 * leaves the newest normalisation to break the tie.
 */
export type FinancialUniverseQuery = {
  /** Restricts the search. Omitted means every company in the active dataset. */
  companyIds?: readonly string[];
  fiscalYear?: number;
  statementScope?: "COMPANY" | "CONSOLIDATED";
  scopePreference?: "COMPANY" | "CONSOLIDATED";
  /**
   * Applied in reported mode only. A caller that wants official figures says so here; in
   * simulated mode every statement carries FI-SIM provenance and the filter would empty the
   * result instead of narrowing it.
   */
  reportedSourceSystems?: readonly string[];
  limit: number;
};
export type LiveFinancialUniverse = {
  datasetMode: LiveFinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statements: LiveFinancialHeadline[];
  /** True when the active dataset holds more matching companies than `limit`. */
  truncated: boolean;
};

export type FinancialAggregateQuery = {
  companyIds?: readonly string[];
  fiscalYears?: readonly number[];
  statementScope?: "COMPANY" | "CONSOLIDATED";
  reportedSourceSystems?: readonly string[];
};
export type LiveFinancialAggregateTotal = {
  total: bigint | null;
  /** How many statements in the bucket carried the figure at all. */
  count: number;
};
/**
 * Buckets are keyed by currency and unit scale as well as by year and scope. Summing NOK against
 * EUR, or whole kroner against thousands, produces a number that is wrong without saying so.
 */
export type LiveFinancialAggregateBucket = {
  fiscalYear: number;
  statementScope: "COMPANY" | "CONSOLIDATED";
  currency: string;
  unitScale: number;
  statementCount: number;
  companyCount: number;
  revenue: LiveFinancialAggregateTotal;
  operatingProfit: LiveFinancialAggregateTotal;
  netIncome: LiveFinancialAggregateTotal;
  equity: LiveFinancialAggregateTotal;
  assets: LiveFinancialAggregateTotal;
};
export type LiveFinancialAggregate = {
  datasetMode: LiveFinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  buckets: LiveFinancialAggregateBucket[];
};

const liveFinancialHeadlineSchema = z
  .object({
    liveStatementId: z.string().min(1),
    companyId: z.string().min(1),
    fiscalYear: z.number().int(),
    statementScope: z.enum(["COMPANY", "CONSOLIDATED"]),
    statementOrigin: z.enum(["reported", "hybrid", "simulated"]),
    financialDatasetVersion: z.custom<FinancialDatasetVersion>((value) =>
      typeof value === "string" &&
      /^(?:reported:\d+|simulated:[A-Za-z0-9_-]+:\d+)$/.test(value),
    ),
    sourceSystem: z.string().min(1),
    sourceEntityType: z.string().min(1),
    sourceId: z.string().min(1),
    fetchedAt: z.date(),
    normalizedAt: z.date(),
    revenue: z.bigint().nullable(),
    operatingProfit: z.bigint().nullable(),
    netIncome: z.bigint().nullable(),
    equity: z.bigint().nullable(),
    assets: z.bigint().nullable(),
  })
  .superRefine((statement, context) => {
    const isReported = statement.statementOrigin === "reported";
    const expectedVersionPrefix = isReported ? "reported:" : "simulated:";
    if (!statement.liveStatementId.startsWith(expectedVersionPrefix)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["liveStatementId"],
        message: `Headline liveStatementId must start with ${expectedVersionPrefix}`,
      });
    }
    if (!statement.financialDatasetVersion.startsWith(expectedVersionPrefix)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["statementOrigin"],
        message: "Headline origin must match its financial dataset version.",
      });
    }
    if (
      !isReported &&
      (statement.sourceSystem !== "FI-SIM" ||
        statement.sourceEntityType !== "simulatedFinancialStatement" ||
        statement.sourceId !== statement.liveStatementId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceSystem"],
        message: "Simulated headlines require FI-SIM statement provenance.",
      });
    }
  });

export interface LiveFinancialsDataSource {
  readCompanyFinancials(query: FinancialReadQuery): Promise<{
    datasetMode: LiveFinancialDatasetMode;
    financialDatasetVersion: FinancialDatasetVersion;
    statements: readonly LiveFinancialStatementRecord[];
    lines: readonly LiveFinancialLine[];
  }>;
  searchCompanyUniverse(query: FinancialUniverseQuery): Promise<{
    datasetMode: LiveFinancialDatasetMode;
    financialDatasetVersion: FinancialDatasetVersion;
    statements: readonly LiveFinancialStatementRecord[];
    truncated: boolean;
  }>;
  aggregateCompanyFinancials(query: FinancialAggregateQuery): Promise<{
    datasetMode: LiveFinancialDatasetMode;
    financialDatasetVersion: FinancialDatasetVersion;
    buckets: readonly LiveFinancialAggregateBucket[];
  }>;
}

export interface FinancialsRepository {
  getCompanyFinancials(reference: FinancialCompanyReference): Promise<LiveCompanyFinancials>;
  getCompaniesFinancials(query: FinancialCompaniesQuery): Promise<LiveCompanyFinancials>;
  getCompaniesFinancialHeadlines(
    query: FinancialCompaniesQuery,
  ): Promise<LiveCompanyFinancialHeadlines>;
  listCompanyStatements(companyId: string): Promise<LiveFinancialStatement[]>;
  searchCompanyUniverse(query: FinancialUniverseQuery): Promise<LiveFinancialUniverse>;
  aggregateCompanyFinancials(query: FinancialAggregateQuery): Promise<LiveFinancialAggregate>;
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
  function validateDatasetVersion(
    datasetMode: LiveFinancialDatasetMode,
    financialDatasetVersion: FinancialDatasetVersion,
  ) {
    if (!financialDatasetVersion.startsWith(`${datasetMode}:`)) {
      throw new Error(
        `Live financial datasetMode ${datasetMode} does not match version ${financialDatasetVersion}`,
      );
    }
  }

  async function readFinancials(
    query: FinancialReadQuery,
  ): Promise<LiveCompanyFinancials> {
    const {
      datasetMode,
      financialDatasetVersion,
      statements: statementRecords,
      lines: lineRecords,
    } = await dataSource.readCompanyFinancials(query);
    validateDatasetVersion(datasetMode, financialDatasetVersion);
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
    getCompanyFinancials: readFinancials,
    getCompaniesFinancials: readFinancials,
    async getCompaniesFinancialHeadlines(query) {
      const snapshot = await dataSource.readCompanyFinancials({
        ...query,
        includeLines: false,
      });
      validateDatasetVersion(snapshot.datasetMode, snapshot.financialDatasetVersion);
      const statements = snapshot.statements.map((statement) =>
        liveFinancialHeadlineSchema.parse(statement),
      );
      if (
        statements.some(
          (statement) =>
            statement.financialDatasetVersion !== snapshot.financialDatasetVersion,
        )
      ) {
        throw new Error("Live statement dataset version does not match the active dataset");
      }
      return {
        datasetMode: snapshot.datasetMode,
        financialDatasetVersion: snapshot.financialDatasetVersion,
        statements,
      };
    },
    async listCompanyStatements(companyId) {
      return (await readFinancials({ companyId })).statements;
    },
    async searchCompanyUniverse(query) {
      if (query.limit < 1) {
        throw new Error("A live financial universe search needs a positive limit");
      }
      const snapshot = await dataSource.searchCompanyUniverse(query);
      validateDatasetVersion(snapshot.datasetMode, snapshot.financialDatasetVersion);
      const statements = snapshot.statements.map((statement) =>
        liveFinancialHeadlineSchema.parse(statement),
      );
      if (
        statements.some(
          (statement) =>
            statement.financialDatasetVersion !== snapshot.financialDatasetVersion,
        )
      ) {
        throw new Error("Live statement dataset version does not match the active dataset");
      }
      const companyIds = new Set(statements.map((statement) => statement.companyId));
      if (companyIds.size !== statements.length) {
        throw new Error("Live financial universe search returned a company twice");
      }
      return {
        datasetMode: snapshot.datasetMode,
        financialDatasetVersion: snapshot.financialDatasetVersion,
        statements,
        truncated: snapshot.truncated,
      };
    },
    async aggregateCompanyFinancials(query) {
      const snapshot = await dataSource.aggregateCompanyFinancials(query);
      validateDatasetVersion(snapshot.datasetMode, snapshot.financialDatasetVersion);
      return {
        datasetMode: snapshot.datasetMode,
        financialDatasetVersion: snapshot.financialDatasetVersion,
        buckets: snapshot.buckets.map((bucket) => ({ ...bucket })),
      };
    },
  };
}

type LiveDatasetRow = {
  datasetMode: LiveFinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
};

async function enterInvestorDemoSession(transaction: Prisma.TransactionClient) {
  if (!isInvestorDemoFinancialSimulationEnabled()) return;
  await transaction.$executeRawUnsafe(
    "SET LOCAL app.deployment_environment = 'investor-demo'",
  );
  await transaction.$executeRawUnsafe("SET LOCAL app.fi_sim_enabled = 'on'");
}

async function readLiveDataset(transaction: Prisma.TransactionClient) {
  const rows = await transaction.$queryRaw<LiveDatasetRow[]>(Prisma.sql`
    SELECT "datasetMode", "financialDatasetVersion"
    FROM "live_financial_dataset_v1"
  `);
  const dataset = rows[0];
  if (!dataset) {
    throw new Error("Live financial dataset metadata is unavailable");
  }
  return dataset;
}

/**
 * Source-system filtering only narrows a reported dataset. In simulated mode every statement
 * carries FI-SIM provenance, so applying a caller's "BRREG only" rule there would silently return
 * nothing rather than the demo figures the caller asked the live dataset for.
 */
function reportedSourcePredicate(
  dataset: LiveDatasetRow,
  reportedSourceSystems: readonly string[] | undefined,
): Prisma.Sql | null {
  if (dataset.datasetMode !== "reported" || !reportedSourceSystems) return null;
  if (reportedSourceSystems.length === 0) return Prisma.sql`FALSE`;
  return Prisma.sql`financial."sourceSystem" IN (${Prisma.join(reportedSourceSystems)})`;
}

function companyIdPredicate(companyIds: readonly string[] | undefined): Prisma.Sql | null {
  if (!companyIds) return null;
  return companyIds.length > 0
    ? Prisma.sql`financial."companyId" IN (${Prisma.join([...companyIds])})`
    : Prisma.sql`FALSE`;
}

type FinancialCompanyIdLookup = (orgNumber: string) => Promise<string | null>;

/**
 * Company identity is not financial data and is intentionally resolved before entering the
 * least-privilege financial transaction. The runtime principal can read only the live financial
 * views; letting an org-number predicate reach for Company inside that connection would either
 * weaken the role or make an otherwise valid demo fail closed.
 */
export async function resolveFinancialCompanyId(
  orgNumber: string,
  lookup: FinancialCompanyIdLookup = async (value) => {
    const company = await prisma.company.findUnique({
      where: { orgNumber: value },
      select: { id: true },
    });
    return company?.id ?? null;
  },
) {
  return lookup(orgNumber);
}

const prismaLiveFinancialsDataSource: LiveFinancialsDataSource = {
  async readCompanyFinancials(query) {
    const resolvedCompanyId = "orgNumber" in query && query.orgNumber
      ? await resolveFinancialCompanyId(query.orgNumber)
      : null;
    return financialRuntimePrisma().$transaction(
      async (transaction) => {
        await enterInvestorDemoSession(transaction);

        const predicates: Prisma.Sql[] = [];
        if ("companyIds" in query) {
          predicates.push(
            query.companyIds.length > 0
              ? Prisma.sql`financial."companyId" IN (${Prisma.join(query.companyIds)})`
              : Prisma.sql`FALSE`,
          );
          if (query.fiscalYear !== undefined) {
            predicates.push(Prisma.sql`financial."fiscalYear" = ${query.fiscalYear}`);
          }
          if (query.statementScope !== undefined) {
            predicates.push(
              Prisma.sql`financial."statementScope" = ${query.statementScope}::"StatementScope"`,
            );
          }
        } else if ("companyId" in query) {
          predicates.push(Prisma.sql`financial."companyId" = ${query.companyId}`);
        } else {
          predicates.push(
            resolvedCompanyId
              ? Prisma.sql`financial."companyId" = ${resolvedCompanyId}`
              : Prisma.sql`FALSE`,
          );
        }
        const companyPredicate = Prisma.join(predicates, " AND ");
        const includeLines = !("companyIds" in query && query.includeLines === false);
        const [dataset, statements, lines] = await Promise.all([
          readLiveDataset(transaction),
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
          includeLines
            ? transaction.$queryRaw<LiveFinancialLine[]>(Prisma.sql`
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
          `)
            : Promise.resolve([]),
        ]);

        return { ...dataset, statements, lines };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        // Full-universe FI-SIM generation reads every reported anchor in one snapshot. The
        // default five-second interactive-transaction timeout is suitable for request-sized
        // reads, but it aborts that explicit background job before Postgres can return the
        // snapshot. Keep one transaction (rather than batching across revisions) and give the
        // bounded read enough time to complete.
        timeout: 60_000,
      },
    );
  },

  async searchCompanyUniverse(query) {
    return financialRuntimePrisma().$transaction(
      async (transaction) => {
        await enterInvestorDemoSession(transaction);
        const dataset = await readLiveDataset(transaction);

        const predicates = [
          companyIdPredicate(query.companyIds),
          query.fiscalYear === undefined
            ? null
            : Prisma.sql`financial."fiscalYear" = ${query.fiscalYear}`,
          query.statementScope === undefined
            ? null
            : Prisma.sql`financial."statementScope" = ${query.statementScope}::"StatementScope"`,
          reportedSourcePredicate(dataset, query.reportedSourceSystems),
        ].filter((predicate): predicate is Prisma.Sql => predicate !== null);
        const where = predicates.length > 0
          ? Prisma.join(predicates, " AND ")
          : Prisma.sql`TRUE`;
        // Omitted rather than ordered by a constant when there is no preference: a bare integer
        // in ORDER BY is a column position, not a value. The trailing live statement ID makes the
        // order total, so two statements that agree on year, scope and normalisation still come
        // out in the same order on every run.
        const scopeOrder = query.scopePreference === undefined
          ? Prisma.empty
          : Prisma.sql`CASE WHEN financial."statementScope" = ${query.scopePreference}::"StatementScope" THEN 0 ELSE 1 END ASC,`;

        const rows = await transaction.$queryRaw<LiveFinancialStatementRecord[]>(Prisma.sql`
          SELECT * FROM (
            SELECT DISTINCT ON (financial."companyId")
              financial."liveStatementId",
              financial."reportedStatementId",
              financial."companyId",
              financial."fiscalYear",
              financial."statementScope",
              financial."statementOrigin",
              financial."financialDatasetVersion",
              financial."taxonomyVersion",
              financial."generatorVersion",
              financial."sourceSystem",
              financial."sourceEntityType",
              financial."sourceId",
              financial."fetchedAt",
              financial."normalizedAt",
              financial."rawPayload",
              financial."currency",
              financial."unitScale",
              financial."periodStart",
              financial."periodEnd",
              financial."revenue",
              financial."operatingProfit",
              financial."netIncome",
              financial."equity",
              financial."assets"
            FROM "live_financial_statements_v2" financial
            WHERE ${where}
            ORDER BY
              financial."companyId" ASC,
              financial."fiscalYear" DESC,
              ${scopeOrder}
              financial."normalizedAt" DESC,
              financial."liveStatementId" ASC
          ) latest
          ORDER BY latest."companyId" ASC
          LIMIT ${query.limit + 1}
        `);

        return {
          ...dataset,
          statements: rows.slice(0, query.limit),
          truncated: rows.length > query.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  },

  async aggregateCompanyFinancials(query) {
    return financialRuntimePrisma().$transaction(
      async (transaction) => {
        await enterInvestorDemoSession(transaction);
        const dataset = await readLiveDataset(transaction);

        const predicates = [
          companyIdPredicate(query.companyIds),
          query.fiscalYears === undefined
            ? null
            : query.fiscalYears.length > 0
              ? Prisma.sql`financial."fiscalYear" IN (${Prisma.join([...query.fiscalYears])})`
              : Prisma.sql`FALSE`,
          query.statementScope === undefined
            ? null
            : Prisma.sql`financial."statementScope" = ${query.statementScope}::"StatementScope"`,
          reportedSourcePredicate(dataset, query.reportedSourceSystems),
        ].filter((predicate): predicate is Prisma.Sql => predicate !== null);
        const where = predicates.length > 0
          ? Prisma.join(predicates, " AND ")
          : Prisma.sql`TRUE`;

        const rows = await transaction.$queryRaw<
          Array<{
            fiscalYear: number;
            statementScope: "COMPANY" | "CONSOLIDATED";
            currency: string;
            unitScale: number;
            statementCount: number;
            companyCount: number;
            revenueTotal: bigint | null;
            revenueCount: number;
            operatingProfitTotal: bigint | null;
            operatingProfitCount: number;
            netIncomeTotal: bigint | null;
            netIncomeCount: number;
            equityTotal: bigint | null;
            equityCount: number;
            assetsTotal: bigint | null;
            assetsCount: number;
          }>
        >(Prisma.sql`
          SELECT
            financial."fiscalYear",
            financial."statementScope",
            financial."currency",
            financial."unitScale",
            COUNT(*)::int AS "statementCount",
            COUNT(DISTINCT financial."companyId")::int AS "companyCount",
            -- SUM over bigint is numeric in Postgres, which would arrive as a decimal and turn a
            -- kroner total into a float somewhere downstream. Money stays integral all the way.
            SUM(financial."revenue")::bigint AS "revenueTotal",
            COUNT(financial."revenue")::int AS "revenueCount",
            SUM(financial."operatingProfit")::bigint AS "operatingProfitTotal",
            COUNT(financial."operatingProfit")::int AS "operatingProfitCount",
            SUM(financial."netIncome")::bigint AS "netIncomeTotal",
            COUNT(financial."netIncome")::int AS "netIncomeCount",
            SUM(financial."equity")::bigint AS "equityTotal",
            COUNT(financial."equity")::int AS "equityCount",
            SUM(financial."assets")::bigint AS "assetsTotal",
            COUNT(financial."assets")::int AS "assetsCount"
          FROM "live_financial_statements_v2" financial
          WHERE ${where}
          GROUP BY
            financial."fiscalYear",
            financial."statementScope",
            financial."currency",
            financial."unitScale"
          ORDER BY
            financial."fiscalYear" DESC,
            financial."statementScope" ASC,
            financial."currency" ASC,
            financial."unitScale" ASC
        `);

        return {
          ...dataset,
          buckets: rows.map((row) => ({
            fiscalYear: row.fiscalYear,
            statementScope: row.statementScope,
            currency: row.currency,
            unitScale: row.unitScale,
            statementCount: row.statementCount,
            companyCount: row.companyCount,
            revenue: { total: row.revenueTotal, count: row.revenueCount },
            operatingProfit: {
              total: row.operatingProfitTotal,
              count: row.operatingProfitCount,
            },
            netIncome: { total: row.netIncomeTotal, count: row.netIncomeCount },
            equity: { total: row.equityTotal, count: row.equityCount },
            assets: { total: row.assetsTotal, count: row.assetsCount },
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  },
};

export const financialsRepository = createFinancialsRepository(prismaLiveFinancialsDataSource);
