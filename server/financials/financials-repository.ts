import { Prisma } from "@prisma/client";
import { z } from "zod";

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
>;
export type LiveCompanyFinancialHeadlines = {
  datasetMode: LiveFinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statements: LiveFinancialHeadline[];
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
}

export interface FinancialsRepository {
  getCompanyFinancials(reference: FinancialCompanyReference): Promise<LiveCompanyFinancials>;
  getCompaniesFinancials(query: FinancialCompaniesQuery): Promise<LiveCompanyFinancials>;
  getCompaniesFinancialHeadlines(
    query: FinancialCompaniesQuery,
  ): Promise<LiveCompanyFinancialHeadlines>;
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
  };
}

const prismaLiveFinancialsDataSource: LiveFinancialsDataSource = {
  async readCompanyFinancials(query) {
    return prisma.$transaction(
      async (transaction) => {
        if (isInvestorDemoFinancialSimulationEnabled()) {
          await transaction.$executeRawUnsafe(
            "SET LOCAL app.deployment_environment = 'investor-demo'",
          );
          await transaction.$executeRawUnsafe("SET LOCAL app.fi_sim_enabled = 'on'");
        }

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
          predicates.push(Prisma.sql`EXISTS (
                SELECT 1 FROM "Company" company
                WHERE company."id" = financial."companyId"
                  AND company."orgNumber" = ${query.orgNumber}
              )`);
        }
        const companyPredicate = Prisma.join(predicates, " AND ");
        const includeLines = !("companyIds" in query && query.includeLines === false);
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
