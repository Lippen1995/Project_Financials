import { PdfModelArtifactKind } from "@prisma/client";

import { listPdfModelArtifactSnapshots } from "@/server/persistence/pdf-model-artifact-snapshot-repository";

// ---- Domain types -----------------------------------------------------------

export type PdfParserRoute = "TEXT_LAYER" | "OCR" | "OPENDATALOADER_LOCAL" | "HYBRID";

export type RouteComparisonStatus =
  | "SUCCESS"
  | "RUNTIME_UNAVAILABLE"
  | "FAILED"
  | "SKIPPED"
  | "BASELINE";

export type DocumentOutcome =
  | "ALTERNATIVE_BETTER"
  | "TEXT_LAYER_BEST"
  | "TIE"
  | "INSUFFICIENT_DATA"
  | "ALL_ALTERNATIVES_UNAVAILABLE"
  | "ALL_ALTERNATIVES_FAILED";

export interface RouteComparisonSummary {
  route: PdfParserRoute;
  status: RouteComparisonStatus;
  qualityScore: number | null;
  financialsDetected: boolean | null;
  boardReportDetected: boolean | null;
  auditorReportDetected: boolean | null;
  financialCoverageScore: number | null;
  tableCount: number | null;
  lineItemCount: number | null;
  warningsCount: number;
  errorsCount: number;
  scoreBreakdown: string[];
  insufficientDetail: boolean;
}

export interface DocumentComparison {
  annualReportId: string;
  organizationNumber: string | null;
  fiscalYear: number | null;
  artifactId: string;
  createdAt: string;
  bestRoute: PdfParserRoute | null;
  bestRouteReason: string;
  baseline: RouteComparisonSummary;
  alternatives: RouteComparisonSummary[];
  outcome: DocumentOutcome;
  comparisonScoreDelta: number | null;
  warnings: string[];
}

export interface RouteMetrics {
  route: PdfParserRoute;
  documentsCompared: number;
  successCount: number;
  runtimeUnavailableCount: number;
  failedCount: number;
  skippedCount: number;
  financialsDetectedCount: number;
  boardReportDetectedCount: number;
  auditorReportDetectedCount: number;
  averageFinancialCoverageScore: number | null;
  averageTableCount: number | null;
  averageLineItemCount: number | null;
  averageWarningsCount: number | null;
  averageErrorsCount: number | null;
  averageQualityScore: number | null;
}

export interface TopOpportunity {
  annualReportId: string;
  organizationNumber: string | null;
  fiscalYear: number | null;
  suggestedRoute: PdfParserRoute;
  baselineScore: number;
  alternativeScore: number;
  delta: number;
  reasons: string[];
}

export interface TopFailure {
  annualReportId: string;
  route: string;
  status: "FAILED" | "RUNTIME_UNAVAILABLE" | "SKIPPED";
  reason: string;
}

export interface PdfParserRouteQualityComparisonReport {
  schemaVersion: 1;
  generatedAt: string;
  artifactKind: "PARSER_ROUTE_SHADOW_EXECUTION";
  filters: {
    from?: string;
    to?: string;
    fiscalYear?: number;
    organizationNumber?: string;
    routes?: PdfParserRoute[];
    limit: number;
  };
  corpus: {
    artifactCount: number;
    documentCount: number;
    malformedArtifactCount: number;
    successfulRouteRuns: number;
    failedRouteRuns: number;
    unavailableRouteRuns: number;
    skippedRouteRuns: number;
    insufficientData: boolean;
    insufficientDataReasons: string[];
  };
  routeMetrics: RouteMetrics[];
  documentComparisons: DocumentComparison[];
  topOpportunities: TopOpportunity[];
  topFailures: TopFailure[];
  safety: {
    readOnly: true;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
    shadowOnly: true;
  };
}

export interface PdfParserRouteQualityComparisonInput {
  from?: string;
  to?: string;
  fiscalYear?: number;
  organizationNumber?: string;
  routes?: PdfParserRoute[];
  limit?: number;
  includeDocumentDetails?: boolean;
  minimumSuccessfulAlternativeRoutes?: number;
}

// ---- Artifact payload shapes (parsed defensively) ---------------------------

interface ArtifactFinancials {
  detected?: unknown;
  candidatePages?: unknown;
  lineItemCount?: unknown;
  tableCount?: unknown;
  coverageScore?: unknown;
}

interface ArtifactSection {
  detected?: unknown;
  candidatePages?: unknown;
  charCount?: unknown;
}

interface ArtifactRouteSummary {
  pageCount?: unknown;
  pagesProcessed?: unknown;
  financials?: ArtifactFinancials;
  boardReport?: ArtifactSection;
  auditorReport?: ArtifactSection;
  warnings?: unknown;
  errors?: unknown;
}

interface ArtifactRouteEntry {
  route?: unknown;
  status?: unknown;
  runtime?: unknown;
  durationMs?: unknown;
  summary?: ArtifactRouteSummary | null;
  errorCode?: unknown;
  errorMessage?: unknown;
}

interface ArtifactProductionBaseline {
  route?: unknown;
  mode?: unknown;
  confidenceScore?: unknown;
  validationScore?: unknown;
  runStatus?: unknown;
  filingStatus?: unknown;
}

interface ArtifactPayload {
  schemaVersion?: unknown;
  kind?: unknown;
  createdAt?: unknown;
  input?: {
    annualReportId?: unknown;
    organizationNumber?: unknown;
    fiscalYear?: unknown;
    requestedRoutes?: unknown;
    source?: unknown;
    reason?: unknown;
  };
  productionBaseline?: ArtifactProductionBaseline;
  routes?: ArtifactRouteEntry[];
  safety?: {
    productionRoutingChanged?: unknown;
    productionFactsMutated?: unknown;
    publishAffected?: unknown;
    shadowOnly?: unknown;
  };
}

// ---- Defensive payload parsing ----------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function parsePayload(raw: unknown): { payload: ArtifactPayload; issues: string[] } {
  const issues: string[] = [];
  const p = asRecord(raw);

  if (p.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (p.kind !== "PARSER_ROUTE_SHADOW_EXECUTION") issues.push("kind must be PARSER_ROUTE_SHADOW_EXECUTION");

  const safety = asRecord(p.safety);
  if (safety.productionRoutingChanged !== false) issues.push("safety.productionRoutingChanged is not false");
  if (safety.productionFactsMutated !== false) issues.push("safety.productionFactsMutated is not false");
  if (safety.shadowOnly !== true) issues.push("safety.shadowOnly is not true");

  if (!Array.isArray(p.routes)) issues.push("routes must be an array");

  return { payload: p as unknown as ArtifactPayload, issues };
}

// ---- Scoring ----------------------------------------------------------------

const SCORE_FINANCIALS = 30;
const SCORE_BOARD_REPORT = 20;
const SCORE_AUDITOR_REPORT = 20;
const SCORE_COVERAGE_MAX = 10;
const SCORE_TABLES_MAX = 8;
const SCORE_TABLE_NORMALIZE_AT = 5;
const SCORE_LINE_ITEMS_MAX = 6;
const SCORE_LINE_ITEMS_NORMALIZE_AT = 50;
const SCORE_WARNING_PENALTY = 5;
const SCORE_WARNING_CAP = 2;
const SCORE_ERROR_PENALTY = 10;
const SCORE_ERROR_CAP = 1;

function scoreRouteSummary(
  summary: ArtifactRouteSummary,
): { score: number; breakdown: string[] } {
  const breakdown: string[] = [];
  let score = 0;

  const financials = asRecord(summary.financials);
  const boardReport = asRecord(summary.boardReport);
  const auditorReport = asRecord(summary.auditorReport);

  if (asBool(financials.detected)) {
    score += SCORE_FINANCIALS;
    breakdown.push(`+${SCORE_FINANCIALS} financials detected`);
  }
  if (asBool(boardReport.detected)) {
    score += SCORE_BOARD_REPORT;
    breakdown.push(`+${SCORE_BOARD_REPORT} board report detected`);
  }
  if (asBool(auditorReport.detected)) {
    score += SCORE_AUDITOR_REPORT;
    breakdown.push(`+${SCORE_AUDITOR_REPORT} auditor report detected`);
  }

  const coverage = asNum(financials.coverageScore);
  if (coverage !== null) {
    const pts = Math.round(Math.min(Math.max(coverage, 0), 1) * SCORE_COVERAGE_MAX);
    score += pts;
    breakdown.push(`+${pts} coverage score (${coverage.toFixed(2)})`);
  }

  const tables = asNum(financials.tableCount);
  if (tables !== null) {
    const pts = Math.round((Math.min(tables, SCORE_TABLE_NORMALIZE_AT) / SCORE_TABLE_NORMALIZE_AT) * SCORE_TABLES_MAX);
    score += pts;
    breakdown.push(`+${pts} table count (${tables})`);
  }

  const lineItems = asNum(financials.lineItemCount);
  if (lineItems !== null) {
    const pts = Math.round(
      (Math.min(lineItems, SCORE_LINE_ITEMS_NORMALIZE_AT) / SCORE_LINE_ITEMS_NORMALIZE_AT) *
        SCORE_LINE_ITEMS_MAX,
    );
    score += pts;
    breakdown.push(`+${pts} line items (${lineItems})`);
  }

  const warnings = asArr<unknown>(summary.warnings).length;
  if (warnings > 0) {
    const penalty = Math.min(warnings, SCORE_WARNING_CAP) * SCORE_WARNING_PENALTY;
    score -= penalty;
    breakdown.push(`-${penalty} warnings (${warnings})`);
  }

  const errors = asArr<unknown>(summary.errors).length;
  if (errors > 0) {
    const penalty = Math.min(errors, SCORE_ERROR_CAP) * SCORE_ERROR_PENALTY;
    score -= penalty;
    breakdown.push(`-${penalty} errors (${errors})`);
  }

  return { score: Math.max(0, score), breakdown };
}

function scoreBaselineConservative(
  baseline: ArtifactProductionBaseline,
): { score: number; breakdown: string[]; insufficientDetail: boolean } {
  const breakdown: string[] = [];
  let score = 0;

  // Production documents that have a run are assumed to have extracted financials
  const confidenceScore = asNum(baseline.confidenceScore);
  const runStatus = asStr(baseline.runStatus);
  const hasRun = runStatus === "SUCCEEDED" || runStatus === "MANUAL_REVIEW";

  if (hasRun) {
    score += SCORE_FINANCIALS;
    breakdown.push(`+${SCORE_FINANCIALS} financials assumed (production run exists)`);
  }

  if (confidenceScore !== null) {
    const pts = Math.round(confidenceScore * 40);
    score += pts;
    breakdown.push(`+${pts} confidence score proxy (${confidenceScore.toFixed(2)})`);
  }

  return {
    score: Math.max(0, score),
    breakdown,
    insufficientDetail: true,
  };
}

function buildBaselineSummary(baseline: ArtifactProductionBaseline): RouteComparisonSummary {
  const { score, breakdown, insufficientDetail } = scoreBaselineConservative(baseline);
  return {
    route: "TEXT_LAYER",
    status: "BASELINE",
    qualityScore: score,
    financialsDetected: null,
    boardReportDetected: null,
    auditorReportDetected: null,
    financialCoverageScore: null,
    tableCount: null,
    lineItemCount: null,
    warningsCount: 0,
    errorsCount: 0,
    scoreBreakdown: breakdown,
    insufficientDetail,
  };
}

const VALID_STATUSES = new Set(["SUCCESS", "RUNTIME_UNAVAILABLE", "FAILED", "SKIPPED"]);
const VALID_ROUTES = new Set<string>(["OCR", "OPENDATALOADER_LOCAL", "HYBRID", "TEXT_LAYER"]);

function buildAlternativeSummary(entry: ArtifactRouteEntry): RouteComparisonSummary {
  const routeStr = asStr(entry.route) ?? "UNKNOWN";
  const route = VALID_ROUTES.has(routeStr) ? (routeStr as PdfParserRoute) : "OCR";
  const statusStr = asStr(entry.status) ?? "SKIPPED";
  const status = VALID_STATUSES.has(statusStr) ? (statusStr as RouteComparisonStatus) : "SKIPPED";

  if (status !== "SUCCESS" || !entry.summary) {
    const runtime = asRecord(entry.runtime);
    const reason =
      asStr(entry.errorMessage) ??
      asStr(runtime.reason) ??
      asStr(entry.errorCode) ??
      status.toLowerCase();
    return {
      route,
      status,
      qualityScore: null,
      financialsDetected: null,
      boardReportDetected: null,
      auditorReportDetected: null,
      financialCoverageScore: null,
      tableCount: null,
      lineItemCount: null,
      warningsCount: 0,
      errorsCount: 0,
      scoreBreakdown: [reason],
      insufficientDetail: false,
    };
  }

  const s = entry.summary;
  const financials = asRecord(s.financials);
  const boardReport = asRecord(s.boardReport);
  const auditorReport = asRecord(s.auditorReport);
  const { score, breakdown } = scoreRouteSummary(s);

  return {
    route,
    status: "SUCCESS",
    qualityScore: score,
    financialsDetected: asBool(financials.detected),
    boardReportDetected: asBool(boardReport.detected),
    auditorReportDetected: asBool(auditorReport.detected),
    financialCoverageScore: asNum(financials.coverageScore),
    tableCount: asNum(financials.tableCount),
    lineItemCount: asNum(financials.lineItemCount),
    warningsCount: asArr<unknown>(s.warnings).length,
    errorsCount: asArr<unknown>(s.errors).length,
    scoreBreakdown: breakdown,
    insufficientDetail: false,
  };
}

// ---- Document comparison ----------------------------------------------------

function determineOutcome(
  baseline: RouteComparisonSummary,
  alternatives: RouteComparisonSummary[],
): { outcome: DocumentOutcome; bestRoute: PdfParserRoute | null; bestRouteReason: string; delta: number | null } {
  const successAlts = alternatives.filter((a) => a.status === "SUCCESS" && a.qualityScore !== null);

  if (alternatives.every((a) => a.status === "RUNTIME_UNAVAILABLE")) {
    return {
      outcome: "ALL_ALTERNATIVES_UNAVAILABLE",
      bestRoute: "TEXT_LAYER",
      bestRouteReason: "All alternative routes are runtime unavailable — TEXT_LAYER remains default.",
      delta: null,
    };
  }

  if (alternatives.every((a) => a.status === "FAILED" || a.status === "SKIPPED" || a.status === "RUNTIME_UNAVAILABLE") && successAlts.length === 0) {
    return {
      outcome: "ALL_ALTERNATIVES_FAILED",
      bestRoute: "TEXT_LAYER",
      bestRouteReason: "All alternative routes failed or were skipped — TEXT_LAYER remains default.",
      delta: null,
    };
  }

  if (successAlts.length === 0) {
    return {
      outcome: "INSUFFICIENT_DATA",
      bestRoute: null,
      bestRouteReason: "No successful alternative route runs to compare.",
      delta: null,
    };
  }

  const baselineScore = baseline.qualityScore ?? 0;
  const bestAlt = successAlts.reduce((best, alt) =>
    (alt.qualityScore ?? 0) > (best.qualityScore ?? 0) ? alt : best,
  );
  const bestAltScore = bestAlt.qualityScore ?? 0;
  const delta = bestAltScore - baselineScore;

  if (Math.abs(delta) <= 2) {
    return {
      outcome: "TIE",
      bestRoute: "TEXT_LAYER",
      bestRouteReason: `Score delta ${delta.toFixed(1)} is within tie threshold (±2) — keeping TEXT_LAYER.`,
      delta,
    };
  }

  if (delta > 2) {
    return {
      outcome: "ALTERNATIVE_BETTER",
      bestRoute: bestAlt.route,
      bestRouteReason: `${bestAlt.route} scores ${bestAltScore.toFixed(1)} vs TEXT_LAYER ${baselineScore.toFixed(1)} (delta +${delta.toFixed(1)}).`,
      delta,
    };
  }

  return {
    outcome: "TEXT_LAYER_BEST",
    bestRoute: "TEXT_LAYER",
    bestRouteReason: `TEXT_LAYER scores ${baselineScore.toFixed(1)}, best alternative ${bestAlt.route} scores ${bestAltScore.toFixed(1)} (delta ${delta.toFixed(1)}).`,
    delta,
  };
}

function buildDocumentWarnings(
  baseline: RouteComparisonSummary,
  alternatives: RouteComparisonSummary[],
): string[] {
  const warnings: string[] = [];
  if (baseline.insufficientDetail) {
    warnings.push("TEXT_LAYER baseline uses confidence score proxy — section/table detail unavailable.");
  }
  const unavailable = alternatives.filter((a) => a.status === "RUNTIME_UNAVAILABLE");
  if (unavailable.length > 0) {
    warnings.push(`${unavailable.map((a) => a.route).join(", ")} runtime unavailable — no comparison data.`);
  }
  return warnings;
}

// ---- Route-level metrics aggregation ----------------------------------------

function computeRouteMetrics(
  route: PdfParserRoute,
  summaries: RouteComparisonSummary[],
): RouteMetrics {
  const routeSummaries = summaries.filter((s) => s.route === route);
  const successes = routeSummaries.filter((s) => s.status === "SUCCESS");

  function avgOrNull(values: number[]): number | null {
    if (values.length === 0) return null;
    return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
  }

  return {
    route,
    documentsCompared: routeSummaries.length,
    successCount: successes.length,
    runtimeUnavailableCount: routeSummaries.filter((s) => s.status === "RUNTIME_UNAVAILABLE").length,
    failedCount: routeSummaries.filter((s) => s.status === "FAILED").length,
    skippedCount: routeSummaries.filter((s) => s.status === "SKIPPED").length,
    financialsDetectedCount: successes.filter((s) => s.financialsDetected === true).length,
    boardReportDetectedCount: successes.filter((s) => s.boardReportDetected === true).length,
    auditorReportDetectedCount: successes.filter((s) => s.auditorReportDetected === true).length,
    averageFinancialCoverageScore: avgOrNull(successes.map((s) => s.financialCoverageScore).filter((v): v is number => v !== null)),
    averageTableCount: avgOrNull(successes.map((s) => s.tableCount).filter((v): v is number => v !== null)),
    averageLineItemCount: avgOrNull(successes.map((s) => s.lineItemCount).filter((v): v is number => v !== null)),
    averageWarningsCount: avgOrNull(routeSummaries.map((s) => s.warningsCount)),
    averageErrorsCount: avgOrNull(routeSummaries.map((s) => s.errorsCount)),
    averageQualityScore: avgOrNull(successes.map((s) => s.qualityScore).filter((v): v is number => v !== null)),
  };
}

// ---- Main service function --------------------------------------------------

export async function buildPdfParserRouteQualityComparisonReport(
  input?: PdfParserRouteQualityComparisonInput,
  deps?: {
    listArtifacts?: typeof listPdfModelArtifactSnapshots;
  },
): Promise<PdfParserRouteQualityComparisonReport> {
  const limit = Math.min(input?.limit ?? 100, 500);
  const listFn = deps?.listArtifacts ?? listPdfModelArtifactSnapshots;

  const artifacts = await listFn({
    kind: PdfModelArtifactKind.PARSER_ROUTE_SHADOW_EXECUTION,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.organizationNumber,
    limit,
  });

  const fromDate = input?.from ? new Date(input.from) : null;
  const toDate = input?.to ? new Date(input.to) : null;

  const filtered = artifacts.filter((a) => {
    if (fromDate && a.createdAt < fromDate) return false;
    if (toDate && a.createdAt > toDate) return false;
    return true;
  });

  const documentComparisons: DocumentComparison[] = [];
  const allAlternativeSummaries: RouteComparisonSummary[] = [];
  let malformedCount = 0;
  let successfulRouteRuns = 0;
  let failedRouteRuns = 0;
  let unavailableRouteRuns = 0;
  let skippedRouteRuns = 0;
  const topFailures: TopFailure[] = [];

  for (const artifact of filtered) {
    const { payload, issues } = parsePayload(artifact.payload);

    if (issues.length > 0) {
      malformedCount++;
      continue;
    }

    const inputSection = asRecord(payload.input);
    const annualReportId = asStr(inputSection.annualReportId) ?? artifact.id;
    const orgNumber = asStr(inputSection.organizationNumber) ?? artifact.orgNumber;
    const fiscalYear = asNum(inputSection.fiscalYear) ?? artifact.fiscalYear;

    const baseline = buildBaselineSummary(payload.productionBaseline ?? {});
    const routeEntries = asArr<ArtifactRouteEntry>(payload.routes);

    // Apply route filter
    const wantedRoutes = input?.routes;
    const relevantEntries = wantedRoutes
      ? routeEntries.filter((e) => wantedRoutes.includes(asStr(e.route) as PdfParserRoute))
      : routeEntries;

    const alternatives = relevantEntries.map(buildAlternativeSummary);

    for (const alt of alternatives) {
      allAlternativeSummaries.push(alt);
      if (alt.status === "SUCCESS") successfulRouteRuns++;
      else if (alt.status === "FAILED") {
        failedRouteRuns++;
        topFailures.push({
          annualReportId,
          route: alt.route,
          status: "FAILED",
          reason: alt.scoreBreakdown[0] ?? "unknown",
        });
      } else if (alt.status === "RUNTIME_UNAVAILABLE") {
        unavailableRouteRuns++;
        topFailures.push({
          annualReportId,
          route: alt.route,
          status: "RUNTIME_UNAVAILABLE",
          reason: alt.scoreBreakdown[0] ?? "binary_not_configured",
        });
      } else if (alt.status === "SKIPPED") {
        skippedRouteRuns++;
      }
    }

    const { outcome, bestRoute, bestRouteReason, delta } = determineOutcome(baseline, alternatives);
    const warnings = buildDocumentWarnings(baseline, alternatives);

    documentComparisons.push({
      annualReportId,
      organizationNumber: orgNumber,
      fiscalYear,
      artifactId: artifact.id,
      createdAt: artifact.createdAt.toISOString(),
      bestRoute,
      bestRouteReason,
      baseline,
      alternatives,
      outcome,
      comparisonScoreDelta: delta,
      warnings,
    });
  }

  // Route metrics — only for alternative routes (not TEXT_LAYER baseline)
  const alternativeRoutes: PdfParserRoute[] = ["OCR", "OPENDATALOADER_LOCAL", "HYBRID"];
  const presentRoutes = alternativeRoutes.filter((r) =>
    allAlternativeSummaries.some((s) => s.route === r),
  );

  // TEXT_LAYER baseline metrics (synthetic from baselines)
  const baselineMetrics: RouteMetrics = {
    route: "TEXT_LAYER",
    documentsCompared: documentComparisons.length,
    successCount: documentComparisons.length,
    runtimeUnavailableCount: 0,
    failedCount: 0,
    skippedCount: 0,
    financialsDetectedCount: 0,
    boardReportDetectedCount: 0,
    auditorReportDetectedCount: 0,
    averageFinancialCoverageScore: null,
    averageTableCount: null,
    averageLineItemCount: null,
    averageWarningsCount: null,
    averageErrorsCount: null,
    averageQualityScore: (() => {
      const scores = documentComparisons.map((d) => d.baseline.qualityScore).filter((s): s is number => s !== null);
      if (scores.length === 0) return null;
      return Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4));
    })(),
  };

  const routeMetrics: RouteMetrics[] = [
    baselineMetrics,
    ...presentRoutes.map((r) => computeRouteMetrics(r, allAlternativeSummaries)),
  ];

  // Top opportunities — documents where an alternative is clearly better
  const topOpportunities: TopOpportunity[] = documentComparisons
    .filter((d) => d.outcome === "ALTERNATIVE_BETTER" && d.comparisonScoreDelta !== null)
    .sort((a, b) => (b.comparisonScoreDelta ?? 0) - (a.comparisonScoreDelta ?? 0))
    .slice(0, 20)
    .map((d) => {
      const bestAlt = d.alternatives.find((a) => a.route === d.bestRoute);
      const reasons: string[] = [];
      if (bestAlt?.financialsDetected) reasons.push("financials detected");
      if (bestAlt?.boardReportDetected) reasons.push("board report detected");
      if (bestAlt?.auditorReportDetected) reasons.push("auditor report detected");
      if (bestAlt != null && bestAlt.financialCoverageScore !== null) reasons.push(`coverage ${bestAlt.financialCoverageScore?.toFixed(2)}`);
      return {
        annualReportId: d.annualReportId,
        organizationNumber: d.organizationNumber,
        fiscalYear: d.fiscalYear,
        suggestedRoute: d.bestRoute as PdfParserRoute,
        baselineScore: d.baseline.qualityScore ?? 0,
        alternativeScore: bestAlt?.qualityScore ?? 0,
        delta: d.comparisonScoreDelta ?? 0,
        reasons,
      };
    });

  // Insufficient data warnings
  const insufficientDataReasons: string[] = [];
  if (filtered.length === 0) insufficientDataReasons.push("No PARSER_ROUTE_SHADOW_EXECUTION artifacts found.");
  if (filtered.length < 5) insufficientDataReasons.push(`Only ${filtered.length} artifact(s) — aggregate metrics may not be representative.`);
  if (successfulRouteRuns === 0) insufficientDataReasons.push("No successful alternative route runs — comparison limited to availability data.");
  const insufficientData = insufficientDataReasons.length > 0;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    artifactKind: "PARSER_ROUTE_SHADOW_EXECUTION",
    filters: {
      from: input?.from,
      to: input?.to,
      fiscalYear: input?.fiscalYear,
      organizationNumber: input?.organizationNumber,
      routes: input?.routes,
      limit,
    },
    corpus: {
      artifactCount: filtered.length,
      documentCount: documentComparisons.length,
      malformedArtifactCount: malformedCount,
      successfulRouteRuns,
      failedRouteRuns,
      unavailableRouteRuns,
      skippedRouteRuns,
      insufficientData,
      insufficientDataReasons,
    },
    routeMetrics,
    documentComparisons,
    topOpportunities,
    topFailures: topFailures.slice(0, 50),
    safety: {
      readOnly: true,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
      shadowOnly: true,
    },
  };
}

// ---- Serialization / validation ---------------------------------------------

function hasInvalidNumber(v: unknown): boolean {
  if (typeof v === "number") return !Number.isFinite(v);
  if (Array.isArray(v)) return v.some(hasInvalidNumber);
  if (v && typeof v === "object")
    return Object.values(v as Record<string, unknown>).some(hasInvalidNumber);
  return false;
}

export function serializePdfParserRouteQualityComparisonReport(
  report: PdfParserRouteQualityComparisonReport,
): string {
  return JSON.stringify(report, null, 2);
}

export function validatePdfParserRouteQualityComparisonReport(
  report: PdfParserRouteQualityComparisonReport,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (report.schemaVersion !== 1) issues.push("schemaVersion must be 1.");
  if (report.artifactKind !== "PARSER_ROUTE_SHADOW_EXECUTION") issues.push("artifactKind must be PARSER_ROUTE_SHADOW_EXECUTION.");
  if (report.safety.readOnly !== true) issues.push("safety.readOnly must be true.");
  if (report.safety.productionRoutingChanged !== false) issues.push("safety.productionRoutingChanged must be false.");
  if (report.safety.productionFactsMutated !== false) issues.push("safety.productionFactsMutated must be false.");
  if (report.safety.shadowOnly !== true) issues.push("safety.shadowOnly must be true.");
  if (hasInvalidNumber(report)) issues.push("Report contains NaN or Infinity.");
  try {
    JSON.stringify(report);
  } catch {
    issues.push("Report is not JSON-safe.");
  }
  return { valid: issues.length === 0, issues };
}
