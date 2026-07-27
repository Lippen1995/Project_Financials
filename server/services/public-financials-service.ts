import env from "@/lib/env";
import type {
  DataAvailability,
  NormalizedFinancialDocument,
  NormalizedFinancialLineItem,
  NormalizedFinancialStatement,
} from "@/lib/types";
import { getPublishedAnnualReportFinancials } from "@/server/services/annual-report-financials-service";
import { ensureStructuredFinancialsForCompany } from "@/server/services/structured-financials-service";

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

function toFiniteFinancialValues(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function normalizePublicStructuredStatement(
  statement: NormalizedFinancialStatement,
): NormalizedFinancialStatement {
  const payload =
    statement.rawPayload && typeof statement.rawPayload === "object"
      ? (statement.rawPayload as Record<string, unknown>)
      : {};
  const period =
    payload.period &&
    typeof payload.period === "object" &&
    typeof (payload.period as Record<string, unknown>).to === "string"
      ? {
          from:
            typeof (payload.period as Record<string, unknown>).from === "string"
              ? ((payload.period as Record<string, unknown>).from as string)
              : null,
          to: (payload.period as Record<string, unknown>).to as string,
        }
      : undefined;

  return {
    ...statement,
    rawPayload: undefined,
    modelVersion:
      typeof payload.modelVersion === "string" ? payload.modelVersion : undefined,
    period,
    amountUnit:
      payload.amountUnit === "WHOLE_CURRENCY_UNITS"
        ? "WHOLE_CURRENCY_UNITS"
        : undefined,
    unitScale:
      typeof payload.unitScale === "number" ? payload.unitScale : 1,
    financialValues: toFiniteFinancialValues(payload.canonicalValues),
  };
}

export function applyPublicFinancialSourcePolicy(
  financials: PublicCompanyFinancials,
  structuredOnly = env.betaStructuredFinancialsOnly,
): PublicCompanyFinancials {
  if (!structuredOnly) {
    return financials;
  }

  const allScopeStatements = financials.allScopeStatements
    .filter(isStructuredBrregStatement)
    .map(normalizePublicStructuredStatement);
  const allowedKeys = new Set(
    allScopeStatements.map(
      (statement) => `${statement.fiscalYear}:${statement.statementScope ?? "COMPANY"}`,
    ),
  );
  const statements = financials.statements
    .filter(
      (statement) =>
        isStructuredBrregStatement(statement) &&
        allowedKeys.has(`${statement.fiscalYear}:${statement.statementScope ?? "COMPANY"}`),
    )
    .map(normalizePublicStructuredStatement);
  const available = statements.length > 0;
  const latestSource = [...statements].sort(
    (left, right) => right.fetchedAt.getTime() - left.fetchedAt.getTime(),
  )[0];

  return {
    statements,
    allScopeStatements,
    lineItems: [],
    documents: [],
    availability: {
      available,
      sourceSystem: "BRREG",
      sourceEntityType: latestSource?.sourceEntityType,
      sourceId: latestSource?.sourceId,
      fetchedAt: latestSource?.fetchedAt,
      normalizedAt: latestSource?.normalizedAt,
      status: available ? "AVAILABLE" : "UNAVAILABLE",
      message: available
        ? "Regnskapstall vises fra Brønnøysundregistrenes strukturerte regnskapsdata. PDF og OCR brukes ikke som fallback i betaen."
        : "Strukturerte regnskapstall er ikke tilgjengelige for virksomheten. PDF og OCR brukes ikke som fallback i betaen.",
    },
  };
}

export async function getPublicCompanyFinancials(
  orgNumber: string,
): Promise<PublicCompanyFinancials> {
  const ingestion = env.betaStructuredFinancialsOnly
    ? await ensureStructuredFinancialsForCompany(orgNumber)
    : null;
  const financials = await getPublishedAnnualReportFinancials(orgNumber);
  const result = applyPublicFinancialSourcePolicy(financials);

  if (!ingestion || !env.betaStructuredFinancialsOnly) {
    return result;
  }

  if (ingestion.status === "STALE") {
    return {
      ...result,
      availability: {
        ...result.availability,
        available: result.statements.length > 0,
        sourceSystem: ingestion.sourceSystem,
        sourceEntityType: ingestion.sourceEntityType,
        sourceId: ingestion.sourceId,
        fetchedAt: ingestion.fetchedAt,
        normalizedAt: ingestion.normalizedAt,
        status: "STALE",
        nextCheckAt: ingestion.nextCheckAt,
        message:
          "Brønnøysundregistrene er midlertidig utilgjengelig. Sist hentede offisielle strukturerte regnskapstall vises; PDF og OCR brukes ikke som fallback.",
      },
    };
  }

  if (ingestion.status === "ERROR" || ingestion.status === "UNAVAILABLE") {
    return {
      ...result,
      statements: [],
      allScopeStatements: [],
      availability: {
        ...result.availability,
        available: false,
        sourceSystem: ingestion.sourceSystem,
        sourceEntityType: ingestion.sourceEntityType,
        sourceId: ingestion.sourceId,
        fetchedAt: ingestion.fetchedAt,
        normalizedAt: ingestion.normalizedAt,
        status: ingestion.status,
        nextCheckAt: ingestion.nextCheckAt,
        message:
          ingestion.unavailableReason ??
          "Strukturerte regnskapstall er ikke tilgjengelige for virksomheten. PDF og OCR brukes ikke som fallback i betaen.",
      },
    };
  }

  return {
    ...result,
    availability: {
      ...result.availability,
      sourceSystem: ingestion.sourceSystem,
      sourceEntityType: ingestion.sourceEntityType,
      sourceId: ingestion.sourceId,
      fetchedAt: ingestion.fetchedAt,
      normalizedAt: ingestion.normalizedAt,
      status: "AVAILABLE",
      nextCheckAt: ingestion.nextCheckAt,
    },
  };
}
