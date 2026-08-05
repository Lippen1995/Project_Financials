import {
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type PdfModelArtifactSnapshot,
} from "@prisma/client";

import {
  listAnnualReportFilingsByIds,
  getAnnualReportFilingWithArtifacts,
} from "@/server/persistence/annual-report-ingestion-repository";
import { listPersistedPdfModelArtifactSnapshots } from "@/server/services/pdf-model-artifact-snapshot-service";
import type {
  UnifiedExtractionConfidenceGateReport,
  UnifiedExtractionGateCheckResult,
  UnifiedExtractionGateOverallVerdict,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import { validateUnifiedExtractionConfidenceGateReport } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";

type FilingRecord = Awaited<ReturnType<typeof getAnnualReportFilingWithArtifacts>>;
type FilingListRecord = Awaited<ReturnType<typeof listAnnualReportFilingsByIds>>[number];

const RELATED_ARTIFACT_KINDS = [
  PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT,
  PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION,
  PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION,
  PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON,
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseGateVerdict(value: unknown): UnifiedExtractionGateOverallVerdict | null {
  return value === "PASS" || value === "WARN" || value === "FAIL" || value === "INSUFFICIENT_DATA"
    ? value
    : null;
}

function summarizeCheckCodes(checks: UnifiedExtractionGateCheckResult[]) {
  return checks.map((check) => check.checkCode);
}

function deriveCaseStatus(
  report: UnifiedExtractionConfidenceGateReport,
): "completed" | "skipped" {
  if (
    report.overallVerdict === "INSUFFICIENT_DATA" &&
    report.passCount === 0 &&
    report.warnCount === 0 &&
    report.failCount === 0
  ) {
    return "skipped";
  }

  return "completed";
}

type GateArtifactParseResult =
  | {
      ok: true;
      report: UnifiedExtractionConfidenceGateReport;
      status: "completed" | "skipped";
      issues: string[];
      filingId: string;
      orgNumber: string | null;
      fiscalYear: number | null;
      generatedAt: string;
    }
  | {
      ok: false;
      status: "error";
      issues: string[];
      filingId: string | null;
      orgNumber: string | null;
      fiscalYear: number | null;
      generatedAt: string | null;
      overallVerdict: UnifiedExtractionGateOverallVerdict | null;
      passCount: number | null;
      warnCount: number | null;
      failCount: number | null;
      insufficientDataCount: number | null;
      blockingCheckCodes: string[];
      warningCheckCodes: string[];
    };

function parseGateArtifact(artifact: PdfModelArtifactSnapshot): GateArtifactParseResult {
  const payload = asRecord(artifact.payload);
  const meta = asRecord(payload.meta);
  const filingId = asString(meta.filingId) ?? asString(asRecord(artifact.summary).filingId);
  const orgNumber = asString(meta.orgNumber) ?? artifact.orgNumber ?? asString(asRecord(artifact.summary).orgNumber);
  const fiscalYear = asNumber(meta.fiscalYear) ?? artifact.fiscalYear ?? asNumber(asRecord(artifact.summary).fiscalYear);
  const generatedAt = asString(payload.generatedAt);
  const issues: string[] = [];

  if (!filingId) {
    issues.push("Missing filingId in gate artifact payload.");
  }
  if (Object.keys(asRecord(payload.safety)).length === 0) {
    issues.push("safety: Required.");
  }

  if (!generatedAt) {
    issues.push("generatedAt: Required.");
  }

  if (issues.length > 0 || !filingId || !generatedAt) {
    const checks = Array.isArray(payload.checks)
      ? (payload.checks as unknown[])
          .map((value) => asRecord(value))
          .filter((value) => asString(value.checkCode))
      : [];

    return {
      ok: false,
      status: "error",
      issues: generatedAt ? issues : [...issues, "generatedAt: Required."],
      filingId,
      orgNumber,
      fiscalYear,
      generatedAt,
      overallVerdict: parseGateVerdict(payload.overallVerdict),
      passCount: asNumber(payload.passCount),
      warnCount: asNumber(payload.warnCount),
      failCount: asNumber(payload.failCount),
      insufficientDataCount: asNumber(payload.insufficientDataCount),
      blockingCheckCodes: checks
        .filter((value) => value.verdict === "FAIL")
        .map((value) => asString(value.checkCode))
        .filter((value): value is string => value !== null),
      warningCheckCodes: checks
        .filter((value) => value.verdict === "WARN")
        .map((value) => asString(value.checkCode))
        .filter((value): value is string => value !== null),
    };
  }

  const report = artifact.payload as UnifiedExtractionConfidenceGateReport;
  issues.push(...validateUnifiedExtractionConfidenceGateReport(report).map((issue) => `${issue.path}: ${issue.message}`));

  if (issues.length > 0) {
    return {
      ok: false,
      status: "error",
      issues,
      filingId,
      orgNumber,
      fiscalYear,
      generatedAt,
      overallVerdict: parseGateVerdict(payload.overallVerdict),
      passCount: asNumber(payload.passCount),
      warnCount: asNumber(payload.warnCount),
      failCount: asNumber(payload.failCount),
      insufficientDataCount: asNumber(payload.insufficientDataCount),
      blockingCheckCodes: Array.isArray(report.blockingChecks)
        ? summarizeCheckCodes(report.blockingChecks)
        : [],
      warningCheckCodes: Array.isArray(report.warningChecks)
        ? summarizeCheckCodes(report.warningChecks)
        : [],
    };
  }

  return {
    ok: true,
    report,
    status: deriveCaseStatus(report),
    issues,
    filingId,
    orgNumber,
    fiscalYear,
    generatedAt,
  };
}

type RelatedArtifactSummary = {
  documentPageCount: number | null;
  financialStatementCount: number | null;
  financialLineItemCount: number | null;
  narrativeSectionCount: number | null;
  comparisonFactCount: number | null;
  comparisonExactMatchCount: number | null;
  comparisonMismatchCount: number | null;
  comparisonMatchRate: number | null;
};

function emptyRelatedSummary(): RelatedArtifactSummary {
  return {
    documentPageCount: null,
    financialStatementCount: null,
    financialLineItemCount: null,
    narrativeSectionCount: null,
    comparisonFactCount: null,
    comparisonExactMatchCount: null,
    comparisonMismatchCount: null,
    comparisonMatchRate: null,
  };
}

function relatedArtifactKey(kind: PdfModelArtifactKind, filingId: string) {
  return `${kind}:${filingId}`;
}

function getRelatedArtifactFilingId(artifact: PdfModelArtifactSnapshot): string | null {
  const summary = asRecord(artifact.summary);
  const payload = asRecord(artifact.payload);
  const source = asRecord(payload.source);
  return asString(summary.filingId) ?? asString(source.filingId);
}

function buildRelatedArtifactSummaryIndex(artifacts: PdfModelArtifactSnapshot[]) {
  const byKey = new Map<string, PdfModelArtifactSnapshot>();

  for (const artifact of artifacts) {
    const filingId = getRelatedArtifactFilingId(artifact);
    if (!filingId) {
      continue;
    }

    const key = relatedArtifactKey(artifact.kind, filingId);
    const existing = byKey.get(key);
    if (!existing || existing.createdAt < artifact.createdAt) {
      byKey.set(key, artifact);
    }
  }

  return byKey;
}

function getRelatedSummaryForFiling(
  filingId: string,
  index: Map<string, PdfModelArtifactSnapshot>,
): RelatedArtifactSummary {
  const summary = emptyRelatedSummary();

  const documentArtifact = index.get(relatedArtifactKey(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT, filingId));
  if (documentArtifact) {
    const documentSummary = asRecord(documentArtifact.summary);
    summary.documentPageCount = asNumber(documentSummary.pageCount);
  }

  const financialArtifact = index.get(relatedArtifactKey(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, filingId));
  if (financialArtifact) {
    const financialSummary = asRecord(financialArtifact.summary);
    summary.financialStatementCount = asNumber(financialSummary.statementCount);
    summary.financialLineItemCount = asNumber(financialSummary.parsedLineItemCount);
  }

  const narrativeArtifact = index.get(relatedArtifactKey(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION, filingId));
  if (narrativeArtifact) {
    const narrativeSummary = asRecord(narrativeArtifact.summary);
    summary.narrativeSectionCount = asNumber(narrativeSummary.sectionCount);
  }

  const comparisonArtifact = index.get(relatedArtifactKey(PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON, filingId));
  if (comparisonArtifact) {
    const comparisonSummary = asRecord(comparisonArtifact.summary);
    summary.comparisonFactCount = asNumber(comparisonSummary.totalCompared);
    summary.comparisonExactMatchCount = asNumber(comparisonSummary.exactMatchCount);
    summary.comparisonMismatchCount = asNumber(comparisonSummary.mismatchCount);

    const totalCompared = summary.comparisonFactCount;
    const exactMatchCount = summary.comparisonExactMatchCount;
    if (totalCompared !== null && totalCompared > 0 && exactMatchCount !== null) {
      summary.comparisonMatchRate = exactMatchCount / totalCompared;
    }
  }

  return summary;
}

function toFilingLookupMap(filings: FilingListRecord[]) {
  return new Map(filings.map((filing) => [filing.id, filing]));
}

export type UnifiedConfidenceAdminStatus = "completed" | "skipped" | "error";

export type UnifiedConfidenceAdminListInput = {
  verdict?: UnifiedExtractionGateOverallVerdict;
  fiscalYear?: number;
  orgNumber?: string;
  checkCode?: string;
  status?: UnifiedConfidenceAdminStatus;
  limit?: number;
  offset?: number;
};

export type UnifiedConfidenceAdminRow = {
  filingId: string;
  orgNumber: string | null;
  companyName: string | null;
  fiscalYear: number | null;
  status: UnifiedConfidenceAdminStatus;
  gateVerdict: UnifiedExtractionGateOverallVerdict | null;
  passCount: number;
  warnCount: number;
  failCount: number;
  insufficientDataCount: number;
  blockingCheckCodes: string[];
  warningCheckCodes: string[];
  financialLineItemCount: number | null;
  narrativeSectionCount: number | null;
  comparisonMatchRate: number | null;
  durationMs: number | null;
  generatedAt: string | null;
  artifactId: string;
  artifactStatus: PdfModelArtifactStatus;
  artifactCreatedAt: string;
  artifactUpdatedAt: string;
  artifactSourceCommand: string | null;
  artifactSourceCommitSha: string | null;
  errors: string[];
  warnings: string[];
};

export type UnifiedConfidenceAdminDetail = UnifiedConfidenceAdminRow & {
  companyId: string | null;
  artifactKind: PdfModelArtifactKind;
  fullChecks: UnifiedExtractionGateCheckResult[];
  safety: {
    canUseForProductionRouting: boolean | null;
    productionRoutingChanged: boolean | null;
    productionFactsMutated: boolean | null;
    publishAffected: boolean | null;
  };
  shadowSummary: RelatedArtifactSummary;
  artifactPayload: unknown;
  artifactSummary: Record<string, unknown>;
};

export type UnifiedConfidenceAdminListResult = {
  items: UnifiedConfidenceAdminRow[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    total: number;
    PASS: number;
    WARN: number;
    FAIL: number;
    INSUFFICIENT_DATA: number;
  };
};

export type UnifiedConfidenceAdminServiceDeps = {
  listArtifacts?: typeof listPersistedPdfModelArtifactSnapshots;
  listFilingsByIds?: typeof listAnnualReportFilingsByIds;
  getFilingById?: typeof getAnnualReportFilingWithArtifacts;
};

function matchesCheckCode(row: UnifiedConfidenceAdminRow, checkCode: string | undefined) {
  if (!checkCode) {
    return true;
  }

  return row.blockingCheckCodes.includes(checkCode) || row.warningCheckCodes.includes(checkCode);
}

async function loadRelatedArtifactsForRows(
  rows: Array<{ filingId: string; orgNumber: string | null; fiscalYear: number | null }>,
  deps: UnifiedConfidenceAdminServiceDeps,
) {
  const orgNumbers = Array.from(new Set(rows.map((row) => row.orgNumber).filter((value): value is string => Boolean(value))));
  const fiscalYears = Array.from(new Set(rows.map((row) => row.fiscalYear).filter((value): value is number => value !== null)));

  if (orgNumbers.length === 0 || fiscalYears.length === 0) {
    return new Map<string, PdfModelArtifactSnapshot>();
  }

  const listArtifacts = deps.listArtifacts ?? listPersistedPdfModelArtifactSnapshots;
  const relatedArtifacts = await listArtifacts({
    kinds: [...RELATED_ARTIFACT_KINDS],
    orgNumbers,
    fiscalYears,
    statuses: [PdfModelArtifactStatus.CREATED],
    limit: 500,
  });

  return buildRelatedArtifactSummaryIndex(relatedArtifacts);
}

function buildRow(
  artifact: PdfModelArtifactSnapshot,
  parsed: GateArtifactParseResult,
  filing: FilingListRecord | null,
  relatedSummary: RelatedArtifactSummary,
): UnifiedConfidenceAdminRow | null {
  if (parsed.filingId === null) {
    return null;
  }

  if (parsed.ok) {
    return {
      filingId: parsed.filingId,
      orgNumber: parsed.orgNumber,
      companyName: filing?.company.name ?? null,
      fiscalYear: parsed.fiscalYear,
      status: parsed.status,
      gateVerdict: parsed.report.overallVerdict,
      passCount: parsed.report.passCount,
      warnCount: parsed.report.warnCount,
      failCount: parsed.report.failCount,
      insufficientDataCount: parsed.report.insufficientDataCount,
      blockingCheckCodes: summarizeCheckCodes(parsed.report.blockingChecks),
      warningCheckCodes: summarizeCheckCodes(parsed.report.warningChecks),
      financialLineItemCount: relatedSummary.financialLineItemCount,
      narrativeSectionCount: relatedSummary.narrativeSectionCount,
      comparisonMatchRate: relatedSummary.comparisonMatchRate,
      durationMs: null,
      generatedAt: parsed.generatedAt,
      artifactId: artifact.id,
      artifactStatus: artifact.status,
      artifactCreatedAt: artifact.createdAt.toISOString(),
      artifactUpdatedAt: artifact.updatedAt.toISOString(),
      artifactSourceCommand: artifact.sourceCommand,
      artifactSourceCommitSha: artifact.sourceCommitSha,
      errors: [],
      warnings: [],
    };
  }

  return {
    filingId: parsed.filingId,
    orgNumber: parsed.orgNumber,
    companyName: filing?.company.name ?? null,
    fiscalYear: parsed.fiscalYear,
    status: "error",
    gateVerdict: parsed.overallVerdict,
    passCount: parsed.passCount ?? 0,
    warnCount: parsed.warnCount ?? 0,
    failCount: parsed.failCount ?? 0,
    insufficientDataCount: parsed.insufficientDataCount ?? 0,
    blockingCheckCodes: parsed.blockingCheckCodes,
    warningCheckCodes: parsed.warningCheckCodes,
    financialLineItemCount: relatedSummary.financialLineItemCount,
    narrativeSectionCount: relatedSummary.narrativeSectionCount,
    comparisonMatchRate: relatedSummary.comparisonMatchRate,
    durationMs: null,
    generatedAt: parsed.generatedAt,
    artifactId: artifact.id,
    artifactStatus: artifact.status,
    artifactCreatedAt: artifact.createdAt.toISOString(),
    artifactUpdatedAt: artifact.updatedAt.toISOString(),
    artifactSourceCommand: artifact.sourceCommand,
    artifactSourceCommitSha: artifact.sourceCommitSha,
    errors: [...parsed.issues],
    warnings: [],
  };
}

function buildSummaryCounts(rows: UnifiedConfidenceAdminRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.gateVerdict) {
        acc[row.gateVerdict] += 1;
      }
      return acc;
    },
    {
      total: 0,
      PASS: 0,
      WARN: 0,
      FAIL: 0,
      INSUFFICIENT_DATA: 0,
    },
  );
}

export async function listUnifiedConfidenceGateResultsForAdmin(
  input: UnifiedConfidenceAdminListInput = {},
  deps: UnifiedConfidenceAdminServiceDeps = {},
): Promise<UnifiedConfidenceAdminListResult> {
  const listArtifacts = deps.listArtifacts ?? listPersistedPdfModelArtifactSnapshots;
  const listFilingsByIds = deps.listFilingsByIds ?? listAnnualReportFilingsByIds;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const artifacts = await listArtifacts({
    kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
    ...(input.orgNumber ? { orgNumber: input.orgNumber } : {}),
    ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
    statuses: [PdfModelArtifactStatus.CREATED, PdfModelArtifactStatus.ARCHIVED],
    limit: 500,
  });

  const parsedArtifacts = artifacts
    .filter((artifact) => artifact.kind === PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE)
    .map((artifact) => ({
    artifact,
    parsed: parseGateArtifact(artifact),
    }));

  const filingIds = Array.from(
    new Set(
      parsedArtifacts
        .map((entry) => entry.parsed.filingId)
        .filter((value): value is string => value !== null),
    ),
  );

  const filings = await listFilingsByIds(filingIds);
  const filingsById = toFilingLookupMap(filings);
  const relatedIndex = await loadRelatedArtifactsForRows(
    parsedArtifacts
      .map((entry) => ({
        filingId: entry.parsed.filingId,
        orgNumber: entry.parsed.orgNumber,
        fiscalYear: entry.parsed.fiscalYear,
      }))
      .filter((entry): entry is { filingId: string; orgNumber: string | null; fiscalYear: number | null } => entry.filingId !== null),
    deps,
  );

  const rows = parsedArtifacts
    .map(({ artifact, parsed }) => {
      const filing = parsed.filingId ? filingsById.get(parsed.filingId) ?? null : null;
      const relatedSummary = parsed.filingId
        ? getRelatedSummaryForFiling(parsed.filingId, relatedIndex)
        : emptyRelatedSummary();
      return buildRow(artifact, parsed, filing, relatedSummary);
    })
    .filter((row): row is UnifiedConfidenceAdminRow => row !== null)
    .filter((row) => (input.verdict ? row.gateVerdict === input.verdict : true))
    .filter((row) => (input.status ? row.status === input.status : true))
    .filter((row) => (input.orgNumber ? row.orgNumber === input.orgNumber : true))
    .filter((row) => (input.fiscalYear !== undefined ? row.fiscalYear === input.fiscalYear : true))
    .filter((row) => matchesCheckCode(row, input.checkCode));

  const total = rows.length;
  const items = rows.slice(offset, offset + limit);

  return {
    items,
    total,
    limit,
    offset,
    summary: buildSummaryCounts(rows),
  };
}

export async function getUnifiedConfidenceGateResultForAdmin(
  filingId: string,
  deps: UnifiedConfidenceAdminServiceDeps = {},
): Promise<UnifiedConfidenceAdminDetail | null> {
  const getFilingById = deps.getFilingById ?? getAnnualReportFilingWithArtifacts;
  const listArtifacts = deps.listArtifacts ?? listPersistedPdfModelArtifactSnapshots;

  const filing = await getFilingById(filingId);
  if (!filing) {
    return null;
  }

  const gateArtifacts = await listArtifacts({
    kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
    orgNumber: filing.company.orgNumber,
    fiscalYear: filing.fiscalYear,
    statuses: [PdfModelArtifactStatus.CREATED, PdfModelArtifactStatus.ARCHIVED],
    limit: 100,
  });

  const matchingArtifact = gateArtifacts
    .filter((artifact) => artifact.kind === PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE)
    .find((artifact) => parseGateArtifact(artifact).filingId === filingId);
  if (!matchingArtifact) {
    return null;
  }

  const parsed = parseGateArtifact(matchingArtifact);
  if (parsed.filingId === null) {
    return null;
  }

  const relatedArtifacts = await listArtifacts({
    kinds: [...RELATED_ARTIFACT_KINDS],
    orgNumber: filing.company.orgNumber,
    fiscalYear: filing.fiscalYear,
    statuses: [PdfModelArtifactStatus.CREATED, PdfModelArtifactStatus.ARCHIVED],
    limit: 100,
  });
  const relatedIndex = buildRelatedArtifactSummaryIndex(relatedArtifacts);
  const relatedSummary = getRelatedSummaryForFiling(filingId, relatedIndex);
  const baseRow = buildRow(
    matchingArtifact,
    parsed,
    filing as FilingListRecord,
    relatedSummary,
  );

  if (!baseRow) {
    return null;
  }

  const payload = asRecord(matchingArtifact.payload);
  const safety = asRecord(payload.safety);

  return {
    ...baseRow,
    companyId: filing.company.id,
    artifactKind: matchingArtifact.kind,
    fullChecks: parsed.ok ? parsed.report.checks : [],
    safety: {
      canUseForProductionRouting: asBoolean(safety.canUseForProductionRouting),
      productionRoutingChanged: asBoolean(safety.productionRoutingChanged),
      productionFactsMutated: asBoolean(safety.productionFactsMutated),
      publishAffected: asBoolean(safety.publishAffected),
    },
    shadowSummary: relatedSummary,
    artifactPayload: matchingArtifact.payload,
    artifactSummary: asRecord(matchingArtifact.summary),
  };
}
