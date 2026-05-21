import type {
  AnnualReportArtifact,
  AnnualReportFiling,
  FinancialExtractionRun,
  FinancialFact,
  FinancialStatement,
} from "@prisma/client";

import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import {
  getPublishedFinancialStatementForSourceFiling,
  listFinancialFactsForFiling,
} from "@/server/persistence/annual-report-ingestion-repository";
import {
  resolveAnnualReportArtifactForFiling,
  summarizeExtractionRoute,
  type FilingArtifactLookupDiagnostic,
} from "@/server/services/annual-report-filing-artifact-resolver";

type FilingContext = Pick<
  AnnualReportFiling,
  | "id"
  | "fiscalYear"
  | "sourceDiscoveryKey"
  | "sourceIdempotencyKey"
  | "sourceDocumentHash"
  | "sourceDocumentType"
  | "sourceUrl"
> & {
  company: {
    id: string;
    orgNumber: string;
    name: string;
  };
  artifacts: AnnualReportArtifact[];
  extractionRuns: FinancialExtractionRun[];
};

export type LegacyCandidateEvidenceType =
  | "persisted_artifact"
  | "fixture_only"
  | "fallback";

export type LegacyCandidateClassification =
  | "real_legacy_candidate"
  | "fixture_candidate"
  | "unavailable_candidate"
  | "malformed_candidate";

export type LegacyCandidateDiagnostic = {
  code:
    | "LEGACY_FACTS_FOUND"
    | "LEGACY_FACTS_MISSING"
    | "LEGACY_FACTS_MALFORMED"
    | "LEGACY_PUBLISHED_FALLBACK"
    | "LEGACY_FIXTURE_USED";
  message: string;
};

export type LegacyCandidateProvenance = {
  orgNumber: string;
  filingId: string;
  fiscalYear: number;
  filingReportId: string | null;
  sourceDocumentReference: string | null;
  sourceArtifactReference: string | null;
  extractionRoute: string | null;
  evidenceType: LegacyCandidateEvidenceType;
  extractionTimestamp: string | null;
  artifactTimestamp: string | null;
  sourceRunId: string | null;
  source: "financial_facts" | "published_snapshot" | "fixture";
  lookupDiagnostics: FilingArtifactLookupDiagnostic[];
};

export type LoadedLegacyCandidateSet = {
  classification: LegacyCandidateClassification;
  candidates: CanonicalFactCandidate[];
  provenance: LegacyCandidateProvenance;
  diagnostics: LegacyCandidateDiagnostic[];
};

export type LoadLegacyCandidatesDeps = {
  listFactsForFiling?: typeof listFinancialFactsForFiling;
  getPublishedStatementForFiling?: typeof getPublishedFinancialStatementForSourceFiling;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNumber(value: bigint | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "bigint" ? Number(value) : value;
}

function inferPrecedence(
  sourceSection: string | null,
  rawPayload: unknown,
): CanonicalFactCandidate["precedence"] {
  const payload = asRecord(rawPayload);
  const payloadPrecedence = asString(payload.precedence);
  if (
    payloadPrecedence === "MACHINE_READABLE" ||
    payloadPrecedence === "STATUTORY_NOK" ||
    payloadPrecedence === "SUPPLEMENTARY_NOK_THOUSANDS" ||
    payloadPrecedence === "NOTE_DERIVED"
  ) {
    return payloadPrecedence;
  }
  if (sourceSection?.includes("SUPPLEMENTARY")) {
    return "SUPPLEMENTARY_NOK_THOUSANDS";
  }
  if (sourceSection?.includes("NOTE")) {
    return "NOTE_DERIVED";
  }
  return "STATUTORY_NOK";
}

function mapFinancialFactToCandidate(fact: FinancialFact): CanonicalFactCandidate | null {
  const value = toNumber(fact.value);
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  return {
    fiscalYear: fact.fiscalYear,
    statementType:
      fact.statementType === "NOTE"
        ? "NOTE"
        : fact.statementType === "BALANCE_SHEET"
          ? "BALANCE_SHEET"
          : "INCOME_STATEMENT",
    statementScope: fact.statementScope,
    metricKey: fact.metricKey as CanonicalFactCandidate["metricKey"],
    rawLabel: fact.rawLabel ?? fact.metricKey,
    normalizedLabel: fact.normalizedLabel ?? fact.metricKey,
    value,
    currency: fact.currency,
    unitScale: fact.unitScale === 1000 ? 1000 : 1,
    sourcePage: fact.sourcePage ?? 0,
    sourceSection: (fact.sourceSection ?? "STATUTORY_INCOME") as CanonicalFactCandidate["sourceSection"],
    sourceRowText: fact.sourceRowText ?? fact.metricKey,
    noteReference: fact.noteReference,
    confidenceScore: fact.confidenceScore ?? 0,
    precedence: inferPrecedence(fact.sourceSection, fact.rawPayload),
    isDerived: fact.isDerived,
    rawPayload: asRecord(fact.rawPayload),
  };
}

function buildPublishedStatementFallbackCandidates(statement: FinancialStatement): CanonicalFactCandidate[] {
  const fiscalYear = statement.fiscalYear;
  const unitScale = statement.unitScale === 1000 ? 1000 : 1;
  const entries: Array<{
    metricKey: CanonicalFactCandidate["metricKey"];
    statementType: CanonicalFactCandidate["statementType"];
    value: bigint | null;
  }> = [
    { metricKey: "revenue", statementType: "INCOME_STATEMENT", value: statement.revenue },
    { metricKey: "operating_profit", statementType: "INCOME_STATEMENT", value: statement.operatingProfit },
    { metricKey: "net_income", statementType: "INCOME_STATEMENT", value: statement.netIncome },
    { metricKey: "total_equity", statementType: "BALANCE_SHEET", value: statement.equity },
    { metricKey: "total_assets", statementType: "BALANCE_SHEET", value: statement.assets },
  ];

  return entries.flatMap((entry) => {
    const value = toNumber(entry.value);
    if (value === null) {
      return [];
    }

    return [
      {
        fiscalYear,
        statementType: entry.statementType,
        statementScope: statement.statementScope,
        metricKey: entry.metricKey,
        rawLabel: entry.metricKey,
        normalizedLabel: entry.metricKey,
        value,
        currency: statement.currency,
        unitScale,
        sourcePage: 0,
        sourceSection:
          entry.statementType === "BALANCE_SHEET" ? "STATUTORY_BALANCE" : "STATUTORY_INCOME",
        sourceRowText: entry.metricKey,
        noteReference: null,
        confidenceScore: statement.qualityScore ?? 1,
        precedence:
          (statement.sourcePrecedence as CanonicalFactCandidate["precedence"] | null) ?? "STATUTORY_NOK",
        isDerived: false,
        rawPayload: {
          source: "published_snapshot",
          sourceFilingId: statement.sourceFilingId,
          sourceExtractionRunId: statement.sourceExtractionRunId,
        },
      } satisfies CanonicalFactCandidate,
    ];
  });
}

function buildBaseProvenance(
  filing: FilingContext,
  evidenceType: LegacyCandidateEvidenceType,
  source: LegacyCandidateProvenance["source"],
  lookupDiagnostics: FilingArtifactLookupDiagnostic[],
): LegacyCandidateProvenance {
  const pdfLookup = resolveAnnualReportArtifactForFiling(filing, filing.artifacts, "PDF");
  const extractionLookup = resolveAnnualReportArtifactForFiling(filing, filing.artifacts, "EXTRACTION_JSON");
  const latestRun = filing.extractionRuns[0] ?? null;

  return {
    orgNumber: filing.company.orgNumber,
    filingId: filing.id,
    fiscalYear: filing.fiscalYear,
    filingReportId: filing.sourceIdempotencyKey,
    sourceDocumentReference: pdfLookup.artifact?.storageKey ?? filing.sourceUrl,
    sourceArtifactReference: extractionLookup.artifact?.storageKey ?? null,
    extractionRoute: summarizeExtractionRoute(latestRun),
    evidenceType,
    extractionTimestamp: latestRun?.finishedAt?.toISOString() ?? latestRun?.startedAt.toISOString() ?? null,
    artifactTimestamp: extractionLookup.artifact?.createdAt.toISOString() ?? pdfLookup.artifact?.createdAt.toISOString() ?? null,
    sourceRunId: latestRun?.id ?? null,
    source,
    lookupDiagnostics: [...pdfLookup.diagnostics, ...extractionLookup.diagnostics, ...lookupDiagnostics],
  };
}

export async function loadPersistedLegacyCandidatesForFiling(
  filing: FilingContext,
  deps: LoadLegacyCandidatesDeps = {},
): Promise<LoadedLegacyCandidateSet> {
  const listFactsForFiling = deps.listFactsForFiling ?? listFinancialFactsForFiling;
  const getPublishedStatementForFiling =
    deps.getPublishedStatementForFiling ?? getPublishedFinancialStatementForSourceFiling;

  const facts = await listFactsForFiling(filing.id);
  const diagnostics: LegacyCandidateDiagnostic[] = [];
  const factRunIds = new Set(facts.map((fact) => fact.extractionRunId));
  const chosenRun =
    filing.extractionRuns.find((run) => factRunIds.has(run.id)) ??
    filing.extractionRuns[0] ??
    null;
  const chosenFacts = chosenRun ? facts.filter((fact) => fact.extractionRunId === chosenRun.id) : facts;
  const mappedFacts = chosenFacts.map(mapFinancialFactToCandidate);
  const validFacts = mappedFacts.filter((candidate): candidate is CanonicalFactCandidate => candidate !== null);

  if (validFacts.length > 0) {
    diagnostics.push({
      code: "LEGACY_FACTS_FOUND",
      message: `Loaded ${validFacts.length} persisted legacy candidates from FinancialFact rows.`,
    });

    return {
      classification: "real_legacy_candidate",
      candidates: validFacts,
      provenance: {
        ...buildBaseProvenance(filing, "persisted_artifact", "financial_facts", []),
        extractionRoute: summarizeExtractionRoute(chosenRun),
        sourceRunId: chosenRun?.id ?? null,
        extractionTimestamp:
          chosenRun?.finishedAt?.toISOString() ?? chosenRun?.startedAt.toISOString() ?? null,
      },
      diagnostics,
    };
  }

  if (chosenFacts.length > 0 && validFacts.length === 0) {
    diagnostics.push({
      code: "LEGACY_FACTS_MALFORMED",
      message: `Found ${chosenFacts.length} persisted legacy fact rows, but none could be converted back to CanonicalFactCandidate.`,
    });

    return {
      classification: "malformed_candidate",
      candidates: [],
      provenance: buildBaseProvenance(filing, "persisted_artifact", "financial_facts", []),
      diagnostics,
    };
  }

  const publishedStatement = await getPublishedStatementForFiling(filing.id);
  if (publishedStatement) {
    const fallbackCandidates = buildPublishedStatementFallbackCandidates(publishedStatement);
    if (fallbackCandidates.length > 0) {
      diagnostics.push({
        code: "LEGACY_PUBLISHED_FALLBACK",
        message:
          "No persisted FinancialFact rows were available, so legacy candidates were reconstructed from the published legacy snapshot for the same filing.",
      });

      return {
        classification: "real_legacy_candidate",
        candidates: fallbackCandidates,
        provenance: {
          ...buildBaseProvenance(filing, "fallback", "published_snapshot", []),
          sourceRunId: publishedStatement.sourceExtractionRunId ?? null,
          extractionTimestamp: publishedStatement.publishedAt?.toISOString() ?? null,
        },
        diagnostics,
      };
    }
  }

  diagnostics.push({
    code: "LEGACY_FACTS_MISSING",
    message: "No persisted legacy extraction facts or published legacy snapshot were available for this filing.",
  });

  return {
    classification: "unavailable_candidate",
    candidates: [],
    provenance: buildBaseProvenance(filing, "fallback", "published_snapshot", []),
    diagnostics,
  };
}
