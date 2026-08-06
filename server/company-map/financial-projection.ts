import type { FinancialsRepository } from "@/server/financials/financials-repository";
import type {
  LatestReportedCompanyMetrics,
  LatestReportedCompanyMetricsSnapshot,
} from "@/server/financials/live-financials-contract";

const METRIC_KEYS = [
  "revenue",
  "ebit",
  "preTaxProfit",
  "netIncome",
  "equity",
  "totalAssets",
] as const;

type ReportedFinancialsReader = Pick<
  FinancialsRepository,
  "listLatestReportedCompanyMetrics"
>;

type ReportedCompanyMapFinancialProjection =
  LatestReportedCompanyMetricsSnapshot & {
    statementCount: number;
    financialEntityCount: number;
    metricCount: number;
    companyStatementCount: number;
    consolidatedStatementCount: number;
    sourceStatementCount: number;
    excludedStatementCount: number;
    excludedEntityCount: number;
  };

function summarizeProjection(
  financialDatasetVersion: string,
  statements: LatestReportedCompanyMetrics[],
  exclusions: {
    sourceStatementCount: number;
    excludedStatementCount: number;
    excludedEntityCount: number;
  },
): ReportedCompanyMapFinancialProjection {
  return {
    financialDatasetVersion,
    statements,
    statementCount: statements.length,
    financialEntityCount: new Set(
      statements.map((statement) => statement.orgNumber),
    ).size,
    metricCount: statements.reduce(
      (count, statement) =>
        count +
        METRIC_KEYS.filter((metricKey) => statement[metricKey] !== null).length,
      0,
    ),
    companyStatementCount: statements.filter(
      (statement) => statement.statementScope === "COMPANY",
    ).length,
    consolidatedStatementCount: statements.filter(
      (statement) => statement.statementScope === "CONSOLIDATED",
    ).length,
    ...exclusions,
  };
}

export async function loadReportedCompanyMapFinancialProjection(
  repository: ReportedFinancialsReader,
) {
  const snapshot = await repository.listLatestReportedCompanyMetrics();
  if (snapshot.statements.length === 0) {
    throw new Error(
      "Company-map financial projection has no reported statements.",
    );
  }

  return summarizeProjection(
    snapshot.financialDatasetVersion,
    snapshot.statements,
    {
      sourceStatementCount: snapshot.statements.length,
      excludedStatementCount: 0,
      excludedEntityCount: 0,
    },
  );
}

export function restrictReportedCompanyMapFinancialProjection(
  projection: ReportedCompanyMapFinancialProjection,
  registryOrgNumbers: ReadonlySet<string>,
): ReportedCompanyMapFinancialProjection {
  const statements = projection.statements.filter((statement) =>
    registryOrgNumbers.has(statement.orgNumber),
  );
  const excludedStatements = projection.statements.filter(
    (statement) => !registryOrgNumbers.has(statement.orgNumber),
  );

  if (statements.length === 0) {
    throw new Error(
      "Company-map financial projection has no statements in the current registry universe.",
    );
  }

  return summarizeProjection(projection.financialDatasetVersion, statements, {
    sourceStatementCount: projection.sourceStatementCount,
    excludedStatementCount:
      projection.excludedStatementCount + excludedStatements.length,
    excludedEntityCount:
      projection.excludedEntityCount +
      new Set(excludedStatements.map((statement) => statement.orgNumber)).size,
  });
}
