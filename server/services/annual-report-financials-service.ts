import crypto from "node:crypto";
import { AnnualReportFilingStatus, AnnualReportReviewStatus, FinancialFactStatementType, Prisma } from "@prisma/client";
import { BrregFinancialsProvider } from "@/integrations/brreg/brreg-financials-provider";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  buildClassificationIssues,
  calculateConfidenceScore,
  canPublishAutomatically,
  canPublishProvisionally,
  hasKnownUnitScale,
} from "@/integrations/brreg/annual-report-financials/publish-gate";
import { buildNormalizedFinancialPayload } from "@/integrations/brreg/annual-report-financials/normalized-payload";
import { extractOcrPagesBatched, extractOcrPagesWithDiagnostics } from "@/integrations/brreg/annual-report-financials/ocr";
import { selectivelyMergeOcrScaleFacts } from "@/integrations/brreg/annual-report-financials/ocr-scale-fact-merge";
import { isPageReliable, preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { reconstructStatementRows } from "@/integrations/brreg/annual-report-financials/table-reconstruction";
import { computePageConfidences, PageConfidence } from "@/integrations/brreg/annual-report-financials/page-confidence";
import {
  classifyConstraintCause,
  computeEngineConsensus,
  consensusConfidenceDelta,
  ConstraintCause,
  EngineConsensus,
} from "@/integrations/brreg/annual-report-financials/engine-consensus";
import {
  reconcileStatementRowsAcrossOcrScales,
} from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";
import {
  buildAlternativeRowsForRecovery,
  buildStatementRowsPreferGeometryFirst,
  loopCandidateWins,
  selectRecoveryCandidates,
} from "@/integrations/brreg/annual-report-financials/extraction-loop";
import { CanonicalMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";
import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";
import { AnnualReportParsedInputPage, CanonicalFactCandidate, PageClassification, ValidationIssueDraft } from "@/integrations/brreg/annual-report-financials/types";
import {
  AnnualReportDocument,
  AnnualReportDocumentDiagnostics,
  StructuredDocumentArtifactPayload,
} from "@/integrations/brreg/annual-report-financials/document-model";
import { getFinancialExtractionPageHints } from "@/integrations/brreg/annual-report-financials/financial-extraction-page-hints";
import {
  buildPdfDecisionArtifactPayload,
  runPdfDecisionEngine,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-engine";
import { getActivePdfDecisionRuleConfig } from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import type {
  PdfDecisionResult,
  PdfDecisionValidationSummary,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-types";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import { chooseCanonicalFacts, mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import type { MetricDefinition } from "@/integrations/brreg/annual-report-financials/taxonomy";
import { loadMetricDefinitions } from "@/server/services/metric-mapping-service";
import { loadRequiredPublishMetricKeys } from "@/server/services/canonical-registry-service";
import {
  evaluateNodeMatches,
  type NodeEvalConfig,
} from "@/integrations/brreg/annual-report-financials/presentation-node-evaluation";
import { loadNodeEvaluationConfig } from "@/server/services/presentation-node-service";
import { mapBrregFinancialStatement } from "@/integrations/brreg/mappers";
import { getHeadlineFinancialStatements } from "@/lib/financial-statements";
import { DataAvailability, NormalizedFinancialDocument, NormalizedFinancialStatement } from "@/lib/types";
import { logRecoverableError } from "@/lib/recoverable-error";
import { buildOpenDataLoaderComparisonSummary } from "@/server/document-understanding/opendataloader-comparison";
import {
  chooseOpenDataLoaderRoute,
  resolveOpenDataLoaderConfig,
} from "@/server/document-understanding/opendataloader-config";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import {
  OpenDataLoaderComparisonSummary,
  OpenDataLoaderParseResult,
  OpenDataLoaderPipelineSnapshot,
} from "@/server/document-understanding/opendataloader-types";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { toSafeNumber } from "@/server/financials/number-utils";
import {
  completeFinancialExtractionRun,
  claimAnnualReportFilingForProcessing,
  createAnnualReportArtifact,
  createAnnualReportFilingVersion,
  createFinancialExtractionRun,
  createFinancialFacts,
  createFinancialValidationIssues,
  findCompanyByOrgNumber,
  getAnnualReportFilingWithArtifacts,
  getAnnualReportPipelineMetrics,
  getPublishedFinancialsForCompany,
  listCompaniesForFinancialSync,
  listAnnualReportFilingsForReprocessing,
  listLatestAnnualReportFilingsForCompany,
  listPendingAnnualReportFilings,
  listAnnualReportReviews,
  publishMachineFinancialLineItems,
  type PublishedMachineFinancialLineItemDraft,
  publishFinancialStatementSnapshot,
  registerAnnualReportHashVersion,
  resolveAnnualReportReviewsForFiling,
  updateAnnualReportReviewStatus,
  upsertAnnualReportReview,
  upsertAnnualReportFilingDiscovery,
  upsertCompanyFinancialCoverage,
  updateAnnualReportFiling,
} from "@/server/persistence/annual-report-ingestion-repository";
import {
  getAnnualReportUnifiedShadowConfigFromEnv,
  validateAnnualReportUnifiedShadowConfig,
} from "@/server/services/annual-report-unified-shadow-config";
import {
  runAnnualReportUnifiedShadowExtraction,
  type AnnualReportUnifiedShadowResult,
} from "@/server/services/annual-report-unified-shadow-extraction-service";
import type {
  UnifiedFinancialStatementExtractionResult,
  UnifiedFinancialStatementKind,
  UnifiedUnitScale,
} from "@/integrations/brreg/annual-report-financials/unified-financial-statement-extractor";
import { createAdminNotificationIfMissing } from "@/server/services/admin-notification-service";
import { runUnitScaleShadowComparison } from "@/server/ml/unit-scale-shadow-service";
import { runFinancialFactShadowComparison } from "@/server/ml/financial-fact-shadow-service";
import { rankCanonicalAccuracyFacts } from "@/server/services/extraction-accuracy-fact-ranker";
import {
  resolveUnitScaleClassifications,
  type UnitScaleResolutionMode,
} from "@/server/ml/unit-scale-resolution-service";
import env from "@/lib/env";

const provider = new BrregFinancialsProvider();
const artifactStorage = new LocalAnnualReportArtifactStorage();
export const ANNUAL_REPORT_PARSER_VERSION = "annual-report-pipeline-v4-opendataloader";
const OCR_HIGH_SCALE_RECOVERY_SCALE = 4;
const OCR_HIGH_SCALE_RECOVERY_MAX_PAGES = 12;
const OCR_ROTATED_DEEP_SCAN_STRIDE = 4;
const OCR_ROTATED_DEEP_SCAN_MAX_PROBE_PAGES = 56;
const OCR_ROTATED_DEEP_SCAN_EXPAND_RADIUS = 1;
const OCR_ROTATED_DEEP_SCAN_MAX_EXACT_PAGES = 18;
const STATUTORY_SECTION_TYPES = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
]);
const STATEMENT_LIKE_SECTION_TYPES = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);

const computeSha256 = (buffer: Buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const nextCheckDate = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
const serializeJsonBuffer = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2), "utf8");

type StoredArtifactReference = {
  artifactType: string;
  storageKey: string;
  mimeType: string;
  filename: string;
};

type FinancialPipelineComputation = {
  engine: "LEGACY" | "OPENDATALOADER";
  mode: "legacy" | "local" | "hybrid";
  classifications: PageClassification[];
  rows: ReturnType<typeof reconstructStatementRows>;
  /** Per-page extraction confidence, split into recognition vs reconstruction. */
  pageConfidences: PageConfidence[];
  mapped: ReturnType<typeof mapRowsToCanonicalFacts>;
  validation: ReturnType<typeof validateCanonicalFacts>;
  issues: ValidationIssueDraft[];
  selectedFacts: ReturnType<typeof chooseCanonicalFacts>;
  duplicateSupport: number;
  noteSupport: number;
  confidenceScore: number;
  canPublishSnapshot: boolean;
  canSkipManualReview: boolean;
  sourcePrecedence: CanonicalFactCandidate["precedence"];
  normalizedPayload: ReturnType<typeof buildNormalizedFinancialPayload>;
  blockingRuleCodes: string[];
  reviewRuleCodes: string[];
  /** Scope used for validation, scoring and the published snapshot. */
  primaryScope: "COMPANY" | "CONSOLIDATED";
  durationMs: number;
};

function mapOpenDataLoaderExecutionModeToUnifiedRoute(
  executionMode: OpenDataLoaderParseResult["routing"]["executionMode"],
) {
  return executionMode === "hybrid" ? "HYBRID" : "OPENDATALOADER_LOCAL";
}

const MACHINE_LINE_ITEM_EXTRACTION_CONFIG = {
  mode: "DRY_RUN" as const,
  persistUnifiedParserDocument: false,
  persistUnifiedFinancialExtraction: false,
  persistUnifiedNarrativeExtraction: false,
  persistLegacyVsUnifiedComparison: false,
};

function mapUnifiedStatementKind(
  kind: UnifiedFinancialStatementKind,
): FinancialFactStatementType | null {
  switch (kind) {
    case "INCOME_STATEMENT":
      return FinancialFactStatementType.INCOME_STATEMENT;
    case "BALANCE_SHEET":
      return FinancialFactStatementType.BALANCE_SHEET;
    case "CASH_FLOW_STATEMENT":
      return FinancialFactStatementType.CASH_FLOW;
    default:
      return null;
  }
}

function mapUnifiedUnitScale(scale: UnifiedUnitScale) {
  switch (scale) {
    case "THOUSANDS":
      return 1_000;
    case "MILLIONS":
      return 1_000_000;
    default:
      return 1;
  }
}

function parseUnifiedLineItemValue(value: string, sign: "POSITIVE" | "NEGATIVE" | "UNKNOWN") {
  const normalized = value.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = BigInt(normalized);
  return sign === "NEGATIVE" ? -parsed : parsed;
}

function buildPublishedMachineLineItems(input: {
  financial: UnifiedFinancialStatementExtractionResult;
  statementScope: "COMPANY" | "CONSOLIDATED";
}): PublishedMachineFinancialLineItemDraft[] {
  const drafts: PublishedMachineFinancialLineItemDraft[] = [];
  for (const statement of input.financial.statements) {
    const statementType = mapUnifiedStatementKind(statement.kind);
    if (!statementType) continue;
    for (const [index, item] of statement.lineItems.entries()) {
      drafts.push({
        fiscalYear: item.year,
        statementType,
        statementScope: input.statementScope,
        originalLabel: item.originalLabel,
        originalValue: item.value,
        parsedValue: parseUnifiedLineItemValue(item.value, item.sign),
        canonicalKey: item.canonicalKey ?? undefined,
        unitScale: mapUnifiedUnitScale(item.unitScale),
        sourcePage: item.provenance.pageNumber,
        rowIndex: item.provenance.rowIndex ?? index,
        extractionRoute: item.provenance.route,
        confidence: item.confidence,
      });
    }
  }
  return drafts;
}

function buildRotatedDeepScanProbePages(pageCount: number, frontWindowEnd: number) {
  const pages: number[] = [];
  for (
    let pageNumber = frontWindowEnd + OCR_ROTATED_DEEP_SCAN_STRIDE;
    pageNumber <= pageCount && pages.length < OCR_ROTATED_DEEP_SCAN_MAX_PROBE_PAGES;
    pageNumber += OCR_ROTATED_DEEP_SCAN_STRIDE
  ) {
    pages.push(pageNumber);
  }
  return pages;
}

function selectRotatedDeepScanStatementPages(input: {
  classifications: PageClassification[];
  pageCount: number;
}) {
  const seedPages = input.classifications
    .filter(
      (classification) =>
        STATEMENT_LIKE_SECTION_TYPES.has(classification.type) &&
        classification.tableLike &&
        classification.numericRowCount >= 3,
    )
    .map((classification) => classification.pageNumber);

  const expanded = new Set<number>();
  for (const seedPage of seedPages) {
    for (
      let pageNumber = seedPage - OCR_ROTATED_DEEP_SCAN_EXPAND_RADIUS;
      pageNumber <= seedPage + OCR_ROTATED_DEEP_SCAN_EXPAND_RADIUS;
      pageNumber += 1
    ) {
      if (pageNumber >= 1 && pageNumber <= input.pageCount) {
        expanded.add(pageNumber);
      }
    }
  }

  return [...expanded]
    .sort((left, right) => left - right)
    .slice(0, OCR_ROTATED_DEEP_SCAN_MAX_EXACT_PAGES);
}

function replaceParsedPages(
  pages: AnnualReportParsedInputPage[],
  replacements: AnnualReportParsedInputPage[],
) {
  const replacementByPage = new Map(
    replacements.map((page) => [page.pageNumber, page]),
  );
  const existingPageNumbers = new Set(pages.map((page) => page.pageNumber));
  const merged = pages.map((page) => replacementByPage.get(page.pageNumber) ?? page);
  for (const replacement of replacements) {
    if (!existingPageNumbers.has(replacement.pageNumber)) {
      merged.push(replacement);
    }
  }
  return merged.sort((left, right) => left.pageNumber - right.pageNumber);
}

function scoreDeepScanPageCandidate(classification: PageClassification) {
  let score = 0;
  if (STATEMENT_LIKE_SECTION_TYPES.has(classification.type)) score += 1_000;
  if (classification.type === "STATUTORY_INCOME" || classification.type === "STATUTORY_BALANCE") score += 120;
  if (classification.type === "STATUTORY_BALANCE_CONTINUATION") score += 90;
  if (classification.tableLike) score += 80;
  if (classification.unitScale !== null) score += 60;
  score += Math.min(20, classification.yearHeaderYears.length) * 15;
  score += Math.min(40, classification.numericRowCount) * 4;
  score += Math.round(classification.confidence * 10);
  return score;
}

function selectBestDeepScanOcrPages(
  candidates: Array<{
    pages: AnnualReportParsedInputPage[];
    classifications: PageClassification[];
  }>,
) {
  const bestByPage = new Map<number, {
    page: AnnualReportParsedInputPage;
    score: number;
  }>();
  for (const candidate of candidates) {
    const classificationByPage = new Map(
      candidate.classifications.map((classification) => [
        classification.pageNumber,
        classification,
      ]),
    );
    for (const page of candidate.pages) {
      const classification = classificationByPage.get(page.pageNumber);
      if (!classification) continue;
      const score = scoreDeepScanPageCandidate(classification);
      const current = bestByPage.get(page.pageNumber);
      if (!current || score > current.score) {
        bestByPage.set(page.pageNumber, { page, score });
      }
    }
  }
  return [...bestByPage.values()]
    .map((item) => item.page)
    .sort((left, right) => left.pageNumber - right.pageNumber);
}

function buildAvailability(statements: NormalizedFinancialStatement[]): DataAvailability {
  return statements.length === 0
    ? {
        available: false,
        sourceSystem: "BRREG",
        message:
          "Fjord Insight har registrert årsrapporter, men publiserer bare regnskap automatisk når klassifisering, skala og validering passerer.",
      }
    : {
        available: true,
        sourceSystem: "BRREG",
        message:
          "Fjord Insight viser publiserte regnskapssnapshots bygget fra offisielle Brreg-kopier av årsregnskap med lagret provenance og streng publiseringsgate.",
      };
}

function mapPublishedDocuments(filings: Array<{ id: string; fiscalYear: number; sourceSystem: string; sourceUrl: string; status: AnnualReportFilingStatus; discoveredAt: Date; downloadedAt: Date | null; sourceDocumentHash: string | null }>): NormalizedFinancialDocument[] {
  return filings.map((filing) => ({
    sourceSystem: filing.sourceSystem,
    sourceEntityType: "annualReportFiling",
    sourceId: filing.id,
    fetchedAt: filing.discoveredAt,
    normalizedAt: filing.downloadedAt ?? filing.discoveredAt,
    rawPayload: { status: filing.status, sourceDocumentHash: filing.sourceDocumentHash },
    year: filing.fiscalYear,
    filingId: filing.id,
    status: filing.status,
    downloadedAt: filing.downloadedAt,
    files: [{ type: "aarsregnskap", id: `${filing.fiscalYear}`, label: "Offisiell kopi av årsregnskap", url: filing.sourceUrl }],
  }));
}

function mapPublishedStatements(statements: Array<{ fiscalYear: number; currency: string; statementScope?: "COMPANY" | "CONSOLIDATED"; revenue: bigint | null; operatingProfit: bigint | null; netIncome: bigint | null; equity: bigint | null; assets: bigint | null; sourceSystem: string; sourceEntityType: string; sourceId: string; fetchedAt: Date; normalizedAt: Date; rawPayload: unknown; sourceFilingId: string | null; sourceExtractionRunId: string | null; qualityStatus: string; qualityScore: number | null; unitScale: number | null; sourcePrecedence: string | null; publishedAt: Date | null }>) {
  return statements.map((statement) => ({
    sourceSystem: statement.sourceSystem,
    sourceEntityType: statement.sourceEntityType,
    sourceId: statement.sourceId,
    fetchedAt: statement.fetchedAt,
    normalizedAt: statement.normalizedAt,
    rawPayload: statement.rawPayload,
    fiscalYear: statement.fiscalYear,
    currency: statement.currency,
    statementScope: statement.statementScope ?? "COMPANY",
    revenue: toSafeNumber(statement.revenue),
    operatingProfit: toSafeNumber(statement.operatingProfit),
    netIncome: toSafeNumber(statement.netIncome),
    equity: toSafeNumber(statement.equity),
    assets: toSafeNumber(statement.assets),
  }));
}

function buildPublicAvailability(statements: NormalizedFinancialStatement[]): DataAvailability {
  return statements.length === 0
    ? {
        available: false,
        sourceSystem: "BRREG",
        message: "Regnskapstall hentes fra offisielle årsrapporter og oppdateres fortløpende.",
      }
    : {
        available: true,
        sourceSystem: "BRREG",
        message: "Regnskap oppdateres automatisk når nye årsrapporter behandles.",
      };
}

function getNumberAtPath(payload: Record<string, any>, path: string[]) {
  const value = path.reduce<any>((current, key) => current?.[key], payload);
  return typeof value === "number" ? value : null;
}

function buildPublishedCanonicalFacts(payload: Record<string, any>, fiscalYear: number): CanonicalFactCandidate[] {
  const metricPaths: Array<{ metricKey: CanonicalMetricKey; statementType: CanonicalFactCandidate["statementType"]; path: string[] }> = [
    { metricKey: "revenue", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "salgsinntekter"] },
    { metricKey: "other_operating_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "annenDriftsinntekt"] },
    { metricKey: "total_operating_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsinntekter", "sumDriftsinntekter"] },
    { metricKey: "total_operating_expenses", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftskostnad", "sumDriftskostnad"] },
    { metricKey: "operating_profit", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "driftsresultat", "driftsresultat"] },
    { metricKey: "financial_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "finansresultat", "finansinntekt", "sumFinansinntekter"] },
    { metricKey: "financial_expense", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "finansresultat", "finanskostnad", "sumFinanskostnad"] },
    { metricKey: "net_financial_items", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "finansresultat", "nettoFinans"] },
    { metricKey: "profit_before_tax", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "ordinaertResultatFoerSkattekostnad"] },
    { metricKey: "tax_expense", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "skattekostnadResultat"] },
    { metricKey: "net_income", statementType: "INCOME_STATEMENT", path: ["resultatregnskapResultat", "aarsresultat"] },
    { metricKey: "total_assets", statementType: "BALANCE_SHEET", path: ["eiendeler", "sumEiendeler"] },
    { metricKey: "total_equity", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "egenkapital", "sumEgenkapital"] },
    { metricKey: "total_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "gjeldOversikt", "sumGjeld"] },
    { metricKey: "long_term_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "gjeldOversikt", "langsiktigGjeld", "sumLangsiktigGjeld"] },
    { metricKey: "current_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "gjeldOversikt", "kortsiktigGjeld", "sumKortsiktigGjeld"] },
    { metricKey: "total_equity_and_liabilities", statementType: "BALANCE_SHEET", path: ["egenkapitalGjeld", "sumEgenkapitalGjeld"] },
  ];
  return metricPaths.flatMap((definition) => {
    const value = getNumberAtPath(payload, definition.path);
    return value === null ? [] : [{ fiscalYear, statementType: definition.statementType, statementScope: "COMPANY", metricKey: definition.metricKey, rawLabel: definition.metricKey, normalizedLabel: definition.metricKey, value, currency: "NOK", unitScale: 1, sourcePage: 0, sourceSection: definition.statementType === "BALANCE_SHEET" ? "STATUTORY_BALANCE" : "STATUTORY_INCOME", sourceRowText: definition.path.join("."), noteReference: null, confidenceScore: 1, precedence: "STATUTORY_NOK", isDerived: false, rawPayload: { path: definition.path } } satisfies CanonicalFactCandidate];
  });
}

async function persistJsonArtifact(input: { filingId: string; artifactType: "PREFLIGHT_JSON" | "CLASSIFICATION_JSON" | "EXTRACTION_JSON" | "NORMALIZED_JSON" | "PDF_DECISION_JSON"; filename: string; payload: unknown }) {
  const buffer = serializeJsonBuffer(input.payload);
  const checksum = computeSha256(buffer);
  const stored = await artifactStorage.putArtifact({ filingId: input.filingId, artifactType: input.artifactType, filename: input.filename, content: buffer });
  await createAnnualReportArtifact({ filingId: input.filingId, artifactType: input.artifactType, storageKey: stored.storageKey, checksum, mimeType: "application/json", metadata: { filename: input.filename } });
  return {
    artifactType: input.artifactType,
    storageKey: stored.storageKey,
    mimeType: "application/json",
    filename: input.filename,
  } satisfies StoredArtifactReference;
}

async function persistArtifactFile(input: {
  filingId: string;
  artifactType:
    | "PDF"
    | "PREFLIGHT_JSON"
    | "CLASSIFICATION_JSON"
    | "EXTRACTION_JSON"
    | "NORMALIZED_JSON"
    | "DOCUMENT_JSON"
    | "DOCUMENT_MARKDOWN"
    | "ANNOTATED_PDF"
    | "DOCUMENT_NORMALIZED_JSON"
    | "EXTRACTION_COMPARISON_JSON"
    | "STRUCTURED_DOCUMENT_JSON"
    | "PDF_DECISION_JSON";
  filename: string;
  content: Buffer | string;
  mimeType: string;
  metadata?: Record<string, unknown>;
}) {
  const buffer = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content;
  const checksum = computeSha256(buffer);
  const stored = await artifactStorage.putArtifact({
    filingId: input.filingId,
    artifactType: input.artifactType,
    filename: input.filename,
    content: buffer,
  });
  await createAnnualReportArtifact({
    filingId: input.filingId,
    artifactType: input.artifactType,
    storageKey: stored.storageKey,
    checksum,
    mimeType: input.mimeType,
    metadata: {
      filename: input.filename,
      ...input.metadata,
    },
  });

  return {
    artifactType: input.artifactType,
    storageKey: stored.storageKey,
    mimeType: input.mimeType,
    filename: input.filename,
  } satisfies StoredArtifactReference;
}

async function persistOpenDataLoaderArtifacts(
  filingId: string,
  result: OpenDataLoaderParseResult,
) {
  const storedArtifacts: StoredArtifactReference[] = [];

  storedArtifacts.push(
    await persistArtifactFile({
      filingId,
      artifactType: "DOCUMENT_JSON",
      filename: result.artifacts.rawJson.filename,
      content: result.artifacts.rawJson.content,
      mimeType: result.artifacts.rawJson.mimeType,
      metadata: {
        engine: result.engine,
        engineVersion: result.engineVersion,
        mode: result.routing.executionMode,
        reason: result.routing.reason,
      },
    }),
  );

  if (result.artifacts.markdown) {
    storedArtifacts.push(
      await persistArtifactFile({
        filingId,
        artifactType: "DOCUMENT_MARKDOWN",
        filename: result.artifacts.markdown.filename,
        content: result.artifacts.markdown.content,
        mimeType: result.artifacts.markdown.mimeType,
        metadata: {
          engine: result.engine,
          engineVersion: result.engineVersion,
          mode: result.routing.executionMode,
        },
      }),
    );
  }

  if (result.artifacts.annotatedPdf) {
    storedArtifacts.push(
      await persistArtifactFile({
        filingId,
        artifactType: "ANNOTATED_PDF",
        filename: result.artifacts.annotatedPdf.filename,
        content: result.artifacts.annotatedPdf.content,
        mimeType: result.artifacts.annotatedPdf.mimeType,
        metadata: {
          engine: result.engine,
          engineVersion: result.engineVersion,
          mode: result.routing.executionMode,
          reason: result.routing.reason,
        },
      }),
    );
  }

  storedArtifacts.push(
    await persistArtifactFile({
      filingId,
      artifactType: "DOCUMENT_NORMALIZED_JSON",
      filename: "opendataloader-normalized-document.json",
      content: serializeJsonBuffer({
        routing: result.routing,
        normalizedDocument: result.normalizedDocument,
      }),
      mimeType: "application/json",
      metadata: {
        engine: result.engine,
        engineVersion: result.engineVersion,
        mode: result.routing.executionMode,
      },
    }),
  );

  return storedArtifacts;
}

function buildPipelineSnapshot(input: {
  engine: "LEGACY" | "OPENDATALOADER";
  mode: "legacy" | "local" | "hybrid";
  computation: FinancialPipelineComputation;
}) {
  return {
    engine: input.engine,
    mode: input.mode,
    classifications: input.computation.classifications.map((classification) => ({
      pageNumber: classification.pageNumber,
      type: classification.type,
      unitScale: classification.unitScale,
    })),
    selectedFacts: Array.from(input.computation.selectedFacts.values()).map((fact) => ({
      metricKey: fact.metricKey,
      value: fact.value,
      sourcePage: fact.sourcePage,
      sourceSection: fact.sourceSection,
      precedence: fact.precedence,
    })),
    blockingRuleCodes: input.computation.blockingRuleCodes,
    shouldPublish: input.computation.canPublishSnapshot,
    reviewRuleCodes: input.computation.reviewRuleCodes,
    canPublishSnapshot: input.computation.canPublishSnapshot,
    canSkipManualReview: input.computation.canSkipManualReview,
    confidenceScore: input.computation.confidenceScore,
    durationMs: input.computation.durationMs,
  } satisfies OpenDataLoaderPipelineSnapshot;
}

function buildReviewRuleCodes(input: {
  selectedFacts: ReturnType<typeof chooseCanonicalFacts>;
  issues: ValidationIssueDraft[];
  confidenceScore: number;
  canSkipManualReview: boolean;
}) {
  const codes = new Set<string>(input.issues.map((issue) => issue.ruleCode));

  if (!input.canSkipManualReview) {
    codes.add("STRICT_TRUST_GATE_FAILED");
  }
  if (input.confidenceScore < 0.9) {
    codes.add("LOW_CONFIDENCE_SCORE");
  }
  if (!input.selectedFacts.has("revenue") && !input.selectedFacts.has("total_operating_income")) {
    codes.add("REVENUE_MISSING");
  }
  if (!input.selectedFacts.has("net_income")) {
    codes.add("NET_INCOME_MISSING");
  }
  if (!input.selectedFacts.has("total_assets")) {
    codes.add("TOTAL_ASSETS_MISSING");
  }
  if (!input.selectedFacts.has("total_equity")) {
    codes.add("TOTAL_EQUITY_MISSING");
  }
  if (input.issues.some((issue) => issue.ruleCode.includes("BALANCE") || issue.ruleCode === "BS_TOTAL_BALANCES")) {
    codes.add("BALANCE_VALIDATION_MISMATCH");
  }
  if (input.issues.some((issue) => issue.ruleCode.includes("UNIT_SCALE"))) {
    codes.add("UNIT_SCALE_UNCERTAINTY");
  }
  if (input.issues.some((issue) => issue.ruleCode.includes("CLASSIFICATION"))) {
    codes.add("CLASSIFICATION_UNCERTAINTY");
  }

  return [...codes].sort();
}

/**
 * Folds engine consensus into the chosen computation. Agreement on the
 * headline figures lifts the confidence score; a disagreement on a metric
 * that gates publication is recorded as an ERROR so the filing cannot
 * auto-publish while two engines read that number differently. The publish
 * gates and review codes are recomputed from the adjusted state.
 */
function applyEngineConsensus(
  computation: FinancialPipelineComputation,
  consensus: EngineConsensus,
  filingFiscalYear: number,
  requiredKeys: readonly string[],
): FinancialPipelineComputation {
  const disagreementIssues: ValidationIssueDraft[] = consensus.disagreedMetricKeys
    .filter((metricKey) => requiredKeys.includes(metricKey))
    .map((metricKey) => {
      const metric = consensus.metrics.find((entry) => entry.metricKey === metricKey);
      return {
        severity: "ERROR" as const,
        ruleCode: "ENGINE_DISAGREEMENT",
        message: `Legacy and OpenDataLoader extracted different values for ${metricKey}.`,
        expectedValue: metric?.legacyValue ?? null,
        actualValue: metric?.odlValue ?? null,
        context: {
          metricKey,
          legacyValue: metric?.legacyValue ?? null,
          odlValue: metric?.odlValue ?? null,
        },
      };
    });

  const delta = consensusConfidenceDelta(consensus);
  if (delta === 0 && disagreementIssues.length === 0) {
    return computation;
  }

  const issues = [...computation.issues, ...disagreementIssues];
  const confidenceScore = Number(
    Math.max(0, Math.min(0.995, computation.confidenceScore + delta)).toFixed(4),
  );
  const canPublishSnapshot = canPublishProvisionally({
    filingFiscalYear,
    classifications: computation.classifications,
    selectedFacts: computation.selectedFacts,
    validationIssues: issues,
    confidenceScore,
  });
  const canSkipManualReview = canPublishAutomatically({
    filingFiscalYear,
    classifications: computation.classifications,
    selectedFacts: computation.selectedFacts,
    validationIssues: issues,
    confidenceScore,
    requiredKeys: [...requiredKeys],
  });
  const reviewRuleCodes = buildReviewRuleCodes({
    selectedFacts: computation.selectedFacts,
    issues,
    confidenceScore,
    canSkipManualReview,
  });
  const blockingRuleCodes = Array.from(
    new Set(
      issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.ruleCode),
    ),
  );

  return {
    ...computation,
    issues,
    confidenceScore,
    canPublishSnapshot,
    canSkipManualReview,
    reviewRuleCodes,
    blockingRuleCodes,
  };
}

function getUnitScaleResolutionMode(): UnitScaleResolutionMode {
  return env.mlInferenceUnitScaleMode === "off" || env.mlInferenceUnitScaleMode === "shadow"
    ? env.mlInferenceUnitScaleMode
    : "apply";
}

async function runFinancialPipeline(input: {
  filingId: string;
  extractionRunId: string;
  fiscalYear: number;
  parsedPages: Parameters<typeof classifyPages>[0];
  engine: "LEGACY" | "OPENDATALOADER";
  mode: "legacy" | "local" | "hybrid";
  excludePageNumbers?: Set<number>;
  definitions: MetricDefinition[];
  requiredKeys: string[];
  nodeRules: NodeEvalConfig[];
}) {
  const startedAt = Date.now();
  const allClassifications = classifyPages(input.parsedPages);
  const baseClassifications =
    input.excludePageNumbers && input.excludePageNumbers.size > 0
      ? allClassifications.filter((c) => !input.excludePageNumbers!.has(c.pageNumber))
      : allClassifications;
  const { classifications, summary: unitScaleResolution } =
    await resolveUnitScaleClassifications({
      pages: input.parsedPages,
      classifications: baseClassifications,
      mode: getUnitScaleResolutionMode(),
    });
  if (
    unitScaleResolution.attemptedPages > 0 &&
    (unitScaleResolution.appliedPages > 0 || unitScaleResolution.conflictPages > 0)
  ) {
    logPipelineEvent("ml_unit_scale.resolved", {
      filingId: input.filingId,
      extractionRunId: input.extractionRunId,
      engine: input.engine,
      mode: input.mode,
      serviceAvailable: unitScaleResolution.serviceAvailable,
      attemptedPages: unitScaleResolution.attemptedPages,
      appliedPages: unitScaleResolution.appliedPages,
      conflictPages: unitScaleResolution.conflictPages,
    });
  }
  // Geometry-first is now the PRIMARY reconstruction on statement pages where it
  // produces rows (scanned/OCR); the legacy partition reconstruction is the
  // fallback for digital/embedded-text pages where geometry-first has no word
  // coordinates. This brings the eval-validated path into production instead of
  // leaving geometry-first as a conditional recovery branch.
  const legacyRows = reconstructStatementRows(input.parsedPages, classifications);
  const rows = buildStatementRowsPreferGeometryFirst({
    parsedPages: input.parsedPages,
    classifications,
    legacyRows,
  });
  return assembleComputation({
    fiscalYear: input.fiscalYear,
    parsedPages: input.parsedPages,
    classifications,
    rows,
    engine: input.engine,
    mode: input.mode,
    startedAt,
    definitions: input.definitions,
    requiredKeys: input.requiredKeys,
    nodeRules: input.nodeRules,
  });
}

/**
 * Runs the presentation-node MATCH rules against the selected facts and turns
 * out-of-tolerance deviations into validation issues. Emitted as ERROR so the
 * filing cannot auto-publish and is surfaced in manual review (a MATCH rule is
 * an explicit reviewer assertion that two derivations of a figure must agree).
 */
function buildNodeMatchIssues(
  nodeRules: NodeEvalConfig[],
  selectedFacts: ReturnType<typeof chooseCanonicalFacts>,
): ValidationIssueDraft[] {
  if (nodeRules.length === 0) {
    return [];
  }

  const facts = new Map<string, number>();
  for (const [metricKey, fact] of selectedFacts) {
    facts.set(metricKey, fact.value);
  }

  const deviations = evaluateNodeMatches({ nodes: nodeRules, facts });
  return deviations.map((deviation) => ({
    severity: "ERROR" as const,
    ruleCode: "NODE_MATCH_DEVIATION",
    message: `Node «${deviation.nodeLabel}» avviker ${(deviation.relativeDeviation * 100).toFixed(1)}% fra match-nøkkelen ${deviation.matchMetricKey}.`,
    expectedValue: deviation.matchValue,
    actualValue: deviation.computedValue,
    context: {
      nodeId: deviation.nodeId,
      nodeLabel: deviation.nodeLabel,
      matchMetricKey: deviation.matchMetricKey,
      computedValue: deviation.computedValue,
      matchValue: deviation.matchValue,
      absoluteDeviation: deviation.absoluteDeviation,
      relativeDeviation: deviation.relativeDeviation,
      tolerance: deviation.tolerance,
    },
  }));
}

/**
 * Assembles the FinancialPipelineComputation from a row set. Split out of
 * runFinancialPipeline so the self-correcting loop can swap rows for one
 * page and re-run scoring without redoing classification or parsing.
 */
function assembleComputation(input: {
  fiscalYear: number;
  parsedPages: Parameters<typeof classifyPages>[0];
  classifications: PageClassification[];
  rows: ReturnType<typeof reconstructStatementRows>;
  engine: "LEGACY" | "OPENDATALOADER";
  mode: "legacy" | "local" | "hybrid";
  startedAt: number;
  definitions: MetricDefinition[];
  requiredKeys: string[];
  nodeRules: NodeEvalConfig[];
}): FinancialPipelineComputation {
  const pageConfidences = computePageConfidences({
    parsedPages: input.parsedPages,
    classifications: input.classifications,
    rows: input.rows,
  });
  const mapped = mapRowsToCanonicalFacts({
    filingFiscalYear: input.fiscalYear,
    classifications: input.classifications,
    rows: input.rows,
    definitions: input.definitions,
    requiredKeys: input.requiredKeys,
    // Also extract the comparative (prior-year) column — geometry-first already
    // reads it. These facts flow into storage and the review artifact so the
    // reviewer gets prior-year suggestions instead of hand-keying every value.
    // The auto-publish gate below deliberately operates on the FILING year only
    // (currentYearFacts), so adding the prior year does not change validation,
    // confidence, scope selection or the published snapshot.
    emitComparativeYears: true,
  });
  const rankedMapped = {
    ...mapped,
    facts: rankCanonicalAccuracyFacts(mapped.facts),
  };
  // The validation / confidence / snapshot all reason about a single statement
  // year — the filing's year. Restrict the gate to current-year facts so the
  // prior-year column (suggestions only) can never pick a wrong-year value
  // through chooseCanonicalFacts' per-key dedup.
  const currentYearFacts = rankedMapped.facts.filter((fact) => fact.fiscalYear === input.fiscalYear);
  // Pick the primary scope to validate, score and publish. Consolidated
  // (konsernregnskap) is the headline for a group; a standalone company has
  // only COMPANY facts so it falls through to COMPANY. Facts of BOTH scopes
  // are still persisted — only the published snapshot uses the primary scope.
  const primaryScope: "COMPANY" | "CONSOLIDATED" = currentYearFacts.some(
    (fact) => fact.statementScope === "CONSOLIDATED",
  )
    ? "CONSOLIDATED"
    : "COMPANY";
  const validation = validateCanonicalFacts(currentYearFacts, primaryScope);
  const classificationIssues = buildClassificationIssues(input.fiscalYear, input.classifications);
  const selectedFacts = validation.selectedFacts;
  // Presentation-node MATCH rules: the fold of a node's operand keys must agree
  // with the key the reviewer flagged as MATCH (within ±1%). A confident
  // deviation is an ERROR so the filing is routed to manual review.
  const nodeMatchIssues = buildNodeMatchIssues(input.nodeRules, selectedFacts);
  const issues = [
    ...classificationIssues,
    ...mapped.issues,
    ...validation.issues,
    ...nodeMatchIssues,
  ];
  const duplicateSupport =
    validation.stats.duplicateComparisons > 0
      ? validation.stats.duplicateMatches / validation.stats.duplicateComparisons
      : 0;
  const noteSupport =
    validation.stats.noteComparisons > 0
      ? validation.stats.noteMatches / validation.stats.noteComparisons
      : 0;
  const confidenceScore = calculateConfidenceScore({
    classifications: input.classifications,
    selectedFactCount: selectedFacts.size,
    validationScore: validation.validationScore,
    duplicateSupport,
    noteSupport,
    issueCount: issues.length,
    requiredKeys: input.requiredKeys,
  });
  const canPublishSnapshot = canPublishProvisionally({
    filingFiscalYear: input.fiscalYear,
    classifications: input.classifications,
    selectedFacts,
    validationIssues: issues,
    confidenceScore,
  });
  const canSkipManualReview = canPublishAutomatically({
    filingFiscalYear: input.fiscalYear,
    classifications: input.classifications,
    selectedFacts,
    validationIssues: issues,
    confidenceScore,
    requiredKeys: input.requiredKeys,
  });
  const sourcePrecedence =
    selectedFacts.get("revenue")?.precedence ??
    selectedFacts.get("total_assets")?.precedence ??
    "NOTE_DERIVED";
  const normalizedPayload = buildNormalizedFinancialPayload(input.fiscalYear, selectedFacts);
  const blockingRuleCodes = Array.from(
    new Set(issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.ruleCode)),
  );
  const reviewRuleCodes = buildReviewRuleCodes({
    selectedFacts,
    issues,
    confidenceScore,
    canSkipManualReview,
  });

  return {
    engine: input.engine,
    mode: input.mode,
    classifications: input.classifications,
    rows: input.rows,
    pageConfidences,
    mapped: rankedMapped,
    validation,
    issues,
    selectedFacts,
    duplicateSupport,
    noteSupport,
    confidenceScore,
    canPublishSnapshot,
    canSkipManualReview,
    sourcePrecedence,
    normalizedPayload,
    blockingRuleCodes,
    reviewRuleCodes,
    primaryScope,
    durationMs: Date.now() - input.startedAt,
  } satisfies FinancialPipelineComputation;
}

function recomputeComputationWithFacts(input: {
  computation: FinancialPipelineComputation;
  fiscalYear: number;
  facts: CanonicalFactCandidate[];
  requiredKeys: string[];
  nodeRules: NodeEvalConfig[];
}): FinancialPipelineComputation {
  const mapped = {
    ...input.computation.mapped,
    facts: rankCanonicalAccuracyFacts(input.facts),
  };
  const currentYearFacts = mapped.facts.filter((fact) => fact.fiscalYear === input.fiscalYear);
  const primaryScope: "COMPANY" | "CONSOLIDATED" = currentYearFacts.some(
    (fact) => fact.statementScope === "CONSOLIDATED",
  )
    ? "CONSOLIDATED"
    : "COMPANY";
  const validation = validateCanonicalFacts(currentYearFacts, primaryScope);
  const classificationIssues = buildClassificationIssues(
    input.fiscalYear,
    input.computation.classifications,
  );
  const selectedFacts = validation.selectedFacts;
  const nodeMatchIssues = buildNodeMatchIssues(input.nodeRules, selectedFacts);
  const issues = [
    ...classificationIssues,
    ...mapped.issues,
    ...validation.issues,
    ...nodeMatchIssues,
  ];
  const duplicateSupport =
    validation.stats.duplicateComparisons > 0
      ? validation.stats.duplicateMatches / validation.stats.duplicateComparisons
      : 0;
  const noteSupport =
    validation.stats.noteComparisons > 0
      ? validation.stats.noteMatches / validation.stats.noteComparisons
      : 0;
  const confidenceScore = calculateConfidenceScore({
    classifications: input.computation.classifications,
    selectedFactCount: selectedFacts.size,
    validationScore: validation.validationScore,
    duplicateSupport,
    noteSupport,
    issueCount: issues.length,
    requiredKeys: input.requiredKeys,
  });
  const canPublishSnapshot = canPublishProvisionally({
    filingFiscalYear: input.fiscalYear,
    classifications: input.computation.classifications,
    selectedFacts,
    validationIssues: issues,
    confidenceScore,
  });
  const canSkipManualReview = canPublishAutomatically({
    filingFiscalYear: input.fiscalYear,
    classifications: input.computation.classifications,
    selectedFacts,
    validationIssues: issues,
    confidenceScore,
    requiredKeys: input.requiredKeys,
  });
  const sourcePrecedence =
    selectedFacts.get("revenue")?.precedence ??
    selectedFacts.get("total_assets")?.precedence ??
    "NOTE_DERIVED";
  const normalizedPayload = buildNormalizedFinancialPayload(input.fiscalYear, selectedFacts);
  const blockingRuleCodes = Array.from(
    new Set(issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.ruleCode)),
  );
  const reviewRuleCodes = buildReviewRuleCodes({
    selectedFacts,
    issues,
    confidenceScore,
    canSkipManualReview,
  });

  return {
    ...input.computation,
    mapped,
    validation,
    issues,
    selectedFacts,
    duplicateSupport,
    noteSupport,
    confidenceScore,
    canPublishSnapshot,
    canSkipManualReview,
    sourcePrecedence,
    normalizedPayload,
    blockingRuleCodes,
    reviewRuleCodes,
    primaryScope,
  } satisfies FinancialPipelineComputation;
}

/**
 * Publishes one FinancialStatement snapshot for a given statement scope.
 * Used to publish the primary scope (full quality) and, separately, the
 * secondary scope so app users can toggle between konsern and selskap.
 */
async function publishScopedSnapshot(input: {
  companyId: string;
  orgNumber: string;
  fiscalYear: number;
  filingId: string;
  extractionRunId: string;
  scope: "COMPANY" | "CONSOLIDATED";
  selectedFacts: Map<string, CanonicalFactCandidate>;
  normalizedPayload: ReturnType<typeof buildNormalizedFinancialPayload>;
  qualityStatus: "HIGH_CONFIDENCE" | "LOW_CONFIDENCE" | "MANUAL_REVIEW";
  qualityScore: number;
  publishedAt: Date;
}) {
  const facts = input.selectedFacts;
  const currency =
    facts.get("revenue")?.currency ?? facts.get("total_assets")?.currency ?? "NOK";
  await publishFinancialStatementSnapshot({
    companyId: input.companyId,
    fiscalYear: input.fiscalYear,
    statementScope: input.scope,
    currency,
    revenue: facts.get("revenue")?.value ?? facts.get("total_operating_income")?.value ?? null,
    operatingProfit: facts.get("operating_profit")?.value ?? null,
    netIncome: facts.get("net_income")?.value ?? null,
    equity: facts.get("total_equity")?.value ?? null,
    assets: facts.get("total_assets")?.value ?? null,
    sourceSystem: "BRREG",
    sourceEntityType: "financialStatement",
    sourceId: `${input.orgNumber}-${input.fiscalYear}-${input.filingId}-${input.scope}`,
    fetchedAt: input.publishedAt,
    normalizedAt: input.publishedAt,
    rawPayload: input.normalizedPayload as unknown as Prisma.InputJsonValue,
    sourceFilingId: input.filingId,
    sourceExtractionRunId: input.extractionRunId,
    qualityStatus: input.qualityStatus,
    qualityScore: input.qualityScore,
    unitScale: facts.get("revenue")?.unitScale ?? facts.get("total_assets")?.unitScale ?? 1,
    sourcePrecedence: facts.get("revenue")?.precedence ?? facts.get("total_assets")?.precedence ?? "NOTE_DERIVED",
    publishedAt: input.publishedAt,
  });
}

function logPipelineEvent(event: string, payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({
      scope: "annual-report-financials",
      event,
      at: new Date().toISOString(),
      ...payload,
    }),
  );
}

function buildReviewPayload(input: {
  filingId: string;
  extractionRunId?: string | null;
  classifications: PageClassification[];
  issues: ValidationIssueDraft[];
  selectedFacts?: Map<string, CanonicalFactCandidate>;
  artifactReferences?: StoredArtifactReference[];
  engineSummary?: Record<string, unknown>;
  comparisonSummary?: OpenDataLoaderComparisonSummary | null;
  documentDiagnostics?: AnnualReportDocumentDiagnostics | null;
  structuredDocument?: AnnualReportDocument | null;
  pdfDecision?: PdfDecisionResult | null;
  consensus?: EngineConsensus | null;
}) {
  const pageReferences = Array.from(
    new Set([
      ...input.classifications.map((classification) => classification.pageNumber),
      ...input.issues.flatMap((issue) => {
        const pageNumber = issue.context?.pageNumber;
        return typeof pageNumber === "number" ? [pageNumber] : [];
      }),
      ...(input.selectedFacts
        ? Array.from(input.selectedFacts.values()).flatMap((fact) =>
            typeof fact.sourcePage === "number" ? [fact.sourcePage] : [],
          )
        : []),
    ]),
  ).sort((left, right) => left - right);

  const factSummary = input.selectedFacts
    ? Array.from(input.selectedFacts.values()).map((fact) => ({
        metricKey: fact.metricKey,
        value: fact.value,
        rawLabel: fact.rawLabel,
        sourcePage: fact.sourcePage,
        sourceSection: fact.sourceSection,
        sourcePrecedence: fact.precedence,
        statementScope: fact.statementScope,
      }))
    : [];

  // The reviewed facts all belong to one scope (the primary scope chosen
  // for this run). Surface it so the review workspace can label which set
  // of accounts the reviewer is looking at.
  const reviewStatementScope =
    factSummary.find((fact) => fact.statementScope)?.statementScope ?? "COMPANY";

  // For each blocking accounting-identity failure, attribute a likely cause
  // from engine consensus — an extraction error vs a genuine inconsistency
  // in the filed statement itself.
  const constraintCauses = input.consensus
    ? input.issues
        .filter((issue) => issue.severity === "ERROR")
        .map((issue) => ({
          ruleCode: issue.ruleCode,
          likelyCause: classifyConstraintCause(issue.ruleCode, input.consensus!),
        }))
        .filter(
          (entry): entry is { ruleCode: string; likelyCause: ConstraintCause } =>
            entry.likelyCause !== null,
        )
    : [];

  return {
    pageReferences,
    reviewPayload: {
      filingId: input.filingId,
      extractionRunId: input.extractionRunId ?? null,
      statementScope: reviewStatementScope,
      blockingIssues: input.issues.map((issue) => ({
        severity: issue.severity,
        ruleCode: issue.ruleCode,
        message: issue.message,
        expectedValue: issue.expectedValue ?? null,
        actualValue: issue.actualValue ?? null,
        context: issue.context ?? null,
      })),
      selectedFacts: factSummary,
      classifications: input.classifications.map((classification) => ({
        pageNumber: classification.pageNumber,
        type: classification.type,
        confidence: classification.confidence,
        unitScale: classification.unitScale,
        unitScaleConfidence: classification.unitScaleConfidence,
        reasons: classification.reasons,
      })),
      artifactReferences: input.artifactReferences ?? [],
      engineSummary: input.engineSummary ?? null,
      comparisonSummary: input.comparisonSummary ?? null,
      consensus: input.consensus ?? null,
      constraintCauses,
      documentDiagnostics: input.documentDiagnostics ?? null,
      pdfDecision: input.pdfDecision ?? null,
      ...buildDocumentPayloadFields(input.structuredDocument ?? null),
    },
  };
}

function buildValidationSummary(
  computation: FinancialPipelineComputation,
): PdfDecisionValidationSummary {
  return {
    hasBlockingErrors: computation.blockingRuleCodes.length > 0,
    blockingRuleCodes: computation.blockingRuleCodes,
    warningRuleCodes: Array.from(
      new Set(
        computation.issues
          .filter((issue) => issue.severity === "WARNING")
          .map((issue) => issue.ruleCode),
      ),
    ),
    validationScore: computation.validation.validationScore,
  };
}

function buildDocumentPayloadFields(doc: AnnualReportDocument | null) {
  if (!doc) {
    return {
      documentSections: null,
      narratives: null,
      boardReportProposal: null,
      auditorReportProposal: null,
    };
  }

  const boardNarrative = doc.narratives.find((n) => n.kind === "BOARD_REPORT") ?? null;
  const auditorNarrative = doc.narratives.find((n) => n.kind === "AUDITOR_REPORT") ?? null;

  const toProposal = (n: typeof boardNarrative) =>
    n
      ? {
          startPage: n.startPage,
          endPage: n.endPage,
          confidenceScore: n.confidenceScore,
          matchedSignals: n.matchedSignals,
          subsections: serializeNarrativeSubsections(n.subsections),
          fullText: n.fullText,
          normalizedText: n.normalizedText ?? normalizeNorwegianText(n.fullText),
        }
      : null;

  return {
    documentSections: doc.sections.map((s) => ({
      kind: s.kind,
      startPage: s.startPage,
      endPage: s.endPage,
      confidenceScore: s.confidenceScore,
      matchedSignals: s.matchedSignals,
      stopReason: s.stopReason ?? null,
      pageCount: s.pages.length,
      sourcePages: s.pages.map((page) => page.pageNumber),
    })),
    narratives: doc.narratives.map((n) => ({
      kind: n.kind,
      startPage: n.startPage,
      endPage: n.endPage,
      confidenceScore: n.confidenceScore,
      matchedSignals: n.matchedSignals,
      fullText: n.fullText,
      normalizedText: n.normalizedText ?? normalizeNorwegianText(n.fullText),
      subsections: serializeNarrativeSubsections(n.subsections),
      subsectionCount: n.subsections.length,
      fullTextLength: n.fullText.length,
    })),
    boardReportProposal: toProposal(boardNarrative),
    auditorReportProposal: toProposal(auditorNarrative),
  };
}

function serializeNarrativeSubsections(
  subsections: AnnualReportDocument["narratives"][number]["subsections"],
) {
  return subsections.map((subsection) => ({
    heading: subsection.heading,
    text: subsection.text,
    normalizedText: subsection.normalizedText ?? normalizeNorwegianText(subsection.text),
    startOffset: subsection.startOffset ?? null,
    endOffset: subsection.endOffset ?? null,
  }));
}

function buildStructuredDocumentArtifactPayload(input: {
  doc: AnnualReportDocument;
  filingId: string;
  fiscalYear: number;
  createdAt: string;
}): StructuredDocumentArtifactPayload {
  const provenance = {
    source: "preflight",
    persistedStage: "before-extraction-run-created",
    reasonExtractionRunIdIsNull:
      "structured document is produced during preflight before extraction run creation",
    filingId: input.filingId,
    fiscalYear: input.fiscalYear,
    documentModelVersion: "annual-report-document-model-v1",
    parserVersion: ANNUAL_REPORT_PARSER_VERSION,
  };

  return {
    version: "annual-report-document-model-v1",
    filingId: input.filingId,
    extractionRunId: null,
    createdAt: input.createdAt,
    provenance,
    structuredDocument: {
      pages: input.doc.pages,
      sections: input.doc.sections.map((section) => ({
        kind: section.kind,
        startPage: section.startPage,
        endPage: section.endPage,
        confidenceScore: section.confidenceScore,
        matchedSignals: section.matchedSignals,
        stopReason: section.stopReason ?? null,
        pageCount: section.pages.length,
        sourcePages: section.pages.map((page) => page.pageNumber),
      })),
      narratives: input.doc.narratives.map((narrative) => ({
        kind: narrative.kind,
        startPage: narrative.startPage,
        endPage: narrative.endPage,
        confidenceScore: narrative.confidenceScore,
        matchedSignals: narrative.matchedSignals,
        fullText: narrative.fullText,
        normalizedText:
          narrative.normalizedText ?? normalizeNorwegianText(narrative.fullText),
        subsections: serializeNarrativeSubsections(narrative.subsections),
        subsectionCount: narrative.subsections.length,
        fullTextLength: narrative.fullText.length,
      })),
      diagnostics: input.doc.diagnostics,
    },
  };
}

function summarizeBlockingReasons(reviewPayload: Record<string, any> | null | undefined) {
  const blockingIssues = Array.isArray(reviewPayload?.blockingIssues)
    ? reviewPayload.blockingIssues
    : [];
  return blockingIssues.map((issue) => ({
    severity: issue?.severity ?? null,
    ruleCode: issue?.ruleCode ?? null,
    message: issue?.message ?? null,
    pageNumber:
      typeof issue?.context?.pageNumber === "number" ? issue.context.pageNumber : null,
  }));
}

async function ensurePdfArtifact(filingId: string) {
  const filing = await getAnnualReportFilingWithArtifacts(filingId);
  if (!filing) throw new Error(`Fant ikke filing ${filingId}.`);
  const existingPdfArtifact = filing.artifacts.find((artifact) => artifact.artifactType === "PDF");
  if (existingPdfArtifact && filing.sourceDocumentHash) {
    return { filing, pdfBuffer: await artifactStorage.getArtifactBuffer(existingPdfArtifact.storageKey) };
  }

  const download = await provider.downloadAnnualReportPdf(filing.sourceUrl);
  const checksum = computeSha256(download.buffer);
  const versionedFiling = await registerAnnualReportHashVersion({ filingId, checksum, downloadedAt: new Date() });
  const stored = await artifactStorage.putArtifact({ filingId: versionedFiling.id, artifactType: "PDF", filename: `${filing.company.orgNumber}-${filing.fiscalYear}-${checksum.slice(0, 12)}.pdf`, content: download.buffer });
  await createAnnualReportArtifact({ filingId: versionedFiling.id, artifactType: "PDF", storageKey: stored.storageKey, checksum, mimeType: download.mimeType, metadata: { sourceUrl: filing.sourceUrl } });
  const refreshed = await getAnnualReportFilingWithArtifacts(versionedFiling.id);
  if (!refreshed) throw new Error(`Fant ikke oppdatert filing ${versionedFiling.id}.`);
  return { filing: refreshed, pdfBuffer: download.buffer };
}

async function verifyLatestKnownFilingHashes(companyId: string) {
  const latestFilings = await listLatestAnnualReportFilingsForCompany(companyId);
  const candidates = latestFilings.filter((filing) => filing.sourceDocumentHash).sort((left, right) => right.fiscalYear - left.fiscalYear).slice(0, 2);
  const createdVersions = [];
  for (const filing of candidates) {
    try {
      const download = await provider.downloadAnnualReportPdf(filing.sourceUrl);
      const checksum = computeSha256(download.buffer);
      if (checksum === filing.sourceDocumentHash) continue;
      const versioned = await createAnnualReportFilingVersion({ existingFilingId: filing.id, checksum, downloadedAt: new Date() });
      const stored = await artifactStorage.putArtifact({ filingId: versioned.id, artifactType: "PDF", filename: `${filing.companyId}-${filing.fiscalYear}-${checksum.slice(0, 12)}.pdf`, content: download.buffer });
      await createAnnualReportArtifact({ filingId: versioned.id, artifactType: "PDF", storageKey: stored.storageKey, checksum, mimeType: download.mimeType, metadata: { sourceUrl: filing.sourceUrl, detectedBy: "sync-new-filings" } });
      createdVersions.push({ fiscalYear: filing.fiscalYear, previousHash: filing.sourceDocumentHash, newHash: checksum, filingId: versioned.id });
    } catch (error) {
      logRecoverableError("annual-report-financials.verifyLatestKnownFilingHashes", error, { companyId, filingId: filing.id, fiscalYear: filing.fiscalYear });
    }
  }
  return createdVersions;
}

export async function processAnnualReportFiling(
  filingId: string,
  options?: { force?: boolean },
) {
  const claimed = await claimAnnualReportFilingForProcessing(
    filingId,
    options?.force
      ? [
          "DISCOVERED",
          "DOWNLOADED",
          "PREFLIGHTED",
          "EXTRACTED",
          "VALIDATED",
          "FAILED",
          "MANUAL_REVIEW",
          "PUBLISHED",
        ]
      : undefined,
  );
  if (!claimed) {
    const current = await getAnnualReportFilingWithArtifacts(filingId);
    return {
      filingId,
      fiscalYear: current?.fiscalYear ?? null,
      skipped: true,
      reason: current ? `Filing is already in status ${current.status}` : "Filing not found",
      published: current?.status === "PUBLISHED",
    };
  }

  logPipelineEvent("filing.claimed", { filingId, fiscalYear: claimed.fiscalYear, status: claimed.status });
  let ensured: Awaited<ReturnType<typeof ensurePdfArtifact>>;
  try {
    ensured = await ensurePdfArtifact(filingId);
  } catch (error) {
    // Nedlastingsfeil (typisk 429/5xx fra Brreg) skjer før extraction-run finnes og har
    // ingen terminal-håndtering — uten denne blir filingen stående fast i PROCESSING.
    const message = error instanceof Error ? error.message : "Unknown download error";
    await updateAnnualReportFiling(filingId, { status: "DISCOVERED", lastError: message });
    logPipelineEvent("filing.download_failed", { filingId, fiscalYear: claimed.fiscalYear, error: message });
    throw error;
  }
  const { filing, pdfBuffer } = ensured;
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  const artifactReferences: StoredArtifactReference[] = [];
  artifactReferences.push(
    await persistJsonArtifact({
      filingId: filing.id,
      artifactType: "PREFLIGHT_JSON",
      filename: "preflight.json",
      payload: preflight,
    }),
  );

  if (preflight.structuredDocument) {
    artifactReferences.push(
      await persistArtifactFile({
        filingId: filing.id,
        artifactType: "STRUCTURED_DOCUMENT_JSON",
        filename: "structured-document.json",
        content: serializeJsonBuffer(
          buildStructuredDocumentArtifactPayload({
            doc: preflight.structuredDocument,
            filingId: filing.id,
            fiscalYear: filing.fiscalYear,
            createdAt: new Date().toISOString(),
          }),
        ),
        mimeType: "application/json",
        metadata: {
          documentModelVersion: "annual-report-document-model-v1",
          source: "preflight",
          persistedStage: "before-extraction-run-created",
          reasonExtractionRunIdIsNull:
            "structured document is produced during preflight before extraction run creation",
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          parserVersion: ANNUAL_REPORT_PARSER_VERSION,
        },
      }),
    );
    logPipelineEvent("filing.structured_document_persisted", {
      filingId: filing.id,
      fiscalYear: filing.fiscalYear,
      sectionCount: preflight.structuredDocument.sections.length,
      qualityRisk: preflight.structuredDocument.diagnostics.qualityRisk,
      recommendedRouteHint: preflight.structuredDocument.diagnostics.recommendedRouteHint,
    });
  }

  const pageHints = preflight.structuredDocument
    ? getFinancialExtractionPageHints(preflight.structuredDocument)
    : null;

  if (pageHints?.hasReliableHints) {
    logPipelineEvent("filing.page_hints_computed", {
      filingId: filing.id,
      fiscalYear: filing.fiscalYear,
      includePageCount: pageHints.includePages.length,
      excludePageCount: pageHints.excludePages.size,
      reasons: pageHints.reasons,
    });
  }

  // Run the PDF Decision Engine and persist as PDF_DECISION_JSON artifact.
  const odlConfigForDecision = resolveOpenDataLoaderConfig();
  const activePdfDecisionRuleConfig = getActivePdfDecisionRuleConfig();
  const pdfDecision = runPdfDecisionEngine(
    {
      preflight,
      structuredDocument: preflight.structuredDocument ?? null,
      pageHints: pageHints ?? null,
      odlConfig: { enabled: odlConfigForDecision.enabled, mode: odlConfigForDecision.mode },
    },
    { ruleConfig: activePdfDecisionRuleConfig },
  );
  try {
    artifactReferences.push(
      await persistJsonArtifact({
        filingId: filing.id,
        artifactType: "PDF_DECISION_JSON",
        filename: "pdf-decision-pre-extraction.json",
        payload: buildPdfDecisionArtifactPayload({
          decision: pdfDecision,
          orgNumber: filing.company.orgNumber,
          fiscalYear: filing.fiscalYear,
          filingId: filing.id,
          extractionRunId: null,
          phase: "pre_extraction",
          hasPreflight: true,
          hasStructuredDocument: Boolean(preflight.structuredDocument),
          hasPageHints: Boolean(pageHints),
          hasValidationSummary: false,
          openDataLoaderEnabled: odlConfigForDecision.enabled,
        }),
      }),
    );
  } catch (decisionArtifactError) {
    logRecoverableError(
      "annual-report-financials.pdfDecisionArtifact",
      decisionArtifactError,
      { filingId: filing.id, fiscalYear: filing.fiscalYear },
    );
  }
  logPipelineEvent("filing.pdf_decision_computed", {
    filingId: filing.id,
    fiscalYear: filing.fiscalYear,
    route: pdfDecision.route,
    riskLevel: pdfDecision.riskLevel,
    confidenceScore: pdfDecision.confidenceScore,
    financialFactsEnabled: pdfDecision.enabledExtractors.financialFacts,
    manualReviewReasonCount: pdfDecision.manualReviewReasons.length,
  });

  await updateAnnualReportFiling(filing.id, { preflightedAt: new Date(), unitHints: { hasTextLayer: preflight.hasTextLayer, hasReliableTextLayer: preflight.hasReliableTextLayer }, parserVersionLastTried: ANNUAL_REPORT_PARSER_VERSION, lastError: null });
  logPipelineEvent("filing.preflighted", { filingId: filing.id, fiscalYear: filing.fiscalYear, hasReliableTextLayer: preflight.hasReliableTextLayer });

  // Per-page legacy mixing. Doc-level reliability still drives the broad
  // decision — full OCR for clearly scanned filings, none for clearly
  // digital ones — but a mixed document (mostly prose with a few scanned
  // statement pages) now OCRs only the pages that need it instead of either
  // dropping them silently behind the text-layer path or OCR-ing the whole
  // document unnecessarily.
  const unreliablePageNumbers = preflight.parsedPages
    .filter((page) => !isPageReliable(page))
    .map((page) => page.pageNumber);
  const isMixedMode =
    preflight.hasReliableTextLayer && unreliablePageNumbers.length > 0;
  // The statutory statements live near the FRONT of the filing; the bulk of the
  // notes and Del-2 prose that follow are noise for primary extraction. OCR is
  // by far the most expensive step, so on a scanned document we OCR only a front
  // window and let the rest fall out as non-statutory.
  //
  // The window must be wide enough for the harder layout: groups whose
  // konsernregnskap is NOT in the standardised Brønnøysund Del-1 but is presented
  // as its own section after the board report (REITAN: parent statements at p8-9,
  // a "Konsernregnskap" divider at p22, konsern statements at p23-27). A tight
  // 18-page window captured only the parent and silently dropped the entire
  // group statement set. 32 covers the cover + parent + board report + a
  // following konsern section, which is where these statements sit in practice.
  const DEL1_PAGE_WINDOW = 32;
  const del1PageNumbers = preflight.parsedPages
    .map((page) => page.pageNumber)
    .filter((pageNumber) => pageNumber <= DEL1_PAGE_WINDOW);
  let legacyOcrResult: Awaited<ReturnType<typeof extractOcrPagesWithDiagnostics>> | null = null;
  if (!preflight.hasReliableTextLayer) {
    // Batched OCR: the Del-1 window can span 30+ pages on large scanned konsern
    // filings (parent statements up front, a separate konsernregnskap section
    // after the board report). OCR'ing that many dense pages in a single call
    // OOM-kills the process, so split the window across several calls.
    legacyOcrResult =
      del1PageNumbers.length > 0
        ? await extractOcrPagesBatched(pdfBuffer, del1PageNumbers)
        : await extractOcrPagesWithDiagnostics(pdfBuffer);
  } else if (isMixedMode) {
    legacyOcrResult = await extractOcrPagesBatched(
      pdfBuffer,
      unreliablePageNumbers.filter((pageNumber) => pageNumber <= DEL1_PAGE_WINDOW),
    );
  }
  const ocrPagesByNumber = new Map(
    (legacyOcrResult?.pages ?? []).map((page) => [page.pageNumber, page]),
  );
  const legacyPages: AnnualReportParsedInputPage[] =
    preflight.parsedPages.length > 0
      ? preflight.parsedPages.map(
          (page) => ocrPagesByNumber.get(page.pageNumber) ?? page,
        )
      : legacyOcrResult?.pages ?? [];
  const legacyOcrEngine = !legacyOcrResult
    ? "EMBEDDED_TEXT"
    : isMixedMode
      ? "MIXED_TEXT_TESSERACT"
      : "TESSERACT";
  if (legacyOcrResult) {
    logPipelineEvent("document_understanding.legacy_ocr_summary", {
      filingId: filing.id,
      fiscalYear: filing.fiscalYear,
      diagnostics: legacyOcrResult.diagnostics,
      ocrPageScope: isMixedMode ? unreliablePageNumbers : "FULL_DOCUMENT",
    });
  }
  const openDataLoaderConfig = resolveOpenDataLoaderConfig();
  const openDataLoaderRoute = chooseOpenDataLoaderRoute({
    config: openDataLoaderConfig,
    preflight,
  });

  // Doc-type routing: Docling runs ONLY on digital documents. Scanned filings
  // (the majority of Brønnøysund reports) extract via OCR + geometry-first only —
  // Docling cannot table a scanned image, it instead runs its own internal OCR
  // which stalls indefinitely (the production hang). A scanned document
  // therefore skips Docling entirely and uses the LEGACY/OCR path, which is now
  // geometry-first-primary.
  const shouldRunOpenDataLoader =
    openDataLoaderConfig.enabled && preflight.hasReliableTextLayer;

  const plannedPrimaryEngine =
    shouldRunOpenDataLoader && !openDataLoaderConfig.dualRun
      ? "OPENDATALOADER"
      : "LEGACY";
  const plannedPrimaryMode =
    plannedPrimaryEngine === "OPENDATALOADER"
      ? openDataLoaderRoute.executionMode
      : "legacy";

  const extractionRun = await createFinancialExtractionRun({
    filingId: filing.id,
    companyId: filing.company.id,
    parserVersion: ANNUAL_REPORT_PARSER_VERSION,
    documentEngine: plannedPrimaryEngine,
    documentEngineVersion: null,
    documentEngineMode: plannedPrimaryMode,
    ocrEngine:
      plannedPrimaryEngine === "LEGACY"
        ? legacyOcrEngine
        : openDataLoaderRoute.requiresOcr
          ? "OPENDATALOADER_HYBRID_OCR"
          : openDataLoaderRoute.executionMode === "hybrid"
            ? "OPENDATALOADER_HYBRID"
            : "OPENDATALOADER_LOCAL",
    ocrLanguage:
      plannedPrimaryEngine === "LEGACY"
        ? preflight.hasReliableTextLayer
          ? null
          : "nor+eng"
        : openDataLoaderRoute.requiresOcr
          ? "nor+eng"
          : null,
  });

  let openDataLoaderResult: OpenDataLoaderParseResult | null = null;
  let openDataLoaderError: Error | null = null;
  let comparisonSummary: OpenDataLoaderComparisonSummary | null = null;
  let engineConsensus: EngineConsensus | null = null;

  try {
    if (shouldRunOpenDataLoader) {
      try {
        openDataLoaderResult = await parseAnnualReportPdfWithOpenDataLoader({
          pdfBuffer,
          sourceFilename: `${filing.company.orgNumber}-${filing.fiscalYear}.pdf`,
          preflight,
          config: openDataLoaderConfig,
        });
        artifactReferences.push(
          ...(await persistOpenDataLoaderArtifacts(
            filing.id,
            openDataLoaderResult,
          )),
        );
        logPipelineEvent("document_understanding.opendataloader_completed", {
          filingId: filing.id,
          extractionRunId: extractionRun.id,
          mode: openDataLoaderResult.routing.executionMode,
          requiresOcr: openDataLoaderResult.routing.requiresOcr,
          durationMs: openDataLoaderResult.metrics.durationMs,
          pageCount: openDataLoaderResult.metrics.pageCount,
          blockCount: openDataLoaderResult.metrics.blockCount,
        });
      } catch (error) {
        openDataLoaderError =
          error instanceof Error
            ? error
            : new Error("Unknown OpenDataLoader execution error");
        logRecoverableError("annual-report-financials.opendataloader", openDataLoaderError, {
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          extractionRunId: extractionRun.id,
        });
        logPipelineEvent("document_understanding.opendataloader_failed", {
          filingId: filing.id,
          extractionRunId: extractionRun.id,
          reason: openDataLoaderError.message,
          dualRun: openDataLoaderConfig.dualRun,
          fallbackToLegacy: openDataLoaderConfig.fallbackToLegacy,
        });

        if (!openDataLoaderConfig.dualRun && !openDataLoaderConfig.fallbackToLegacy) {
          throw openDataLoaderError;
        }
      }
    }

    const useLegacyPrimary = openDataLoaderConfig.dualRun || !openDataLoaderResult;
    let primaryEngine: "LEGACY" | "OPENDATALOADER" = useLegacyPrimary ? "LEGACY" : "OPENDATALOADER";
    const primaryOpenDataLoaderResult = useLegacyPrimary ? null : openDataLoaderResult;
    let primaryMode: "legacy" | "local" | "hybrid" = useLegacyPrimary
      ? "legacy"
      : primaryOpenDataLoaderResult!.routing.executionMode;
    const primaryPages = useLegacyPrimary
      ? legacyPages
      : primaryOpenDataLoaderResult!.annualReportPages;

    // Editable alias mapping + publish-required keys (both DB-backed, falling
    // back to built-in defaults). Loaded once and threaded through every
    // pipeline run for this extraction so a rename in the admin hub is honoured.
    const [metricDefinitions, requiredKeys, nodeRules] = await Promise.all([
      loadMetricDefinitions(),
      loadRequiredPublishMetricKeys(),
      loadNodeEvaluationConfig(),
    ]);

    let primaryComputation = await runFinancialPipeline({
      filingId: filing.id,
      extractionRunId: extractionRun.id,
      fiscalYear: filing.fiscalYear,
      parsedPages: primaryPages,
      engine: primaryEngine,
      mode: primaryMode,
      excludePageNumbers: pageHints?.hasReliableHints ? pageHints.excludePages : undefined,
      definitions: metricDefinitions,
      requiredKeys,
      nodeRules,
    });

    if (
      primaryEngine === "LEGACY" &&
      !preflight.hasReliableTextLayer &&
      preflight.pageCount > DEL1_PAGE_WINDOW &&
      !primaryComputation.canPublishSnapshot
    ) {
      const probePageNumbers = buildRotatedDeepScanProbePages(
        preflight.pageCount,
        DEL1_PAGE_WINDOW,
      );
      if (probePageNumbers.length > 0) {
        try {
          const probeResult = await extractOcrPagesBatched(
            pdfBuffer,
            probePageNumbers,
            2,
            { rotationDegrees: 90 },
          );
          const exactPageNumbers = selectRotatedDeepScanStatementPages({
            classifications: classifyPages(probeResult.pages),
            pageCount: preflight.pageCount,
          });

          if (exactPageNumbers.length > 0) {
            const rotatedOcrResult = await extractOcrPagesBatched(
              pdfBuffer,
              exactPageNumbers,
              undefined,
              { rotationDegrees: 90 },
            );
            const counterRotatedOcrResult = await extractOcrPagesBatched(
              pdfBuffer,
              exactPageNumbers,
              undefined,
              { rotationDegrees: 270 },
            );
            const selectedRotatedPages = selectBestDeepScanOcrPages([
              {
                pages: rotatedOcrResult.pages,
                classifications: classifyPages(rotatedOcrResult.pages),
              },
              {
                pages: counterRotatedOcrResult.pages,
                classifications: classifyPages(counterRotatedOcrResult.pages),
              },
            ]);
            const deepScanPages = replaceParsedPages(
              legacyPages,
              selectedRotatedPages,
            );
            const rotatedComputation = await runFinancialPipeline({
              filingId: filing.id,
              extractionRunId: extractionRun.id,
              fiscalYear: filing.fiscalYear,
              parsedPages: deepScanPages,
              engine: "LEGACY",
              mode: "legacy",
              excludePageNumbers: pageHints?.hasReliableHints ? pageHints.excludePages : undefined,
              definitions: metricDefinitions,
              requiredKeys,
              nodeRules,
            });
            let candidateComputation = rotatedComputation;
            let invertedDiagnostics: {
              primary: Awaited<ReturnType<typeof extractOcrPagesBatched>>["diagnostics"];
              counterRotated: Awaited<ReturnType<typeof extractOcrPagesBatched>>["diagnostics"];
            } | null = null;
            let invertedMergeStats: ReturnType<typeof selectivelyMergeOcrScaleFacts>["stats"] | null = null;
            try {
              const invertedOcrResult = await extractOcrPagesBatched(
                pdfBuffer,
                exactPageNumbers,
                undefined,
                { rotationDegrees: 90, invert: true },
              );
              const counterInvertedOcrResult = await extractOcrPagesBatched(
                pdfBuffer,
                exactPageNumbers,
                undefined,
                { rotationDegrees: 270, invert: true },
              );
              invertedDiagnostics = {
                primary: invertedOcrResult.diagnostics,
                counterRotated: counterInvertedOcrResult.diagnostics,
              };
              const selectedInvertedPages = selectBestDeepScanOcrPages([
                {
                  pages: invertedOcrResult.pages,
                  classifications: classifyPages(invertedOcrResult.pages),
                },
                {
                  pages: counterInvertedOcrResult.pages,
                  classifications: classifyPages(counterInvertedOcrResult.pages),
                },
              ]);
              const invertedPages = replaceParsedPages(
                legacyPages,
                selectedInvertedPages,
              );
              const invertedComputation = await runFinancialPipeline({
                filingId: filing.id,
                extractionRunId: extractionRun.id,
                fiscalYear: filing.fiscalYear,
                parsedPages: invertedPages,
                engine: "LEGACY",
                mode: "legacy",
                excludePageNumbers: pageHints?.hasReliableHints ? pageHints.excludePages : undefined,
                definitions: metricDefinitions,
                requiredKeys,
                nodeRules,
              });
              if (loopCandidateWins(invertedComputation, candidateComputation)) {
                candidateComputation = invertedComputation;
              } else {
                const merged = selectivelyMergeOcrScaleFacts(
                  candidateComputation.mapped.facts,
                  invertedComputation.mapped.facts,
                );
                invertedMergeStats = merged.stats;
                const acceptedRepairCount =
                  merged.stats.replacedTruncatedSlots + merged.stats.addedSiblingYearSlots;
                if (acceptedRepairCount > 0) {
                  candidateComputation = recomputeComputationWithFacts({
                    computation: candidateComputation,
                    fiscalYear: filing.fiscalYear,
                    facts: merged.facts,
                    requiredKeys,
                    nodeRules,
                  });
                }
              }
            } catch (invertedError) {
              logRecoverableError("annual-report-financials.ocrInvertedColumnRecovery", invertedError, {
                filingId: filing.id,
                fiscalYear: filing.fiscalYear,
                exactPageNumbers,
              });
            }

            const recovered = loopCandidateWins(candidateComputation, primaryComputation);
            logPipelineEvent("ocr_rotated_deep_scan.completed", {
              filingId: filing.id,
              extractionRunId: extractionRun.id,
              probePageCount: probePageNumbers.length,
              exactPageNumbers,
              rotationDegrees: 90,
              probeDiagnostics: probeResult.diagnostics,
              exactDiagnostics: rotatedOcrResult.diagnostics,
              counterRotatedDiagnostics: counterRotatedOcrResult.diagnostics,
              invertedDiagnostics,
              invertedMergeStats,
              currentConfidence: primaryComputation.confidenceScore,
              rotatedConfidence: rotatedComputation.confidenceScore,
              candidateConfidence: candidateComputation.confidenceScore,
              currentCanPublish: primaryComputation.canPublishSnapshot,
              rotatedCanPublish: rotatedComputation.canPublishSnapshot,
              candidateCanPublish: candidateComputation.canPublishSnapshot,
              recovered,
            });
            if (recovered) {
              primaryComputation = candidateComputation;
            }
          } else {
            logPipelineEvent("ocr_rotated_deep_scan.skipped", {
              filingId: filing.id,
              extractionRunId: extractionRun.id,
              probePageCount: probePageNumbers.length,
              reason: "no_statement_like_probe_pages",
              probeDiagnostics: probeResult.diagnostics,
            });
          }
        } catch (deepScanError) {
          logRecoverableError("annual-report-financials.ocrRotatedDeepScan", deepScanError, {
            filingId: filing.id,
            fiscalYear: filing.fiscalYear,
            probePageCount: probePageNumbers.length,
          });
        }
      }
    }

    // ── ML unit-scale shadow comparison (measurement only, never affects output) ──
    // Compares the in-house ML model's unit-scale predictions against the
    // rule-based classifications. Opt-in via ML_INFERENCE_SHADOW=true. Any
    // failure here is swallowed — it must never disturb the extraction.
    if (env.mlInferenceShadowEnabled) {
      try {
        const shadowComparison = await runUnitScaleShadowComparison({
          pages: primaryPages,
          classifications: primaryComputation.classifications,
        });
        logPipelineEvent("ml_shadow.unit_scale_comparison", {
          filingId: filing.id,
          extractionRunId: extractionRun.id,
          serviceAvailable: shadowComparison.serviceAvailable,
          comparedPages: shadowComparison.comparedPages,
          agreements: shadowComparison.agreements,
          disagreements: shadowComparison.disagreements,
          agreementRate: shadowComparison.agreementRate,
        });
      } catch (shadowError) {
        logRecoverableError("ml-shadow", shadowError, {
          operation: "unit_scale_comparison",
          filingId: filing.id,
        });
      }
    }

    if (env.mlInferenceFinancialFactShadowEnabled) {
      try {
        const shadowComparison = await runFinancialFactShadowComparison({
          facts: primaryComputation.mapped.facts,
          classifications: primaryComputation.classifications,
          rows: primaryComputation.rows,
        });
        logPipelineEvent("ml_shadow.financial_fact_comparison", {
          filingId: filing.id,
          extractionRunId: extractionRun.id,
          serviceAvailable: shadowComparison.serviceAvailable,
          comparedFacts: shadowComparison.comparedFacts,
          agreements: shadowComparison.agreements,
          disagreements: shadowComparison.disagreements,
          skippedAsReported: shadowComparison.skippedAsReported,
          agreementRate: shadowComparison.agreementRate,
        });
      } catch (shadowError) {
        logRecoverableError("ml-shadow", shadowError, {
          operation: "financial_fact_comparison",
          filingId: filing.id,
        });
      }
    }

    if (openDataLoaderResult && openDataLoaderConfig.dualRun) {
      const shadowComputation = await runFinancialPipeline({
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        fiscalYear: filing.fiscalYear,
        parsedPages: openDataLoaderResult.annualReportPages,
        engine: "OPENDATALOADER",
        mode: openDataLoaderResult.routing.executionMode,
        excludePageNumbers: pageHints?.hasReliableHints ? pageHints.excludePages : undefined,
        definitions: metricDefinitions,
        requiredKeys,
        nodeRules,
      });

      // Always compare against the Legacy result that started as primary, regardless
      // of whether we later swap. Keeps the audit artifact consistent.
      const legacyComputationForComparison = primaryComputation;

      comparisonSummary = buildOpenDataLoaderComparisonSummary({
        primary: buildPipelineSnapshot({
          engine: "LEGACY",
          mode: "legacy",
          computation: legacyComputationForComparison,
        }),
        shadow: buildPipelineSnapshot({
          engine: "OPENDATALOADER",
          mode: openDataLoaderResult.routing.executionMode,
          computation: shadowComputation,
        }),
      });

      // Engine consensus — compare the two engines' selected facts. Computed
      // here once (Legacy vs ODL); applied below to whichever wins selection.
      const consensus = computeEngineConsensus(
        legacyComputationForComparison.selectedFacts,
        shadowComputation.selectedFacts,
      );
      engineConsensus = consensus;

      artifactReferences.push(
        await persistArtifactFile({
          filingId: filing.id,
          artifactType: "EXTRACTION_COMPARISON_JSON",
          filename: "opendataloader-dual-run-comparison.json",
          content: serializeJsonBuffer({
            comparisonSummary,
            consensus,
            primary: buildPipelineSnapshot({
              engine: "LEGACY",
              mode: "legacy",
              computation: legacyComputationForComparison,
            }),
            shadow: buildPipelineSnapshot({
              engine: "OPENDATALOADER",
              mode: openDataLoaderResult.routing.executionMode,
              computation: shadowComputation,
            }),
          }),
          mimeType: "application/json",
          metadata: {
            primaryEngine: "LEGACY",
            shadowEngine: "OPENDATALOADER",
          },
        }),
      );

      logPipelineEvent("document_understanding.opendataloader_dual_run", {
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        materialDisagreement: comparisonSummary.materialDisagreement,
        publishDecisionMismatch: comparisonSummary.publishDecisionMismatch,
      });

      // Engine selection: best result wins. In dual-run both engines have
      // produced a full computation — publish whichever did the better job
      // rather than always trusting Legacy. A publishable result outranks a
      // non-publishable one; within the same tier the higher-or-equal confidence
      // score wins (ties go to ODL — it has better structured-document parsing,
      // especially for group companies with dual statements).
      // Gated by OPENDATALOADER_AUTO_PROMOTE — when off, Legacy stays primary.
      if (openDataLoaderConfig.autoPromote) {
        const legacy = legacyComputationForComparison;
        const odl = shadowComputation;
        const legacyTier = legacy.canPublishSnapshot ? 1 : 0;
        const odlTier = odl.canPublishSnapshot ? 1 : 0;
        const odlWins =
          odlTier > legacyTier ||
          (odlTier === legacyTier &&
            odl.confidenceScore >= legacy.confidenceScore);

        if (odlWins) {
          const promotionReason =
            odl.canPublishSnapshot && !legacy.canPublishSnapshot
              ? "ODL_PUBLISHABLE_LEGACY_NOT"
              : odl.confidenceScore > legacy.confidenceScore
                ? "ODL_HIGHER_CONFIDENCE"
                : "ODL_TIED_PROMOTED";
          logPipelineEvent("document_understanding.opendataloader_auto_promoted", {
            filingId: filing.id,
            extractionRunId: extractionRun.id,
            reason: promotionReason,
            legacyConfidenceScore: legacy.confidenceScore,
            shadowConfidenceScore: odl.confidenceScore,
            legacyBlockingRules: legacy.reviewRuleCodes,
            shadowBlockingRules: odl.reviewRuleCodes,
          });
          primaryComputation = odl;
          primaryEngine = "OPENDATALOADER";
          primaryMode = openDataLoaderResult.routing.executionMode;

          // Surface the swap to admins so they can verify ODL really did the
          // better job. Dedupe per extraction run so a re-run doesn't spam.
          await createAdminNotificationIfMissing({
            type: "ENGINE_PROMOTION_OBSERVED",
            recipientRole: "ADMIN",
            title: `OpenDataLoader overtok for ${filing.company.orgNumber} (${filing.fiscalYear})`,
            body:
              `ODL ga et bedre ekstraksjonsresultat enn Legacy ` +
              `(konfidens ${odl.confidenceScore.toFixed(2)} mot ${legacy.confidenceScore.toFixed(2)}). ` +
              `Anbefales å verifisere tallene før de regnes som endelige.`,
            linkPath: `/admin/annual-report-reviews?orgNumber=${filing.company.orgNumber}&fiscalYear=${filing.fiscalYear}`,
            dedupeKey: `engine-promotion:${extractionRun.id}`,
            metadata: {
              filingId: filing.id,
              extractionRunId: extractionRun.id,
              orgNumber: filing.company.orgNumber,
              fiscalYear: filing.fiscalYear,
              legacyConfidenceScore: legacy.confidenceScore,
              shadowConfidenceScore: odl.confidenceScore,
            },
          }).catch((notificationError) => {
            // Notification failure must never block the extraction pipeline.
            logRecoverableError("admin-notification", notificationError, {
              operation: "engine_promotion",
              filingId: filing.id,
              extractionRunId: extractionRun.id,
            });
          });
        }
      }

      // Engine consensus: fold the two engines' agreement into the chosen
      // computation. Agreement on the headline figures lifts confidence;
      // disagreement on a publish-gating metric forces that fact to review.
      primaryComputation = applyEngineConsensus(
        primaryComputation,
        consensus,
        filing.fiscalYear,
        requiredKeys,
      );
      logPipelineEvent("document_understanding.engine_consensus", {
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        comparedCount: consensus.comparedCount,
        agreementScore: consensus.agreementScore,
        disagreedMetricKeys: consensus.disagreedMetricKeys,
        confidenceDelta: consensusConfidenceDelta(consensus),
      });
    }

    // ── Self-correcting loop ─────────────────────────────────────────────
    // For statement pages diagnosed as reconstruction-weak (high recognition
    // but low reconstruction confidence — Canica's failure mode), try the
    // geometry-first branch and keep the alternative only when it strictly
    // outperforms the current computation. One iteration, one branch.
    // Recovery is best-effort: any failure inside the loop must never break
    // the primary extraction. The original computation already exists; the
    // loop can only improve on it, never replace it with a crash.
    const recoveryCandidates = selectRecoveryCandidates(
      primaryComputation.pageConfidences,
    );
    if (recoveryCandidates.length > 0) {
      try {
        const primaryPages: AnnualReportParsedInputPage[] =
          primaryEngine === "OPENDATALOADER" && openDataLoaderResult
            ? openDataLoaderResult.annualReportPages
            : legacyPages;
        const recoveryRows = buildAlternativeRowsForRecovery({
          originalRows: primaryComputation.rows,
          classifications: primaryComputation.classifications,
          parsedPages: primaryPages,
          candidates: recoveryCandidates,
        });
        if (recoveryRows.recoveredRowCount === 0) {
          // The recovery branch produced no rows of its own — the alternative
          // would be a strict subset of the original, nothing to gain.
          logPipelineEvent("extraction_loop.recovery_skipped", {
            filingId: filing.id,
            extractionRunId: extractionRun.id,
            candidatePageNumbers: recoveryCandidates.map((c) => c.pageNumber),
            reason: "no_recovered_rows",
          });
        } else {
          let alternative = assembleComputation({
            fiscalYear: filing.fiscalYear,
            parsedPages: primaryPages,
            classifications: primaryComputation.classifications,
            rows: recoveryRows.rows,
            engine: primaryEngine,
            mode: primaryMode,
            startedAt: Date.now(),
            definitions: metricDefinitions,
            requiredKeys,
            nodeRules,
          });
          if (engineConsensus) {
            // Compare like-for-like: apply the same consensus signal that the
            // current primaryComputation already carries.
            alternative = applyEngineConsensus(
              alternative,
              engineConsensus,
              filing.fiscalYear,
              requiredKeys,
            );
          }
          const recovered = loopCandidateWins(alternative, primaryComputation);
          logPipelineEvent("extraction_loop.recovery_attempt", {
            filingId: filing.id,
            extractionRunId: extractionRun.id,
            candidatePageNumbers: recoveryCandidates.map((c) => c.pageNumber),
            currentConfidence: primaryComputation.confidenceScore,
            alternativeConfidence: alternative.confidenceScore,
            currentCanPublish: primaryComputation.canPublishSnapshot,
            alternativeCanPublish: alternative.canPublishSnapshot,
            recovered,
          });
          if (recovered) {
            primaryComputation = alternative;
          }
        }
      } catch (loopError) {
        logRecoverableError("annual-report-financials.extractionLoop", loopError, {
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          candidatePageNumbers: recoveryCandidates.map((c) => c.pageNumber),
        });
      }
    }

    // ── Unified extractor shadow run (never affects production output) ────────
    // Errors in this block are caught internally by runAnnualReportUnifiedShadowExtraction
    // and must not propagate to the primary pipeline.
    if (primaryEngine === "LEGACY" && legacyOcrResult) {
      const highScalePageNumbers = primaryComputation.classifications
        .filter((classification) => STATUTORY_SECTION_TYPES.has(classification.type))
        .map((classification) => classification.pageNumber)
        .filter((pageNumber, index, pageNumbers) => pageNumbers.indexOf(pageNumber) === index)
        .sort((left, right) => left - right)
        .slice(0, OCR_HIGH_SCALE_RECOVERY_MAX_PAGES);

      if (highScalePageNumbers.length > 0) {
        try {
          const highScaleOcrResult = await extractOcrPagesBatched(
            pdfBuffer,
            highScalePageNumbers,
            undefined,
            { renderScale: OCR_HIGH_SCALE_RECOVERY_SCALE },
          );
          const highScalePagesByNumber = new Map(
            highScaleOcrResult.pages.map((page) => [page.pageNumber, page]),
          );
          const highScalePages = legacyPages.map(
            (page) => highScalePagesByNumber.get(page.pageNumber) ?? page,
          );
          const highScaleComputation = await runFinancialPipeline({
            filingId: filing.id,
            extractionRunId: extractionRun.id,
            fiscalYear: filing.fiscalYear,
            parsedPages: highScalePages,
            engine: "LEGACY",
            mode: "legacy",
            excludePageNumbers: pageHints?.hasReliableHints ? pageHints.excludePages : undefined,
            definitions: metricDefinitions,
            requiredKeys,
            nodeRules,
          });
          const reconciledRows = reconcileStatementRowsAcrossOcrScales(
            primaryComputation.rows,
            highScaleComputation.rows,
          );
          let reconciledComputation = assembleComputation({
            fiscalYear: filing.fiscalYear,
            parsedPages: highScalePages,
            classifications: primaryComputation.classifications,
            rows: reconciledRows,
            engine: "LEGACY",
            mode: "legacy",
            startedAt: Date.now(),
            definitions: metricDefinitions,
            requiredKeys,
            nodeRules,
          });
          if (engineConsensus) {
            reconciledComputation = applyEngineConsensus(
              reconciledComputation,
              engineConsensus,
              filing.fiscalYear,
              requiredKeys,
            );
          }
          const merged = selectivelyMergeOcrScaleFacts(
            primaryComputation.mapped.facts,
            highScaleComputation.mapped.facts,
          );
          const acceptedRepairCount =
            merged.stats.replacedTruncatedSlots + merged.stats.addedSiblingYearSlots;
          const rowRecoveryWins = loopCandidateWins(reconciledComputation, primaryComputation);
          logPipelineEvent("ocr_high_scale_recovery.completed", {
            filingId: filing.id,
            extractionRunId: extractionRun.id,
            renderScale: OCR_HIGH_SCALE_RECOVERY_SCALE,
            pageNumbers: highScalePageNumbers,
            diagnostics: highScaleOcrResult.diagnostics,
            mergeStats: merged.stats,
            acceptedRepairCount,
            primaryRowCount: primaryComputation.rows.length,
            highScaleRowCount: highScaleComputation.rows.length,
            reconciledRowCount: reconciledRows.length,
            rowRecoveryWins,
          });
          if (rowRecoveryWins) {
            primaryComputation = reconciledComputation;
          } else if (acceptedRepairCount > 0) {
            primaryComputation = recomputeComputationWithFacts({
              computation: primaryComputation,
              fiscalYear: filing.fiscalYear,
              facts: merged.facts,
              requiredKeys,
              nodeRules,
            });
          }
        } catch (highScaleRecoveryError) {
          logRecoverableError(
            "annual-report-financials.ocrHighScaleRecovery",
            highScaleRecoveryError,
            {
              filingId: filing.id,
              fiscalYear: filing.fiscalYear,
              pageNumbers: highScalePageNumbers,
            },
          );
        }
      }
    }

    let unifiedExtractionResult: AnnualReportUnifiedShadowResult | null = null;
    try {
      const unifiedShadowConfig = getAnnualReportUnifiedShadowConfigFromEnv();
      const shadowConfigErrors = validateAnnualReportUnifiedShadowConfig(unifiedShadowConfig);
      if (shadowConfigErrors.length > 0) {
        logPipelineEvent("unified_shadow.invalid_config", {
          filingId: filing.id,
          errors: shadowConfigErrors,
        });
      }
      const unifiedExtractionConfig =
        shadowConfigErrors.length === 0 && unifiedShadowConfig.mode !== "DISABLED"
          ? unifiedShadowConfig
          : MACHINE_LINE_ITEM_EXTRACTION_CONFIG;

      unifiedExtractionResult = await runAnnualReportUnifiedShadowExtraction({
          filingId: filing.id,
          companyId: filing.company.id,
          orgNumber: filing.company.orgNumber,
          fiscalYear: filing.fiscalYear,
          preflight,
          parsedPages: openDataLoaderResult?.annualReportPages,
          route: openDataLoaderResult
            ? mapOpenDataLoaderExecutionModeToUnifiedRoute(
                openDataLoaderResult.routing.executionMode,
              )
            : undefined,
          legacyCandidates: primaryComputation.mapped.facts,
          config: unifiedExtractionConfig,
          sourceCommand: `annual-report-financials-service/processAnnualReportFiling`,
        });
        logPipelineEvent("unified_shadow.completed", {
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          mode: unifiedExtractionResult.mode,
          totalDurationMs: unifiedExtractionResult.totalDurationMs,
          documentOk: unifiedExtractionResult.steps.document?.ok ?? null,
          financialOk: unifiedExtractionResult.steps.financial?.ok ?? null,
          narrativeOk: unifiedExtractionResult.steps.narrative?.ok ?? null,
          comparisonOk: unifiedExtractionResult.steps.comparison?.ok ?? null,
          warningCount: unifiedExtractionResult.warnings.length,
          canUseForProductionRouting: unifiedExtractionResult.canUseForProductionRouting,
          usedForMachineLineItemPublishing: true,
        });
    } catch (unifiedShadowError) {
      // Shadow errors must never affect primary pipeline outcome.
      logRecoverableError(
        "annual-report-financials.unifiedShadow",
        unifiedShadowError,
        { filingId: filing.id, fiscalYear: filing.fiscalYear },
      );
    }

    await updateAnnualReportFiling(filing.id, {
      extractedAt: new Date(),
      validatedAt: new Date(),
      metadata: {
        documentUnderstanding: {
          primaryEngine,
          primaryMode,
          dualRun: openDataLoaderConfig.dualRun,
          openDataLoader: openDataLoaderResult
            ? {
                engineVersion: openDataLoaderResult.engineVersion,
                route: openDataLoaderResult.routing,
                metrics: openDataLoaderResult.metrics,
              }
            : {
                route: openDataLoaderRoute,
                error: openDataLoaderError?.message ?? null,
              },
        },
      } as unknown as Prisma.InputJsonValue,
    });

    artifactReferences.push(
      await persistJsonArtifact({
      filingId: filing.id,
      artifactType: "CLASSIFICATION_JSON",
      filename: "classification.json",
      payload: {
        engine: primaryEngine,
        mode: primaryMode,
        classifications: primaryComputation.classifications,
        pageConfidences: primaryComputation.pageConfidences,
        comparisonSummary,
      },
    }),
    );
    artifactReferences.push(
      await persistJsonArtifact({
      filingId: filing.id,
      artifactType: "EXTRACTION_JSON",
      filename: "extraction.json",
      payload: {
        engine: primaryEngine,
        mode: primaryMode,
        rows: primaryComputation.rows,
        mappedFacts: primaryComputation.mapped.facts,
        validationStats: primaryComputation.validation.stats,
        comparisonSummary,
      },
    }),
    );
    await createFinancialFacts({
      extractionRunId: extractionRun.id,
      filingId: filing.id,
      companyId: filing.company.id,
      facts: primaryComputation.mapped.facts,
    });
    await createFinancialValidationIssues({
      extractionRunId: extractionRun.id,
      filingId: filing.id,
      companyId: filing.company.id,
      fiscalYear: filing.fiscalYear,
      issues: primaryComputation.issues,
    });

    const validationSummary = buildValidationSummary(primaryComputation);
    let postValidationPdfDecision: PdfDecisionResult | null = null;
    try {
      postValidationPdfDecision = runPdfDecisionEngine(
        {
          preflight,
          structuredDocument: preflight.structuredDocument ?? null,
          pageHints: pageHints ?? null,
          odlConfig: {
            enabled: openDataLoaderConfig.enabled,
            mode: openDataLoaderConfig.mode,
          },
          validationSummary,
        },
        { ruleConfig: activePdfDecisionRuleConfig },
      );
      artifactReferences.push(
        await persistJsonArtifact({
          filingId: filing.id,
          artifactType: "PDF_DECISION_JSON",
          filename: "pdf-decision-post-validation.json",
          payload: buildPdfDecisionArtifactPayload({
            decision: postValidationPdfDecision,
            orgNumber: filing.company.orgNumber,
            fiscalYear: filing.fiscalYear,
            filingId: filing.id,
            extractionRunId: extractionRun.id,
            phase: "post_validation",
            hasPreflight: true,
            hasStructuredDocument: Boolean(preflight.structuredDocument),
            hasPageHints: Boolean(pageHints),
            hasValidationSummary: true,
            openDataLoaderEnabled: openDataLoaderConfig.enabled,
          }),
        }),
      );
    } catch (decisionArtifactError) {
      logRecoverableError(
        "annual-report-financials.postValidationPdfDecisionArtifact",
        decisionArtifactError,
        { filingId: filing.id, fiscalYear: filing.fiscalYear },
      );
    }
    const reviewPdfDecision = postValidationPdfDecision ?? pdfDecision;

    const reviewSummary = buildReviewPayload({
      filingId: filing.id,
      extractionRunId: extractionRun.id,
      classifications: primaryComputation.classifications,
      issues: primaryComputation.issues,
      selectedFacts: primaryComputation.selectedFacts,
      consensus: engineConsensus,
      artifactReferences,
      engineSummary: {
        primaryEngine,
        primaryMode,
        parserVersion: ANNUAL_REPORT_PARSER_VERSION,
        openDataLoaderEngineVersion: openDataLoaderResult?.engineVersion ?? null,
        route:
          openDataLoaderResult?.routing ??
          (openDataLoaderConfig.enabled ? openDataLoaderRoute : null),
        openDataLoaderError: openDataLoaderError?.message ?? null,
        legacyOcrDiagnostics: legacyOcrResult?.diagnostics ?? null,
      },
      comparisonSummary,
      documentDiagnostics: preflight.diagnostics ?? null,
      structuredDocument: preflight.structuredDocument ?? null,
      pdfDecision: reviewPdfDecision,
    });

    artifactReferences.push(
      await persistJsonArtifact({
      filingId: filing.id,
      artifactType: "NORMALIZED_JSON",
      filename: "normalized.json",
      payload: primaryComputation.normalizedPayload,
    }),
    );
    await completeFinancialExtractionRun(extractionRun.id, {
      documentEngine: primaryEngine,
      documentEngineVersion:
        primaryEngine === "OPENDATALOADER"
          ? openDataLoaderResult?.engineVersion ?? null
          : null,
      documentEngineMode: primaryMode,
      status: primaryComputation.canPublishSnapshot ? "SUCCEEDED" : "MANUAL_REVIEW",
      finishedAt: new Date(),
      confidenceScore: primaryComputation.confidenceScore,
      validationScore: primaryComputation.validation.validationScore,
      metricsCoverage: {
        selectedFactCount: primaryComputation.selectedFacts.size,
        requiredMetricCount: requiredKeys.length,
        duplicateSupport: primaryComputation.duplicateSupport,
        noteSupport: primaryComputation.noteSupport,
        documentArtifactCount: artifactReferences.length,
      },
      rawSummary: {
        issues: primaryComputation.issues,
        classifications: primaryComputation.classifications,
        validationStats: primaryComputation.validation.stats,
        legacyOcrDiagnostics: legacyOcrResult?.diagnostics ?? null,
        documentUnderstanding: {
          primaryEngine,
          primaryMode,
          openDataLoaderRoute:
            openDataLoaderResult?.routing ??
            (openDataLoaderConfig.enabled ? openDataLoaderRoute : null),
          openDataLoaderError: openDataLoaderError?.message ?? null,
          comparisonSummary,
          artifactReferences,
        },
      } as unknown as Prisma.InputJsonValue,
    });

    if (primaryComputation.canPublishSnapshot) {
      const publishedAt = new Date();
      const publishedQualityStatus = primaryComputation.canSkipManualReview
        ? "HIGH_CONFIDENCE"
        : "LOW_CONFIDENCE";

      // Publish the primary scope (the validated, scored headline statement).
      await publishScopedSnapshot({
        companyId: filing.company.id,
        orgNumber: filing.company.orgNumber,
        fiscalYear: filing.fiscalYear,
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        scope: primaryComputation.primaryScope,
        selectedFacts: primaryComputation.selectedFacts,
        normalizedPayload: primaryComputation.normalizedPayload,
        qualityStatus: publishedQualityStatus,
        qualityScore: primaryComputation.confidenceScore,
        publishedAt,
      });

      // K4: also publish the secondary scope when the filing carried both
      // konsern and selskap accounts, so app users can toggle. The secondary
      // set was extracted but not separately gated — publish it at
      // MANUAL_REVIEW quality.
      const secondaryScope =
        primaryComputation.primaryScope === "CONSOLIDATED" ? "COMPANY" : "CONSOLIDATED";
      const hasSecondaryScopeFacts = primaryComputation.mapped.facts.some(
        (fact) => fact.statementScope === secondaryScope,
      );
      const secondaryFacts = hasSecondaryScopeFacts
        ? chooseCanonicalFacts(primaryComputation.mapped.facts, secondaryScope)
        : new Map<string, CanonicalFactCandidate>();
      if (hasSecondaryScopeFacts && secondaryFacts.size > 0) {
        await publishScopedSnapshot({
          companyId: filing.company.id,
          orgNumber: filing.company.orgNumber,
          fiscalYear: filing.fiscalYear,
          filingId: filing.id,
          extractionRunId: extractionRun.id,
          scope: secondaryScope,
          selectedFacts: secondaryFacts,
          normalizedPayload: buildNormalizedFinancialPayload(
            filing.fiscalYear,
            secondaryFacts,
          ),
          qualityStatus: "MANUAL_REVIEW",
          qualityScore: primaryComputation.confidenceScore,
          publishedAt,
        });
      }
      if (unifiedExtractionResult?.financial) {
        const machineLineItems = buildPublishedMachineLineItems({
          financial: unifiedExtractionResult.financial,
          statementScope: primaryComputation.primaryScope,
        });
        const publishedLineItems = await publishMachineFinancialLineItems({
          filingId: filing.id,
          companyId: filing.company.id,
          extractionRunId: extractionRun.id,
          sourceSystem: "BRREG",
          sourceEntityType: "annualReportMachineLineItem",
          sourceId: `brreg:${filing.company.orgNumber}:${filing.fiscalYear}:${extractionRun.id}`,
          fetchedAt: filing.downloadedAt ?? publishedAt,
          normalizedAt: publishedAt,
          publishedAt,
          items: machineLineItems,
        });
        logPipelineEvent("machine_line_items.published", {
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          extractionRunId: extractionRun.id,
          publishedCount: publishedLineItems.publishedCount,
          statementScope: primaryComputation.primaryScope,
        });
      } else {
        logPipelineEvent("machine_line_items.skipped", {
          filingId: filing.id,
          fiscalYear: filing.fiscalYear,
          extractionRunId: extractionRun.id,
          reason: "unified_financial_extraction_unavailable",
        });
      }
      await updateAnnualReportFiling(filing.id, { status: "PUBLISHED", publishedSnapshotAt: publishedAt, manualReviewAt: primaryComputation.canSkipManualReview ? null : new Date(), unitHints: { classifications: primaryComputation.classifications, hasKnownUnitScale: hasKnownUnitScale(primaryComputation.classifications), primaryEngine, primaryMode } });
      if (primaryComputation.canSkipManualReview) {
        await resolveAnnualReportReviewsForFiling(filing.id);
      } else {
        await upsertAnnualReportReview({
          filingId: filing.id,
          extractionRunId: extractionRun.id,
          companyId: filing.company.id,
          fiscalYear: filing.fiscalYear,
          status: "PENDING_REVIEW",
          qualityScore: primaryComputation.confidenceScore,
          sourcePrecedenceAttempted: primaryComputation.sourcePrecedence,
          blockingRuleCodes: primaryComputation.reviewRuleCodes,
          pageReferences: reviewSummary.pageReferences,
          latestActionNote: "Published provisionally; awaiting manual review.",
          reviewPayload: reviewSummary.reviewPayload as unknown as Prisma.InputJsonValue,
        });
      }
      await upsertCompanyFinancialCoverage({ companyId: filing.company.id, latestDownloadedFiscalYear: filing.fiscalYear, latestPublishedFiscalYear: filing.fiscalYear, latestDiscoveredFiscalYear: filing.fiscalYear, lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(24), coverageStatus: "PUBLISHED", latestSuccessfulFilingId: filing.id });
      logPipelineEvent("filing.published", { filingId: filing.id, fiscalYear: filing.fiscalYear, extractionRunId: extractionRun.id, confidenceScore: primaryComputation.confidenceScore, sourcePrecedence: primaryComputation.sourcePrecedence, canSkipManualReview: primaryComputation.canSkipManualReview, primaryEngine, primaryMode });
    } else {
      await updateAnnualReportFiling(filing.id, { status: "MANUAL_REVIEW", manualReviewAt: new Date(), lastError: primaryComputation.issues.map((issue) => `${issue.ruleCode}: ${issue.message}`).join(" | ").slice(0, 1_000) });
      await upsertAnnualReportReview({
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        companyId: filing.company.id,
        fiscalYear: filing.fiscalYear,
        status: "PENDING_REVIEW",
        qualityScore: primaryComputation.confidenceScore,
        sourcePrecedenceAttempted: primaryComputation.sourcePrecedence,
        blockingRuleCodes: primaryComputation.reviewRuleCodes,
        pageReferences: reviewSummary.pageReferences,
        latestActionNote: "Blocked by provisional publish gate",
        reviewPayload: reviewSummary.reviewPayload as unknown as Prisma.InputJsonValue,
      });
      await upsertCompanyFinancialCoverage({ companyId: filing.company.id, latestDownloadedFiscalYear: filing.fiscalYear, latestDiscoveredFiscalYear: filing.fiscalYear, lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(12), coverageStatus: "MANUAL_REVIEW" });
      logPipelineEvent("filing.manual_review", { filingId: filing.id, fiscalYear: filing.fiscalYear, extractionRunId: extractionRun.id, confidenceScore: primaryComputation.confidenceScore, blockingRuleCodes: primaryComputation.reviewRuleCodes, primaryEngine, primaryMode });
    }

    return { filingId: filing.id, fiscalYear: filing.fiscalYear, confidenceScore: primaryComputation.confidenceScore, published: primaryComputation.canPublishSnapshot, issueCount: primaryComputation.issues.length };
  } catch (error) {
    await completeFinancialExtractionRun(extractionRun.id, { status: "FAILED", finishedAt: new Date(), errorMessage: error instanceof Error ? error.message : "Unknown extraction error", rawSummary: { openDataLoaderError: openDataLoaderError?.message ?? null, artifactReferences } as unknown as Prisma.InputJsonValue });
    await updateAnnualReportFiling(filing.id, { status: "FAILED", failedAt: new Date(), lastError: error instanceof Error ? error.message : "Unknown extraction error" });
    await upsertAnnualReportReview({
      filingId: filing.id,
      extractionRunId: extractionRun.id,
      companyId: filing.company.id,
      fiscalYear: filing.fiscalYear,
      status: "PENDING_REVIEW",
      qualityScore: null,
      sourcePrecedenceAttempted: null,
      blockingRuleCodes: ["PIPELINE_EXCEPTION"],
      pageReferences: [],
      latestActionNote: error instanceof Error ? error.message : "Unknown extraction error",
      reviewPayload: {
        filingId: filing.id,
        extractionRunId: extractionRun.id,
        error: error instanceof Error ? error.message : "Unknown extraction error",
        artifactReferences,
        engineSummary: {
          plannedPrimaryEngine,
          plannedPrimaryMode,
          openDataLoaderError: openDataLoaderError?.message ?? null,
          legacyOcrDiagnostics: legacyOcrResult?.diagnostics ?? null,
        },
      } as unknown as Prisma.InputJsonValue,
    });
    await upsertCompanyFinancialCoverage({ companyId: filing.company.id, latestDownloadedFiscalYear: filing.fiscalYear, latestDiscoveredFiscalYear: filing.fiscalYear, lastCheckedAt: new Date(), nextCheckAt: nextCheckDate(6), coverageStatus: "FAILED" });
    logPipelineEvent("filing.failed", { filingId: filing.id, fiscalYear: filing.fiscalYear, extractionRunId: extractionRun.id, error: error instanceof Error ? error.message : "Unknown extraction error" });
    throw error;
  }
}

export async function discoverAnnualReportFilingsForCompany(orgNumber: string) {
  const company = await findCompanyByOrgNumber(orgNumber);
  if (!company) throw new Error(`Fant ikke virksomhet ${orgNumber}.`);
  const existingPublished = await getPublishedFinancialsForCompany(orgNumber);
  const filings = await provider.listAnnualReportFilings(orgNumber);
  for (const filing of filings) {
    await upsertAnnualReportFilingDiscovery({ companyId: company.id, fiscalYear: filing.fiscalYear, sourceSystem: filing.sourceSystem, sourceUrl: filing.sourceUrl, sourceDiscoveryKey: filing.sourceDiscoveryKey, sourceIdempotencyKey: filing.sourceIdempotencyKey, sourceDocumentType: filing.sourceDocumentType, discoveredAt: filing.discoveredAt });
  }
  const latestDiscoveredFiscalYear = filings.map((filing) => filing.fiscalYear).sort((left, right) => right - left)[0] ?? null;
  await upsertCompanyFinancialCoverage({
    companyId: company.id,
    latestDiscoveredFiscalYear,
    latestDownloadedFiscalYear: existingPublished?.financialCoverage?.latestDownloadedFiscalYear ?? undefined,
    latestPublishedFiscalYear: existingPublished?.financialCoverage?.latestPublishedFiscalYear ?? undefined,
    latestSuccessfulFilingId: existingPublished?.financialCoverage?.latestSuccessfulFilingId ?? undefined,
    lastCheckedAt: new Date(),
    nextCheckAt: nextCheckDate(24),
    coverageStatus:
      existingPublished?.financialCoverage?.coverageStatus && existingPublished.financialCoverage.coverageStatus !== "UNCHECKED"
        ? existingPublished.financialCoverage.coverageStatus
        : filings.length > 0
          ? "DISCOVERED"
        : "UNCHECKED",
  });
  logPipelineEvent("filing.discovery_completed", {
    orgNumber,
    companyId: company.id,
    discoveredFilings: filings.length,
    latestDiscoveredFiscalYear,
  });
  return { orgNumber, companyName: company.name, discoveredFilings: filings.length, fiscalYears: filings.map((filing) => filing.fiscalYear).sort((left, right) => right - left) };
}

export async function processPendingAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number; statuses?: AnnualReportFilingStatus[] }) {
  const filings = await listPendingAnnualReportFilings({ orgNumbers: options?.orgNumbers, limit: options?.limit, statuses: options?.statuses });
  const results = [];
  for (const filing of filings) {
    try {
      results.push(await processAnnualReportFiling(filing.id));
    } catch (error) {
      logRecoverableError("annual-report-financials.processPending", error, { filingId: filing.id, orgNumber: filing.company.orgNumber, fiscalYear: filing.fiscalYear });
      results.push({ filingId: filing.id, fiscalYear: filing.fiscalYear, published: false, error: error instanceof Error ? error.message : "Unknown processing error" });
    }
  }
  return results;
}

export async function backfillAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number }) {
  const companies = await listCompaniesForFinancialSync({ orgNumbers: options?.orgNumbers, limit: options?.limit });
  const discovered = [];
  for (const company of companies) discovered.push(await discoverAnnualReportFilingsForCompany(company.orgNumber));
  const processed = await processPendingAnnualReportFilings({ orgNumbers: options?.orgNumbers });
  logPipelineEvent("backfill.completed", {
    companyCount: companies.length,
    discoveredCount: discovered.reduce((sum, item) => sum + item.discoveredFilings, 0),
    processedCount: processed.length,
  });
  return { discovered, processed };
}

export async function syncNewAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number }) {
  const companies = await listCompaniesForFinancialSync({ orgNumbers: options?.orgNumbers, onlyDue: true, limit: options?.limit });
  if (companies.length === 0) return { checkedCompanies: 0, discovered: [], versionChecks: [], processed: [] };
  const discovered = [];
  const versionChecks = [];
  for (const company of companies) {
    discovered.push(await discoverAnnualReportFilingsForCompany(company.orgNumber));
    versionChecks.push(...(await verifyLatestKnownFilingHashes(company.id)));
  }
  const processed = await processPendingAnnualReportFilings({ orgNumbers: companies.map((company) => company.orgNumber) });
  logPipelineEvent("sync.completed", {
    checkedCompanies: companies.length,
    discoveredCount: discovered.reduce((sum, item) => sum + item.discoveredFilings, 0),
    versionCheckCount: versionChecks.length,
    processedCount: processed.length,
  });
  return { checkedCompanies: companies.length, discovered, versionChecks, processed };
}

export async function reprocessLowConfidenceAnnualReportFilings(options?: { orgNumbers?: string[]; limit?: number }) {
  return reprocessAnnualReportFilingsByCriteria({
    orgNumbers: options?.orgNumbers,
    maxQualityScore: 0.9,
    limit: options?.limit,
  });
}

export async function listAnnualReportReviewQueue(options?: {
  statuses?: AnnualReportReviewStatus[];
  ruleCodes?: string[];
  orgNumbers?: string[];
  limit?: number;
}) {
  const reviews = await listAnnualReportReviews({
    statuses: options?.statuses ?? ["PENDING_REVIEW", "REPROCESS_REQUESTED"],
    ruleCodes: options?.ruleCodes,
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
  });

  return reviews.map((review) => {
    const payload =
      review.reviewPayload && typeof review.reviewPayload === "object"
        ? (review.reviewPayload as Record<string, any>)
        : null;

    return {
      reviewId: review.id,
      status: review.status,
      company: review.company,
      fiscalYear: review.fiscalYear,
      filingId: review.filingId,
      extractionRunId: review.extractionRunId,
      filingStatus: review.filing.status,
      qualityScore: review.qualityScore,
      sourcePrecedenceAttempted: review.sourcePrecedenceAttempted,
      blockingIssueCount: review.blockingIssueCount,
      blockingRuleCodes: review.blockingRuleCodes,
      blockingIssues: summarizeBlockingReasons(payload),
      pageReferences: review.pageReferences,
      latestActionNote: review.latestActionNote,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      resolvedAt: review.resolvedAt,
      selectedFacts: Array.isArray(payload?.selectedFacts) ? payload.selectedFacts : [],
      classifications: Array.isArray(payload?.classifications) ? payload.classifications : [],
      artifactReferences: Array.isArray(payload?.artifactReferences)
        ? payload.artifactReferences
        : [],
      engineSummary:
        payload?.engineSummary && typeof payload.engineSummary === "object"
          ? payload.engineSummary
          : null,
      comparisonSummary:
        payload?.comparisonSummary && typeof payload.comparisonSummary === "object"
          ? payload.comparisonSummary
          : null,
    };
  });
}

export async function updateAnnualReportReview(
  reviewId: string,
  status: AnnualReportReviewStatus,
  latestActionNote?: string,
) {
  const review = await updateAnnualReportReviewStatus({ reviewId, status, latestActionNote });
  logPipelineEvent("review.updated", {
    reviewId,
    filingId: review.filingId,
    extractionRunId: review.extractionRunId,
    status,
  });
  return review;
}

export async function reprocessAnnualReportFilingById(
  filingId: string,
  options?: { note?: string },
) {
  const filing = await getAnnualReportFilingWithArtifacts(filingId);
  if (!filing) {
    throw new Error(`Fant ikke filing ${filingId}.`);
  }

  if (filing.status === "PROCESSING") {
    return {
      filingId,
      fiscalYear: filing.fiscalYear,
      skipped: true,
      reason: "Filing is already processing",
      published: false,
    };
  }

  const openReviews = filing.reviews.filter((review) =>
    ["PENDING_REVIEW", "REPROCESS_REQUESTED"].includes(review.status),
  );
  for (const review of openReviews) {
    await updateAnnualReportReviewStatus({
      reviewId: review.id,
      status: "REPROCESS_REQUESTED",
      latestActionNote: options?.note ?? "Operator requested reprocessing",
    });
  }

  await updateAnnualReportFiling(filing.id, {
    parserVersionLastTried: ANNUAL_REPORT_PARSER_VERSION,
    lastError: null,
  });
  logPipelineEvent("filing.reprocess_requested", {
    filingId: filing.id,
    fiscalYear: filing.fiscalYear,
    openReviewCount: openReviews.length,
  });
  return processAnnualReportFiling(filing.id, { force: true });
}

export async function reprocessAnnualReportFilingsByCriteria(options?: {
  filingIds?: string[];
  orgNumbers?: string[];
  fiscalYearFrom?: number;
  fiscalYearTo?: number;
  parserVersions?: string[];
  maxQualityScore?: number;
  limit?: number;
  note?: string;
}) {
  const filings = await listAnnualReportFilingsForReprocessing(options);
  const results = [];
  for (const filing of filings) {
    try {
      results.push(
        await reprocessAnnualReportFilingById(filing.id, { note: options?.note }),
      );
    } catch (error) {
      logRecoverableError("annual-report-financials.reprocess", error, {
        filingId: filing.id,
        orgNumber: filing.company.orgNumber,
        fiscalYear: filing.fiscalYear,
      });
      results.push({
        filingId: filing.id,
        fiscalYear: filing.fiscalYear,
        published: false,
        error: error instanceof Error ? error.message : "Unknown reprocessing error",
      });
    }
  }

  return {
    matchedFilings: filings.map((filing) => ({
      filingId: filing.id,
      orgNumber: filing.company.orgNumber,
      fiscalYear: filing.fiscalYear,
      latestParserVersion: filing.extractionRuns[0]?.parserVersion ?? null,
      latestConfidenceScore: filing.extractionRuns[0]?.confidenceScore ?? null,
    })),
    results,
  };
}

export async function inspectCompanyFinancialCoverage(options?: {
  orgNumbers?: string[];
  limit?: number;
  onlyDue?: boolean;
}) {
  const companies = await listCompaniesForFinancialSync({
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
    onlyDue: options?.onlyDue,
  });

  return companies.map((company) => ({
    companyId: company.id,
    orgNumber: company.orgNumber,
    name: company.name,
    coverage: company.financialCoverage,
  }));
}

export async function listNewlyDiscoveredPendingFilings(options?: {
  orgNumbers?: string[];
  limit?: number;
}) {
  const filings = await listPendingAnnualReportFilings({
    orgNumbers: options?.orgNumbers,
    limit: options?.limit,
    statuses: ["DISCOVERED", "DOWNLOADED", "PREFLIGHTED"],
  });

  return filings.map((filing) => ({
    filingId: filing.id,
    orgNumber: filing.company.orgNumber,
    companyName: filing.company.name,
    fiscalYear: filing.fiscalYear,
    status: filing.status,
    discoveredAt: filing.discoveredAt,
    downloadedAt: filing.downloadedAt,
    sourceUrl: filing.sourceUrl,
    sourceDocumentHash: filing.sourceDocumentHash,
  }));
}

export async function getAnnualReportPipelineOverview(options?: {
  orgNumbers?: string[];
  sampleLimit?: number;
}) {
  const sampleLimit = options?.sampleLimit ?? 20;
  const [metrics, reviewQueue, pendingFilings, dueCoverage] = await Promise.all([
    getAnnualReportPipelineMetrics(),
    listAnnualReportReviewQueue({
      statuses: ["PENDING_REVIEW", "REPROCESS_REQUESTED"],
      orgNumbers: options?.orgNumbers,
      limit: sampleLimit,
    }),
    listNewlyDiscoveredPendingFilings({
      orgNumbers: options?.orgNumbers,
      limit: sampleLimit,
    }),
    inspectCompanyFinancialCoverage({
      orgNumbers: options?.orgNumbers,
      limit: sampleLimit,
      onlyDue: true,
    }),
  ]);

  return {
    parserVersion: ANNUAL_REPORT_PARSER_VERSION,
    metrics,
    reviewQueue,
    pendingFilings,
    dueCoverage,
  };
}

export async function getLatestPublishedStatementProvenance(
  orgNumber: string,
  fiscalYear?: number,
) {
  const record = await getPublishedFinancialsForCompany(orgNumber);
  if (!record) {
    throw new Error(`Fant ikke virksomhet ${orgNumber}.`);
  }

  // A company-year may have both konsern and selskap statements. Prefer the
  // consolidated one as the headline provenance.
  const consolidatedFirst = [...record.financialStatements].sort(
    (left, right) =>
      right.fiscalYear - left.fiscalYear ||
      (right.statementScope === "CONSOLIDATED" ? 1 : 0) -
        (left.statementScope === "CONSOLIDATED" ? 1 : 0),
  );
  const statement =
    fiscalYear === undefined
      ? consolidatedFirst[0] ?? null
      : consolidatedFirst.find((item) => item.fiscalYear === fiscalYear) ?? null;

  if (!statement) {
    return null;
  }

  return {
    company: {
      id: record.id,
      orgNumber: record.orgNumber,
      name: record.name,
    },
    fiscalYear: statement.fiscalYear,
    statementId: statement.id,
    sourceFilingId: statement.sourceFilingId,
    sourceExtractionRunId: statement.sourceExtractionRunId,
    qualityStatus: statement.qualityStatus,
    qualityScore: statement.qualityScore,
    sourcePrecedence: statement.sourcePrecedence,
    unitScale: statement.unitScale,
    publishedAt: statement.publishedAt,
    normalizedAt: statement.normalizedAt,
  };
}

export async function getPublishedAnnualReportFinancials(orgNumber: string): Promise<{ statements: NormalizedFinancialStatement[]; allScopeStatements: NormalizedFinancialStatement[]; documents: NormalizedFinancialDocument[]; availability: DataAvailability }> {
  const record = await getPublishedFinancialsForCompany(orgNumber);
  if (!record) return { statements: [], allScopeStatements: [], documents: [], availability: { available: false, sourceSystem: "BRREG", message: "Virksomheten finnes ikke i lokal Fjord Insight-lagring ennå." } };
  // allScopeStatements keeps both konsern and selskap rows (for the toggle);
  // statements is deduped to one headline statement per year so callers that
  // expect one-per-year (KPIs, distress, trends) are not double-counted.
  const allScopeStatements = mapPublishedStatements(record.financialStatements);
  const statements = getHeadlineFinancialStatements(allScopeStatements);
  const documents = mapPublishedDocuments(record.annualReportFilings);
  return { statements, allScopeStatements, documents, availability: buildPublicAvailability(statements) };
}

export async function syncCompanyAnnualReportFinancials(orgNumber: string) {
  await discoverAnnualReportFilingsForCompany(orgNumber);
  await processPendingAnnualReportFilings({ orgNumbers: [orgNumber] });
  return getPublishedAnnualReportFinancials(orgNumber);
}

export async function validatePublishedAnnualReportFinancials(options?: { orgNumbers?: string[] }) {
  const companies = await listCompaniesForFinancialSync({ orgNumbers: options?.orgNumbers });
  const results: Array<{ orgNumber: string; fiscalYear: number; balanced: boolean }> = [];
  for (const company of companies) {
    const published = await getPublishedFinancialsForCompany(company.orgNumber);
    for (const statement of published?.financialStatements ?? []) {
      const payload = statement.rawPayload as Record<string, any>;
      const normalized = mapBrregFinancialStatement(payload, company.orgNumber);
      const validation = validateCanonicalFacts(buildPublishedCanonicalFacts(payload, statement.fiscalYear));
      results.push({ orgNumber: company.orgNumber, fiscalYear: statement.fiscalYear, balanced: !validation.issues.some((issue) => issue.severity === "ERROR") && normalized.assets !== null && normalized.assets !== undefined && normalized.equity !== null && normalized.equity !== undefined });
    }
  }
  return results;
}
