import {
  buildFinancialDisclosure,
  type FinancialDisclosure,
} from "@/lib/financial-simulation-disclosure";
import type {
  FinancialDatasetMode,
  FinancialDatasetVersion,
  FinancialStatementOrigin,
} from "@/lib/types";
import {
  financialsRepository,
  type FinancialsRepository,
  type LiveCompanyFinancials,
} from "@/server/financials/financials-repository";

export type DdFinancialEvidenceStatement = {
  id: string;
  liveStatementId: string;
  reportedStatementId: string | null;
  fiscalYear: number;
  statementOrigin: FinancialStatementOrigin;
  financialDatasetVersion: FinancialDatasetVersion;
  sourceSystem: string;
  sourceEntityType: string;
  sourceId: string;
  fetchedAt: Date;
  normalizedAt: Date;
};

export type FinancialDatasetIdentity = {
  financialDatasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
};

export function assertFinancialEvidenceDataset(
  evidence: {
    financialDatasetMode: string | null;
    financialDatasetVersion: string | null;
    financialDatasetQuarantined?: boolean;
  },
  activeDataset: FinancialDatasetIdentity,
) {
  if (evidence.financialDatasetQuarantined) {
    throw new Error(
      "Financial evidence is quarantined because its original dataset version is unknown.",
    );
  }
  if (
    evidence.financialDatasetMode !== activeDataset.financialDatasetMode ||
    evidence.financialDatasetVersion !== activeDataset.financialDatasetVersion
  ) {
    throw new Error(
      "Financial evidence belongs to an inactive or unversioned financial dataset.",
    );
  }
}

function selectHeadlineStatements(snapshot: LiveCompanyFinancials) {
  const statementByYear = new Map<number, LiveCompanyFinancials["statements"][number]>();
  for (const statement of snapshot.statements) {
    const current = statementByYear.get(statement.fiscalYear);
    if (
      !current ||
      (statement.statementScope === "CONSOLIDATED" &&
        current.statementScope !== "CONSOLIDATED")
    ) {
      statementByYear.set(statement.fiscalYear, statement);
    }
  }
  return [...statementByYear.values()].sort(
    (left, right) => right.fiscalYear - left.fiscalYear,
  );
}

export function createDdFinancialEvidenceReader(
  repository: Pick<FinancialsRepository, "getCompanyFinancials"> = financialsRepository,
) {
  async function read(companyId: string) {
    return repository.getCompanyFinancials({ companyId });
  }

  return {
    async loadCompanyStatements(companyId: string): Promise<{
      financialDatasetMode: FinancialDatasetMode;
      financialDatasetVersion: FinancialDatasetVersion;
      disclosure: FinancialDisclosure;
      statements: DdFinancialEvidenceStatement[];
    }> {
      const snapshot = await read(companyId);
      return {
        financialDatasetMode: snapshot.datasetMode,
        financialDatasetVersion: snapshot.financialDatasetVersion,
        disclosure: buildFinancialDisclosure(snapshot),
        statements: selectHeadlineStatements(snapshot).map((statement) => ({
          id: statement.reportedStatementId ?? statement.liveStatementId,
          liveStatementId: statement.liveStatementId,
          reportedStatementId: statement.reportedStatementId,
          fiscalYear: statement.fiscalYear,
          statementOrigin: statement.statementOrigin,
          financialDatasetVersion: statement.financialDatasetVersion,
          sourceSystem: statement.sourceSystem,
          sourceEntityType: statement.sourceEntityType,
          sourceId: statement.sourceId,
          fetchedAt: statement.fetchedAt,
          normalizedAt: statement.normalizedAt,
        })),
      };
    },

    async resolveReportedStatement(companyId: string, liveStatementId: string) {
      // Reading a simulated statement is fine and labelled; storing one as a reported evidence
      // reference is not, from spec section 13. The dataset mode is checked as well as the
      // statement's own origin: while a demo dataset is active there is no reported statement to
      // point a foreign key at, whatever a row happens to call itself.
      const snapshot = await read(companyId);
      if (snapshot.datasetMode === "simulated") {
        throw new Error(
          "Simulated or synthetic financial statements cannot be stored in reported evidence references.",
        );
      }
      const statement = snapshot.statements.find(
        (candidate) =>
          candidate.liveStatementId === liveStatementId ||
          candidate.reportedStatementId === liveStatementId,
      );
      if (!statement) {
        throw new Error("Selected financial statement does not belong to the primary company.");
      }
      if (
        statement.statementOrigin !== "reported" ||
        statement.reportedStatementId === null
      ) {
        throw new Error(
          "Simulated or synthetic financial statements cannot be stored in reported evidence references.",
        );
      }
      return {
        ...statement,
        financialDatasetMode: snapshot.datasetMode,
        reportedStatementId: statement.reportedStatementId,
      };
    },
  };
}

export const ddFinancialEvidenceReader = createDdFinancialEvidenceReader();
