import env from "@/lib/env";
import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import type {
  DataAvailability,
  FinancialDatasetMode,
  FinancialDatasetVersion,
  NormalizedFinancialDocument,
  ProvenancedFinancialLineItem,
  ProvenancedFinancialStatement,
} from "@/lib/types";
import {
  financialsRepository,
  type LiveCompanyFinancials,
} from "@/server/financials/financials-repository";
import type {
  LiveFinancialLine,
  LiveFinancialStatement,
} from "@/server/financials/live-financials-contract";
import { toSafeNumber } from "@/server/financials/number-utils";
import {
  enqueueStructuredFinancialsFetch,
  STRUCTURED_FETCH_STATUS_PENDING,
} from "@/server/services/structured-financials-queue-service";
import { readStructuredFinancialsState } from "@/server/services/structured-financials-service";

const STRUCTURED_BRREG_ENTITY_TYPE = "structuredAnnualAccounts";

export type PublicFinancialStatement = ProvenancedFinancialStatement;
export type PublicFinancialLineItem = ProvenancedFinancialLineItem;

export type PublicCompanyFinancials = {
  datasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
  statements: PublicFinancialStatement[];
  allScopeStatements: PublicFinancialStatement[];
  lineItems: PublicFinancialLineItem[];
  documents: NormalizedFinancialDocument[];
  availability: DataAvailability;
};

function isStructuredBrregStatement(statement: PublicFinancialStatement) {
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
  statement: PublicFinancialStatement,
): PublicFinancialStatement {
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

function mapLiveStatement(statement: LiveFinancialStatement): PublicFinancialStatement {
  return {
    liveStatementId: statement.liveStatementId,
    reportedStatementId: statement.reportedStatementId,
    statementOrigin: statement.statementOrigin,
    financialDatasetVersion: statement.financialDatasetVersion,
    taxonomyVersion: statement.taxonomyVersion,
    generatorVersion: statement.generatorVersion,
    sourceSystem: statement.sourceSystem,
    sourceEntityType: statement.sourceEntityType,
    sourceId: statement.sourceId,
    fetchedAt: statement.fetchedAt,
    normalizedAt: statement.normalizedAt,
    rawPayload: statement.rawPayload,
    fiscalYear: statement.fiscalYear,
    period: statement.periodEnd
      ? {
          from: statement.periodStart?.toISOString().slice(0, 10) ?? null,
          to: statement.periodEnd.toISOString().slice(0, 10),
        }
      : undefined,
    currency: statement.currency,
    unitScale: statement.unitScale,
    statementScope: statement.statementScope,
    revenue: toSafeNumber(statement.revenue),
    operatingProfit: toSafeNumber(statement.operatingProfit),
    netIncome: toSafeNumber(statement.netIncome),
    equity: toSafeNumber(statement.equity),
    assets: toSafeNumber(statement.assets),
  };
}

function mapLiveLineItem(
  statement: LiveFinancialStatement,
  line: LiveFinancialLine,
): PublicFinancialLineItem {
  const sourceValue = toSafeNumber(line.value);
  const scaledValue = sourceValue === null ? null : sourceValue * line.unitScale;
  const isSynthetic = line.valueOrigin === "synthetic";

  return {
    id: line.liveLineId,
    liveLineId: line.liveLineId,
    liveStatementId: line.liveStatementId,
    reportedFinancialLineItemId: line.reportedFinancialLineItemId,
    filingId: statement.reportedStatementId,
    fiscalYear: statement.fiscalYear,
    statementType: line.statementType,
    statementScope: statement.statementScope,
    conceptKey: line.conceptKey,
    metricKey: line.metricKey,
    label: line.sourceLabel ?? line.conceptKey ?? "Uten etikett",
    originalValue: null,
    value: Number.isSafeInteger(scaledValue) ? scaledValue : null,
    currency: line.currency,
    unitScale: line.unitScale,
    sourcePage: null,
    sortOrder: line.sortOrder,
    publicationSource: isSynthetic ? "FI_SIM" : "LIVE_REPORTED",
    sourceSystem: line.sourceSystem,
    sourceEntityType: line.sourceEntityType,
    sourceId: line.sourceId,
    fetchedAt: line.fetchedAt,
    normalizedAt: line.normalizedAt,
    rawPayload: undefined,
    valueOrigin: line.valueOrigin,
    statementOrigin: line.statementOrigin,
    financialDatasetVersion: line.financialDatasetVersion,
    taxonomyVersion: line.taxonomyVersion,
    generatorVersion: line.generatorVersion,
    derivationRuleId: line.derivationRuleId,
  };
}

function mapLiveCompanyFinancials(snapshot: LiveCompanyFinancials): PublicCompanyFinancials {
  const allScopeStatements = snapshot.statements.map(mapLiveStatement);
  const statements = getHeadlineFinancialStatements(
    allScopeStatements,
  ) as PublicFinancialStatement[];
  const lineItems = snapshot.statements.flatMap((statement) =>
    statement.lines.map((line) => mapLiveLineItem(statement, line)),
  );

  return {
    datasetMode: snapshot.datasetMode,
    financialDatasetVersion: snapshot.financialDatasetVersion,
    statements,
    allScopeStatements,
    lineItems,
    documents: [],
    availability: {
      available: statements.length > 0,
      sourceSystem: snapshot.datasetMode === "simulated" ? "FI-SIM" : "BRREG",
    },
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
    .filter(
      (statement) =>
        statement.statementOrigin !== "reported" || isStructuredBrregStatement(statement),
    )
    .map((statement) =>
      statement.statementOrigin === "reported"
        ? normalizePublicStructuredStatement(statement)
        : { ...statement, rawPayload: undefined },
    );

  // Pick the headline year AFTER filtering to approved sources, not before.
  // `financials.statements` is already deduped to one statement per year with
  // consolidated preferred, so for a company holding both a non-Brreg
  // consolidated statement and a Brreg company statement for the same year, the
  // non-Brreg row won the year and was then removed here — leaving an empty
  // result and an "ikke tilgjengelig" message for a company whose official
  // Brreg figures we actually had. Deduping the filtered set instead keeps the
  // Brreg row, and still prefers consolidated when Brreg supplies both scopes.
  const statements = getHeadlineFinancialStatements(
    allScopeStatements,
  ) as PublicFinancialStatement[];
  const available = statements.length > 0;
  const latestSource = [...statements].sort(
    (left, right) => right.fetchedAt.getTime() - left.fetchedAt.getTime(),
  )[0];
  const simulatedStatementIds = new Set(
    allScopeStatements
      .filter((statement) => statement.statementOrigin !== "reported")
      .map((statement) => statement.liveStatementId),
  );
  const isSimulatedDataset = financials.datasetMode === "simulated";

  return {
    ...financials,
    statements,
    allScopeStatements,
    lineItems: financials.lineItems.filter((line) =>
      simulatedStatementIds.has(line.liveStatementId),
    ),
    documents: [],
    availability: {
      available,
      sourceSystem: isSimulatedDataset ? "FI-SIM" : "BRREG",
      sourceEntityType: latestSource?.sourceEntityType,
      sourceId: latestSource?.sourceId,
      fetchedAt: latestSource?.fetchedAt,
      normalizedAt: latestSource?.normalizedAt,
      status: available ? "AVAILABLE" : "UNAVAILABLE",
      message: isSimulatedDataset
        ? available
          ? "Simulert regnskap for investordemonstrasjon. Tall merket som syntetiske er ikke rapporterte selskapsdata."
          : "Simulert regnskap er aktivert for investordemonstrasjonen, men ingen simulert oppstilling er tilgjengelig for virksomheten."
        : available
          ? "Regnskapstall vises fra Brønnøysundregistrenes strukturerte regnskapsdata. PDF og OCR brukes ikke som fallback i betaen."
          : "Strukturerte regnskapstall er ikke tilgjengelige for virksomheten. PDF og OCR brukes ikke som fallback i betaen.",
    },
  };
}

const PENDING_MESSAGE =
  "Regnskapstall for virksomheten er ikke lastet inn i databasen ennå. Virksomheten er lagt i kø for henting fra Brønnøysundregistrene, og tallene vises så snart hentingen er kjørt.";

const UNAVAILABLE_MESSAGE =
  "Strukturerte regnskapstall er ikke tilgjengelige for virksomheten. PDF og OCR brukes ikke som fallback i betaen.";

/**
 * `unavailableReason` is a diagnostic field — the coverage report groups by it,
 * and some values are raw transport detail such as "HTTP 404: ingen regnskap".
 * Only reasons that actually tell a user something are surfaced; everything
 * else falls back to the honest generic message. The stored value is
 * unchanged so admin reporting keeps its detail.
 */
const USER_FACING_UNAVAILABLE_REASONS = new Map<string, string>([
  [
    "Oppstillingsplan ikke støttet",
    "Regnskapet er levert med en oppstillingsplan Fjord Insight ikke støtter ennå. Tallene vises derfor ikke.",
  ],
  [
    "Bare avviklingsregnskap er tilgjengelig.",
    "Bare avviklingsregnskap er registrert for virksomheten. Avviklingsregnskap vises ikke som ordinære regnskapstall.",
  ],
]);

function toUserFacingUnavailableMessage(reason: string | null): string {
  if (!reason) return UNAVAILABLE_MESSAGE;
  return USER_FACING_UNAVAILABLE_REASONS.get(reason) ?? UNAVAILABLE_MESSAGE;
}

/**
 * Public financials for a company.
 *
 * Reads only the database. When the company has no structured statements and
 * no fetch state, it is enqueued for a background fetch and the caller gets an
 * honest PENDING state — the request never calls Brønnøysundregistrene itself.
 */
export async function getPublicCompanyFinancials(
  orgNumber: string,
): Promise<PublicCompanyFinancials> {
  const snapshot = await financialsRepository.getCompanyFinancials({ orgNumber });
  const result = applyPublicFinancialSourcePolicy(mapLiveCompanyFinancials(snapshot));

  // A demo snapshot is a complete dataset. Do not mix it with reported-source
  // fetch state or enqueue reported ingestion while it is active.
  if (result.datasetMode === "simulated") {
    return result;
  }

  if (!env.betaStructuredFinancialsOnly) {
    return result;
  }

  const context = await readStructuredFinancialsState(orgNumber);
  const state = context?.state ?? null;

  const provenance = state
    ? {
        sourceSystem: state.sourceSystem,
        sourceEntityType: state.sourceEntityType,
        sourceId: state.sourceId,
        fetchedAt: state.fetchedAt,
        normalizedAt: state.normalizedAt,
        nextCheckAt: state.nextCheckAt,
      }
    : {};

  // We have numbers. Surface them, flagging the last known source trouble.
  if (result.statements.length > 0) {
    if (state?.status === "ERROR") {
      return {
        ...result,
        availability: {
          ...result.availability,
          ...provenance,
          available: true,
          status: "STALE",
          message:
            "Brønnøysundregistrene var utilgjengelig ved siste henting. Sist hentede offisielle strukturerte regnskapstall vises; PDF og OCR brukes ikke som fallback.",
        },
      };
    }

    return {
      ...result,
      availability: {
        ...result.availability,
        ...provenance,
        status: "AVAILABLE",
      },
    };
  }

  // No numbers. Distinguish "not fetched yet" from "source has nothing".
  if (!state) {
    await enqueueStructuredFinancialsFetch(orgNumber);
    return {
      ...result,
      statements: [],
      allScopeStatements: [],
      availability: {
        ...result.availability,
        available: false,
        sourceSystem: "BRREG",
        status: "PENDING",
        message: PENDING_MESSAGE,
      },
    };
  }

  if (state.status === STRUCTURED_FETCH_STATUS_PENDING) {
    return {
      ...result,
      statements: [],
      allScopeStatements: [],
      availability: {
        ...result.availability,
        ...provenance,
        available: false,
        status: "PENDING",
        message: PENDING_MESSAGE,
      },
    };
  }

  return {
    ...result,
    statements: [],
    allScopeStatements: [],
    availability: {
      ...result.availability,
      ...provenance,
      available: false,
      status: state.status === "ERROR" ? "ERROR" : "UNAVAILABLE",
      message:
        state.status === "ERROR"
          ? "Brønnøysundregistrene var utilgjengelig ved siste henting, og vi har ingen tidligere tall for virksomheten. Ny henting er planlagt."
          : toUserFacingUnavailableMessage(state.unavailableReason),
    },
  };
}
