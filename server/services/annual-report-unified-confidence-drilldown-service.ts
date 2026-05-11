import { PdfModelArtifactKind, type PdfModelArtifactSnapshot } from "@prisma/client";

import type { UnifiedParserDocumentArtifact } from "@/integrations/brreg/annual-report-financials/unified-parser-document-model";
import type { UnifiedFinancialStatementExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import type { UnifiedNarrativeExtractionResult } from "@/integrations/brreg/annual-report-financials/unified-narrative-extractor";
import type { AnnualReportLegacyVsUnifiedComparisonReport } from "@/server/services/annual-report-legacy-vs-unified-comparison-service";
import type { UnifiedExtractionGateCheckResult } from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import type { UnifiedConfidenceAdminDetail } from "@/server/services/annual-report-unified-confidence-admin-service";
import { getUnifiedConfidenceGateResultForAdmin } from "@/server/services/annual-report-unified-confidence-admin-service";
import { listPersistedPdfModelArtifactSnapshots } from "@/server/services/pdf-model-artifact-snapshot-service";

const DRILLDOWN_ARTIFACT_KINDS = [
  PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT,
  PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION,
  PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION,
  PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON,
  PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
] as const;

export type DrilldownArtifactStatus = "available" | "missing" | "malformed";

export type DrilldownArtifact<T> = {
  kind: PdfModelArtifactKind;
  status: DrilldownArtifactStatus;
  artifactId: string | null;
  createdAt: string | null;
  summary: Record<string, unknown>;
  data: T | null;
  issues: string[];
};

export type UnifiedConfidenceArtifactAvailability = {
  kind: PdfModelArtifactKind;
  status: DrilldownArtifactStatus;
  artifactId: string | null;
  createdAt: string | null;
  issues: string[];
};

export type UnifiedConfidenceParserSection = {
  sectionId: string;
  kind: string;
  pageStart: number | null;
  pageEnd: number | null;
  textPreview: string;
  confidence: number | null;
};

export type UnifiedConfidenceParserTableSummary = {
  tableId: string;
  role: string | null;
  pageNumber: number | null;
  rowCount: number | null;
  columnCount: number | null;
  title: string | null;
  warnings: string[];
};

export type UnifiedConfidenceParserPageSummary = {
  pageNumber: number | null;
  textCharCount: number | null;
  hasUsefulText: boolean | null;
  hasTableLikeText: boolean | null;
  blockCount: number | null;
  warnings: string[];
};

export type UnifiedConfidenceFinancialLineItem = {
  statementKind: string | null;
  originalLabel: string;
  normalizedLabel: string | null;
  canonicalKey: string | null;
  fiscalYear: number | null;
  value: string | null;
  unitScale: string | null;
  sign: string | null;
  pageNumber: number | null;
  rowIndex: number | null;
  columnIndex: number | null;
  tableId: string | null;
  blockIds: string[];
  confidence: number | null;
  warnings: string[];
};

export type UnifiedConfidenceFinancialStatementSummary = {
  kind: string | null;
  pageNumbers: number[];
  tableIds: string[];
  lineItemCount: number;
  confidence: number | null;
  warnings: string[];
};

export type UnifiedConfidenceNarrativeSignal = {
  keyword: string;
  context: string;
  pageNumber: number | null;
};

export type UnifiedConfidenceNarrativeSection = {
  sectionId: string;
  kind: string | null;
  title: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  confidence: number | null;
  provenance: string | null;
  textPreview: string;
  warnings: string[];
  signals: UnifiedConfidenceNarrativeSignal[];
};

export type UnifiedConfidenceComparisonFact = {
  canonicalKey: string;
  fiscalYear: number | null;
  legacyValueNok: string | null;
  unifiedValueNok: string | null;
  deltaNok: string | null;
  match: string | null;
  relativeDeviation: number | null;
  legacyLabel: string | null;
  unifiedLabel: string | null;
  legacyUnitScale: number | null;
  unifiedUnitScale: string | null;
};

export type UnifiedConfidenceComparisonMismatch = UnifiedConfidenceComparisonFact & {
  severity: "MAJOR" | "MINOR" | "MISSING" | "UNKNOWN";
};

export type UnifiedConfidenceGateCheckContext = {
  checkCode: string;
  verdict: UnifiedExtractionGateCheckResult["verdict"];
  message: string;
  context: string[];
  relatedArtifacts: PdfModelArtifactKind[];
};

export type UnifiedConfidenceFilingDrilldown = {
  detail: UnifiedConfidenceAdminDetail;
  artifacts: {
    availability: UnifiedConfidenceArtifactAvailability[];
    parserDocument: DrilldownArtifact<{
      summary: Record<string, unknown>;
      pageSummaries: UnifiedConfidenceParserPageSummary[];
      sectionSummaries: UnifiedConfidenceParserSection[];
      tableSummaries: UnifiedConfidenceParserTableSummary[];
      warnings: string[];
      errors: string[];
    }>;
    financialExtraction: DrilldownArtifact<{
      statements: UnifiedConfidenceFinancialStatementSummary[];
      lineItems: UnifiedConfidenceFinancialLineItem[];
      warnings: string[];
      errors: string[];
    }>;
    narrativeExtraction: DrilldownArtifact<{
      sections: UnifiedConfidenceNarrativeSection[];
      warnings: string[];
    }>;
    comparison: DrilldownArtifact<{
      summary: Record<string, unknown>;
      financialComparisons: UnifiedConfidenceComparisonFact[];
      mismatches: UnifiedConfidenceComparisonMismatch[];
      narrativeComparisons: Array<Record<string, unknown>>;
      warnings: string[];
    }>;
    confidenceGate: DrilldownArtifact<{
      checks: UnifiedExtractionGateCheckResult[];
    }>;
  };
  gateCheckContext: UnifiedConfidenceGateCheckContext[];
  safety: {
    canUseForProductionRouting: false;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
  };
};

export type UnifiedConfidenceDrilldownServiceDeps = {
  getAdminDetail?: typeof getUnifiedConfidenceGateResultForAdmin;
  listArtifacts?: typeof listPersistedPdfModelArtifactSnapshots;
};

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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => asString(entry)).filter((entry): entry is string => entry !== null)
    : [];
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((entry) => asNumber(entry)).filter((entry): entry is number => entry !== null)
    : [];
}

function sortArtifactsNewestFirst(artifacts: PdfModelArtifactSnapshot[]) {
  return [...artifacts].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function getArtifactFilingId(artifact: PdfModelArtifactSnapshot): string | null {
  const summary = asRecord(artifact.summary);
  const payload = asRecord(artifact.payload);
  const source = asRecord(payload.source);
  const meta = asRecord(payload.meta);
  return asString(summary.filingId) ?? asString(source.filingId) ?? asString(meta.filingId);
}

function selectLatestArtifactByKind(
  filingId: string,
  artifacts: PdfModelArtifactSnapshot[],
): Map<PdfModelArtifactKind, PdfModelArtifactSnapshot> {
  const latest = new Map<PdfModelArtifactKind, PdfModelArtifactSnapshot>();

  for (const artifact of sortArtifactsNewestFirst(artifacts)) {
    if (getArtifactFilingId(artifact) !== filingId) {
      continue;
    }
    if (!latest.has(artifact.kind)) {
      latest.set(artifact.kind, artifact);
    }
  }

  return latest;
}

function baseArtifact<T>(
  kind: PdfModelArtifactKind,
  artifact: PdfModelArtifactSnapshot | undefined,
): DrilldownArtifact<T> {
  if (!artifact) {
    return {
      kind,
      status: "missing",
      artifactId: null,
      createdAt: null,
      summary: {},
      data: null,
      issues: [`${kind} artifact not found for filing.`],
    };
  }

  return {
    kind,
    status: "available",
    artifactId: artifact.id,
    createdAt: artifact.createdAt.toISOString(),
    summary: asRecord(artifact.summary),
    data: null,
    issues: [],
  };
}

function markMalformed<T>(base: DrilldownArtifact<T>, issues: string[]): DrilldownArtifact<T> {
  return {
    ...base,
    status: "malformed",
    data: null,
    issues,
  };
}

function parseParserArtifact(
  artifact: PdfModelArtifactSnapshot | undefined,
): DrilldownArtifact<{
  summary: Record<string, unknown>;
  pageSummaries: UnifiedConfidenceParserPageSummary[];
  sectionSummaries: UnifiedConfidenceParserSection[];
  tableSummaries: UnifiedConfidenceParserTableSummary[];
  warnings: string[];
  errors: string[];
}> {
  const base = baseArtifact<{
    summary: Record<string, unknown>;
    pageSummaries: UnifiedConfidenceParserPageSummary[];
    sectionSummaries: UnifiedConfidenceParserSection[];
    tableSummaries: UnifiedConfidenceParserTableSummary[];
    warnings: string[];
    errors: string[];
  }>(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT, artifact);

  if (!artifact) {
    return base;
  }

  const payload = asRecord(artifact.payload);
  const issues: string[] = [];
  if (payload.version !== "unified-parser-document-v1") {
    issues.push("Parser artifact version is missing or invalid.");
  }
  if (!Array.isArray(payload.pageSummaries)) {
    issues.push("Parser artifact must include pageSummaries.");
  }
  if (!Array.isArray(payload.sectionSummaries)) {
    issues.push("Parser artifact must include sectionSummaries.");
  }
  if (!Array.isArray(payload.tableSummaries)) {
    issues.push("Parser artifact must include tableSummaries.");
  }

  if (issues.length > 0) {
    return markMalformed(base, issues);
  }

  const parser = artifact.payload as UnifiedParserDocumentArtifact;
  return {
    ...base,
    data: {
      summary: asRecord(parser.summary),
      pageSummaries: parser.pageSummaries.map((page) => ({
        pageNumber: asNumber(page.pageNumber),
        textCharCount: asNumber(page.textCharCount),
        hasUsefulText: asBoolean(page.hasUsefulText),
        hasTableLikeText: asBoolean(page.hasTableLikeText),
        blockCount: asNumber(page.blockCount),
        warnings: asStringArray(page.warnings),
      })),
      sectionSummaries: parser.sectionSummaries.map((section) => ({
        sectionId: section.sectionId,
        kind: section.kind,
        pageStart: asNumber(section.pageStart),
        pageEnd: asNumber(section.pageEnd),
        textPreview: section.textPreview,
        confidence: asNumber(section.confidence),
      })),
      tableSummaries: parser.tableSummaries.map((table) => ({
        tableId: table.tableId,
        role: asString(table.role),
        pageNumber: asNumber(table.pageNumber),
        rowCount: asNumber(table.rowCount),
        columnCount: asNumber(table.columnCount),
        title: asString(table.title),
        warnings: asStringArray(table.warnings),
      })),
      warnings: asStringArray(parser.warnings),
      errors: asStringArray(parser.errors),
    },
  };
}

function parseFinancialArtifact(
  artifact: PdfModelArtifactSnapshot | undefined,
): DrilldownArtifact<{
  statements: UnifiedConfidenceFinancialStatementSummary[];
  lineItems: UnifiedConfidenceFinancialLineItem[];
  warnings: string[];
  errors: string[];
}> {
  const base = baseArtifact<{
    statements: UnifiedConfidenceFinancialStatementSummary[];
    lineItems: UnifiedConfidenceFinancialLineItem[];
    warnings: string[];
    errors: string[];
  }>(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION, artifact);

  if (!artifact) {
    return base;
  }

  const payload = asRecord(artifact.payload);
  const issues: string[] = [];
  if (payload.version !== "unified-financial-statement-extraction-v1") {
    issues.push("Financial artifact version is missing or invalid.");
  }
  if (!Array.isArray(payload.statements)) {
    issues.push("Financial artifact must include statements.");
  }

  if (issues.length > 0) {
    return markMalformed(base, issues);
  }

  const result = artifact.payload as UnifiedFinancialStatementExtractionResult;
  const statements = result.statements.map((statement) => ({
    kind: asString(statement.kind),
    pageNumbers: asNumberArray(statement.pageNumbers),
    tableIds: asStringArray(statement.tableIds),
    lineItemCount: statement.lineItems.length,
    confidence: asNumber(statement.confidence),
    warnings: asStringArray(statement.warnings),
  }));
  const lineItems = result.statements.flatMap((statement) =>
    statement.lineItems.map((item) => ({
      statementKind: asString(item.statementKind) ?? asString(statement.kind),
      originalLabel: item.originalLabel,
      normalizedLabel: asString(item.normalizedLabel),
      canonicalKey: asString(item.canonicalKey),
      fiscalYear: asNumber(item.year),
      value: asString(item.value),
      unitScale: asString(item.unitScale),
      sign: asString(item.sign),
      pageNumber: asNumber(item.provenance.pageNumber),
      rowIndex: asNumber(item.provenance.rowIndex),
      columnIndex: asNumber(item.provenance.columnIndex),
      tableId: asString(item.provenance.tableId),
      blockIds: asStringArray(item.provenance.blockIds),
      confidence: asNumber(item.confidence),
      warnings: asStringArray(item.warnings),
    })),
  );

  return {
    ...base,
    data: {
      statements,
      lineItems,
      warnings: asStringArray(result.warnings),
      errors: asStringArray(result.errors),
    },
  };
}

function parseNarrativeArtifact(
  artifact: PdfModelArtifactSnapshot | undefined,
): DrilldownArtifact<{
  sections: UnifiedConfidenceNarrativeSection[];
  warnings: string[];
}> {
  const base = baseArtifact<{
    sections: UnifiedConfidenceNarrativeSection[];
    warnings: string[];
  }>(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION, artifact);

  if (!artifact) {
    return base;
  }

  const payload = asRecord(artifact.payload);
  const issues: string[] = [];
  if (payload.version !== "unified-narrative-extraction-v1") {
    issues.push("Narrative artifact version is missing or invalid.");
  }
  if (!Array.isArray(payload.sections)) {
    issues.push("Narrative artifact must include sections.");
  }

  if (issues.length > 0) {
    return markMalformed(base, issues);
  }

  const result = artifact.payload as UnifiedNarrativeExtractionResult;

  return {
    ...base,
    data: {
      sections: result.sections.map((section) => ({
        sectionId: section.sectionId,
        kind: asString(section.kind),
        title: asString(section.title),
        pageStart: asNumber(section.pageStart),
        pageEnd: asNumber(section.pageEnd),
        confidence: asNumber(section.confidence),
        provenance: asString(section.provenance),
        textPreview: section.textPreview,
        warnings: [],
        signals: section.signals.map((signal) => ({
          keyword: signal.keyword,
          context: signal.context,
          pageNumber: asNumber(signal.pageNumber),
        })),
      })),
      warnings: asStringArray(result.warnings),
    },
  };
}

function comparisonMismatchSeverity(
  match: string | null,
  relativeDeviation: number | null,
): UnifiedConfidenceComparisonMismatch["severity"] {
  if (match === "MISSING_IN_LEGACY" || match === "MISSING_IN_UNIFIED") {
    return "MISSING";
  }
  if (match === "CONFLICTING_VALUES") {
    return relativeDeviation !== null && relativeDeviation >= 0.5 ? "MAJOR" : "MINOR";
  }
  return "UNKNOWN";
}

function parseComparisonArtifact(
  artifact: PdfModelArtifactSnapshot | undefined,
): DrilldownArtifact<{
  summary: Record<string, unknown>;
  financialComparisons: UnifiedConfidenceComparisonFact[];
  mismatches: UnifiedConfidenceComparisonMismatch[];
  narrativeComparisons: Array<Record<string, unknown>>;
  warnings: string[];
}> {
  const base = baseArtifact<{
    summary: Record<string, unknown>;
    financialComparisons: UnifiedConfidenceComparisonFact[];
    mismatches: UnifiedConfidenceComparisonMismatch[];
    narrativeComparisons: Array<Record<string, unknown>>;
    warnings: string[];
  }>(PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON, artifact);

  if (!artifact) {
    return base;
  }

  const payload = asRecord(artifact.payload);
  const issues: string[] = [];
  if (payload.version !== "legacy-vs-unified-comparison-v1") {
    issues.push("Comparison artifact version is missing or invalid.");
  }
  if (!Array.isArray(payload.financialComparisons)) {
    issues.push("Comparison artifact must include financialComparisons.");
  }

  if (issues.length > 0) {
    return markMalformed(base, issues);
  }

  const report = artifact.payload as AnnualReportLegacyVsUnifiedComparisonReport;
  const financialComparisons = report.financialComparisons.map((comparison) => ({
    canonicalKey: comparison.canonicalKey,
    fiscalYear: asNumber(comparison.year),
    legacyValueNok: asString(comparison.legacyValueNok),
    unifiedValueNok: asString(comparison.unifiedValueNok),
    deltaNok: asString(comparison.deltaNok),
    match: asString(comparison.match),
    relativeDeviation: asNumber(comparison.relativeDeviation),
    legacyLabel: asString(comparison.legacyLabel),
    unifiedLabel: asString(comparison.unifiedLabel),
    legacyUnitScale: asNumber(comparison.legacyUnitScale),
    unifiedUnitScale: asString(comparison.unifiedUnitScale),
  }));
  const mismatches = financialComparisons
    .filter((comparison) =>
      comparison.match === "CONFLICTING_VALUES" ||
      comparison.match === "MISSING_IN_LEGACY" ||
      comparison.match === "MISSING_IN_UNIFIED",
    )
    .map((comparison) => ({
      ...comparison,
      severity: comparisonMismatchSeverity(comparison.match, comparison.relativeDeviation),
    }));

  return {
    ...base,
    data: {
      summary: asRecord(report.summary),
      financialComparisons,
      mismatches,
      narrativeComparisons: report.narrativeComparisons.map((comparison) => ({
        kind: comparison.kind,
        legacyFound: comparison.legacyFound,
        unifiedFound: comparison.unifiedFound,
        unifiedSectionKind: comparison.unifiedSectionKind,
        textSimilarity: comparison.textSimilarity,
      })),
      warnings: asStringArray(report.warnings),
    },
  };
}

function parseConfidenceGateArtifact(
  artifact: PdfModelArtifactSnapshot | undefined,
  detail: UnifiedConfidenceAdminDetail,
): DrilldownArtifact<{
  checks: UnifiedExtractionGateCheckResult[];
}> {
  const base = baseArtifact<{
    checks: UnifiedExtractionGateCheckResult[];
  }>(PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE, artifact);

  if (!artifact) {
    return {
      ...base,
      data: {
        checks: detail.fullChecks,
      },
      issues: [],
    };
  }

  const payload = asRecord(artifact.payload);
  if (!Array.isArray(payload.checks)) {
    return markMalformed(base, ["Confidence gate artifact must include checks."]);
  }

  return {
    ...base,
    data: {
      checks: detail.fullChecks,
    },
  };
}

function summarizeCheckContext(
  check: UnifiedExtractionGateCheckResult,
  drilldown: UnifiedConfidenceFilingDrilldown["artifacts"],
  detail: UnifiedConfidenceAdminDetail,
): UnifiedConfidenceGateCheckContext {
  const context: string[] = [];
  const relatedArtifacts: PdfModelArtifactKind[] = [];

  const financial = drilldown.financialExtraction.data;
  const narrative = drilldown.narrativeExtraction.data;
  const comparison = drilldown.comparison.data;
  const parser = drilldown.parserDocument.data;

  switch (check.checkCode) {
    case "FINANCIAL_EXTRACTION_PRESENT":
    case "INCOME_STATEMENT_COVERAGE":
    case "BALANCE_SHEET_COVERAGE":
    case "REVENUE_FOUND":
    case "NET_INCOME_FOUND":
    case "TOTAL_ASSETS_FOUND":
    case "UNIT_SCALE_RESOLVED":
    case "CANONICAL_KEY_COVERAGE":
      relatedArtifacts.push(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION);
      if (financial) {
        context.push(`${financial.statements.length} statements and ${financial.lineItems.length} line items available.`);
        const mapped = financial.lineItems.filter((item) => item.canonicalKey !== null).length;
        context.push(`${mapped} line items have canonical keys.`);
      }
      break;
    case "NARRATIVE_EXTRACTION_PRESENT":
    case "BOARD_REPORT_FOUND":
    case "AUDITOR_REPORT_FOUND":
      relatedArtifacts.push(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION);
      if (narrative) {
        context.push(`${narrative.sections.length} narrative sections available.`);
        const kinds = narrative.sections.map((section) => section.kind).filter((kind): kind is string => kind !== null);
        if (kinds.length > 0) {
          context.push(`Detected kinds: ${kinds.slice(0, 5).join(", ")}${kinds.length > 5 ? " ..." : ""}`);
        }
      }
      break;
    case "COMPARISON_MATCH_RATE":
    case "COMPARISON_NO_MAJOR_MISMATCHES":
      relatedArtifacts.push(PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON);
      if (comparison) {
        context.push(`${comparison.financialComparisons.length} compared facts, ${comparison.mismatches.length} mismatches.`);
        const major = comparison.mismatches.filter((item) => item.severity === "MAJOR").length;
        context.push(`${major} mismatches are classified as major.`);
      }
      break;
    case "SAFETY_FLAGS_CLEAN":
      relatedArtifacts.push(PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE);
      context.push(
        `routing=${detail.safety.canUseForProductionRouting}, routingChanged=${detail.safety.productionRoutingChanged}, factsMutated=${detail.safety.productionFactsMutated}, publishAffected=${detail.safety.publishAffected}`,
      );
      break;
    default:
      if (parser) {
        relatedArtifacts.push(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT);
        context.push(`${parser.sectionSummaries.length} parser sections and ${parser.tableSummaries.length} parser tables available.`);
      }
      break;
  }

  if (context.length === 0) {
    context.push("No additional artifact context available.");
  }

  return {
    checkCode: check.checkCode,
    verdict: check.verdict,
    message: check.message,
    context,
    relatedArtifacts,
  };
}

export async function getUnifiedConfidenceFilingDrilldownForAdmin(
  filingId: string,
  deps: UnifiedConfidenceDrilldownServiceDeps = {},
): Promise<UnifiedConfidenceFilingDrilldown | null> {
  const getAdminDetail = deps.getAdminDetail ?? getUnifiedConfidenceGateResultForAdmin;
  const listArtifacts = deps.listArtifacts ?? listPersistedPdfModelArtifactSnapshots;

  const detail = await getAdminDetail(filingId);
  if (!detail) {
    return null;
  }

  const artifacts = await listArtifacts({
    kinds: [...DRILLDOWN_ARTIFACT_KINDS],
    limit: 500,
  });
  const latestByKind = selectLatestArtifactByKind(filingId, artifacts);

  const parserDocument = parseParserArtifact(latestByKind.get(PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT));
  const financialExtraction = parseFinancialArtifact(latestByKind.get(PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION));
  const narrativeExtraction = parseNarrativeArtifact(latestByKind.get(PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION));
  const comparison = parseComparisonArtifact(latestByKind.get(PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON));
  const confidenceGate = parseConfidenceGateArtifact(latestByKind.get(PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE), detail);

  const artifactBundle = {
    availability: DRILLDOWN_ARTIFACT_KINDS.map((kind) => {
      const artifact =
        kind === PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT
          ? parserDocument
          : kind === PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION
            ? financialExtraction
            : kind === PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION
              ? narrativeExtraction
              : kind === PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON
                ? comparison
                : confidenceGate;

      return {
        kind,
        status: artifact.status,
        artifactId: artifact.artifactId,
        createdAt: artifact.createdAt,
        issues: artifact.issues,
      };
    }),
    parserDocument,
    financialExtraction,
    narrativeExtraction,
    comparison,
    confidenceGate,
  };

  const gateCheckContext = detail.fullChecks
    .filter((check) => check.verdict === "FAIL" || check.verdict === "WARN")
    .map((check) => summarizeCheckContext(check, artifactBundle, detail));

  return {
    detail,
    artifacts: artifactBundle,
    gateCheckContext,
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
  };
}
