import env from "@/lib/env";
import type {
  DataAvailability,
  NormalizedFinancialDocument,
  NormalizedFinancialLineItem,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { getPublishedAnnualReportFinancials } from "@/server/services/annual-report-financials-service";

const STRUCTURED_BRREG_ENTITY_TYPE = "structuredAnnualAccounts";

export type PublicCompanyFinancials = {
  statements: NormalizedFinancialStatement[];
  allScopeStatements: NormalizedFinancialStatement[];
  lineItems: NormalizedFinancialLineItem[];
  documents: NormalizedFinancialDocument[];
  availability: DataAvailability;
};

function isStructuredBrregStatement(statement: NormalizedFinancialStatement) {
  return (
    statement.sourceSystem === "BRREG" &&
    statement.sourceEntityType === STRUCTURED_BRREG_ENTITY_TYPE
  );
}

export function applyPublicFinancialSourcePolicy(
  financials: PublicCompanyFinancials,
  structuredOnly = env.betaStructuredFinancialsOnly,
): PublicCompanyFinancials {
  if (!structuredOnly) {
    return financials;
  }

  const allScopeStatements = financials.allScopeStatements.filter(isStructuredBrregStatement);
  const allowedKeys = new Set(
    allScopeStatements.map(
      (statement) => `${statement.fiscalYear}:${statement.statementScope ?? "COMPANY"}`,
    ),
  );
  const statements = financials.statements.filter(
    (statement) =>
      isStructuredBrregStatement(statement) &&
      allowedKeys.has(`${statement.fiscalYear}:${statement.statementScope ?? "COMPANY"}`),
  );
  const available = statements.length > 0;

  return {
    statements,
    allScopeStatements,
    lineItems: [],
    documents: [],
    availability: {
      available,
      sourceSystem: "BRREG",
      message: available
        ? "Regnskapstall vises fra Brønnøysundregistrenes strukturerte regnskapsdata. PDF og OCR brukes ikke som fallback i betaen."
        : "Strukturerte regnskapstall er ikke tilgjengelige for virksomheten. PDF og OCR brukes ikke som fallback i betaen.",
    },
  };
}

export async function getPublicCompanyFinancials(
  orgNumber: string,
): Promise<PublicCompanyFinancials> {
  const financials = await getPublishedAnnualReportFinancials(orgNumber);
  return applyPublicFinancialSourcePolicy(financials);
}
