import { z } from "zod";

import { extractOcrPagesWithDiagnostics } from "@/integrations/brreg/annual-report-financials/ocr";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import {
  AnnualReportOcrDiagnostics,
  AnnualReportParsedInputPage,
} from "@/integrations/brreg/annual-report-financials/types";
import {
  AnnualReportBenchmarkCase,
  AnnualReportBenchmarkCaseResult,
  AnnualReportBenchmarkRun,
  BenchmarkComparisonAssessment,
  BenchmarkDivergenceSummary,
  BenchmarkPipelineResult,
  assessComparison,
  buildDivergenceSummary,
  runPipelineFromPages,
  summarizeAnnualReportBenchmarkRun,
} from "@/server/benchmarking/annual-report-benchmark";
import { buildOpenDataLoaderComparisonSummary } from "@/server/document-understanding/opendataloader-comparison";
import { chooseOpenDataLoaderRoute, resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import { inspectOpenDataLoaderHybridHealth } from "@/server/document-understanding/opendataloader-hybrid-health";
import { assertOpenDataLoaderRuntimeReady, inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import {
  getAnnualReportFilingWithArtifacts,
  listAnnualReportFilingsForShadowSelection,
} from "@/server/persistence/annual-report-ingestion-repository";
import {
  OpenDataLoaderNormalizedOutputSummary,
  OpenDataLoaderParseDiagnostics,
  OpenDataLoaderRawOutputSummary,
} from "@/server/document-understanding/opendataloader-types";

const shadowBatchManifestEntrySchema = z.object({
  filingId: z.string().min(1),
  orgNumber: z.string().min(1).optional(),
  fiscalYear: z.number().int().optional(),
  label: z.string().min(1).optional(),
  tagHints: z.array(z.string().min(1)).default([]),
  notes: z.string().min(1).optional(),
});

const shadowBatchManifestSchema = z.object({
  name: z.string().min(1),
  generatedAt: z.string().optional(),
  notes: z.string().optional(),
  selection: z.record(z.unknown()).optional(),
  entries: z.array(shadowBatchManifestEntrySchema).min(1),
});

export type AnnualReportShadowBatchManifestEntry = z.infer<
  typeof shadowBatchManifestEntrySchema
>;
export type AnnualReportShadowBatchManifest = z.infer<
  typeof shadowBatchManifestSchema
>;

export type AnnualReportShadowBatchEvidenceQuality =
  | "real-filing-live-local"
  | "real-filing-live-hybrid"
  | "runtime-unavailable"
  | "missing-pdf-artifact";

export type AnnualReportShadowBatchSelectionOptions = {
  name?: string;
  filingIds?: string[];
  orgNumbers?: string[];
  statuses?: string[];
  fiscalYearFrom?: number;
  fiscalYearTo?: number;
  reviewStatuses?: string[];
  ruleCodes?: string[];
  onlyLatest?: boolean;
  requirePdfArtifact?: boolean;
  desiredTags?: string[];
  limit?: number;
};

export type AnnualReportShadowBatchCaseResult = {
  caseId: string;
  filingId: string;
  orgNumber: string | null;
  companyName: string | null;
  fiscalYear: number;
  name: string;
  documentTags: string[];
  tagHints: string[];
  notes?: string;
  status: "completed" | "error" | "skipped";
  evidenceKind: AnnualReportBenchmarkCaseResult["evidenceKind"];
  evidenceQuality: AnnualReportShadowBatchEvidenceQuality;
  routeDecision?: {
    executionMode: "local" | "hybrid";
    hybridMode?: "auto" | "full" | null;
    requiresOcr: boolean;
    reasonCode: string;
    reason: string;
  } | null;
  legacyOcrDiagnostics?: AnnualReportOcrDiagnostics | null;
  errors: string[];
  knownEvidenceLimitations: string[];
  legacy?: BenchmarkPipelineResult;
  openDataLoader?: BenchmarkPipelineResult & {
    routeReason?: string | null;
    usablePageStructure?: boolean;
  };
  openDataLoaderDiagnostics?: {
    rawOutput: OpenDataLoaderRawOutputSummary | null;
    normalizedOutput: OpenDataLoaderNormalizedOutputSummary | null;
    annualReportPages: {
      pageCount: number;
      totalLines: number;
      totalTables: number;
      pages: Array<{
        pageNumber: number;
        lineCount: number;
        tableCount: number;
        textLength: number;
        blockKindCounts: Record<string, number>;
      }>;
    } | null;
    firstFailingStage:
      | "none"
      | "hybrid_output"
      | "normalization"
      | "annual_report_page_conversion"
      | "page_classification";
    rootCauseClassification:
      | "none"
      | "hybrid_output_weakness"
      | "normalization_loss"
      | "annual_report_page_conversion_loss"
      | "page_classification_weakness";
    firstFailingReason: string;
    statementLikeSignalsPresent: boolean;
    imageOnlyRawOutput: boolean;
  } | null;
  comparison?: AnnualReportBenchmarkCaseResult["comparison"];
  comparisonAssessment?: BenchmarkComparisonAssessment | null;
  divergenceSummary?: BenchmarkDivergenceSummary | null;
};

export type AnnualReportShadowBatchRun = {
  generatedAt: string;
  manifest: AnnualReportShadowBatchManifest;
  runtimeEnvironment: AnnualReportBenchmarkRun["runtimeEnvironment"];
  cases: AnnualReportShadowBatchCaseResult[];
  summary: AnnualReportBenchmarkRun["summary"] & {
    totalRealFilings: number;
    evidenceQualityCounts: Record<AnnualReportShadowBatchEvidenceQuality, number>;
    classesWithZeroLiveEvidence: string[];
    liveOcrOrScannedCoverage: {
      totalCases: number;
      liveCases: number;
      runtimeUnavailableCases: number;
      publishMismatchCases: number;
      materialDisagreementCases: number;
      safeManualReviewCases: number;
    };
  };
};

export const BASELINE_OCR_ORG_NUMBER = "918298037";
export const BASELINE_OCR_FISCAL_YEARS = [2024, 2023, 2022, 2021, 2020] as const;

const SHADOW_BATCH_DOCUMENT_TAGS = [
  "digital_simple",
  "digital_note_heavy",
  "multi_page_balance",
  "continuation_complex",
  "supplementary_present",
  "unit_scale_sensitive",
  "scan_or_ocr",
  "ocr_token_noise",
  "degraded_ambiguous",
  "formatting_edge",
  "manual_review_expected",
  "column_swap",
  "live_local",
  "live_hybrid",
] as const;

const artifactStorage = new LocalAnnualReportArtifactStorage();

function dedupeTags(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort();
}

function extractRuleCodes(payload: unknown) {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((value) => (typeof value === "string" ? value : null))
    .filter((value): value is string => Boolean(value));
}

function inferTagHintsFromStoredFiling(filing: Awaited<ReturnType<typeof listAnnualReportFilingsForShadowSelection>>[number]) {
  const tags = new Set<string>();
  const latestRun = filing.extractionRuns[0];
  const latestReview = filing.reviews[0];
  const runSummary =
    latestRun?.rawSummary && typeof latestRun.rawSummary === "object"
      ? (latestRun.rawSummary as Record<string, any>)
      : null;
  const classifications = Array.isArray(runSummary?.classifications)
    ? (runSummary?.classifications as Array<Record<string, any>>)
    : [];

  if ((latestRun?.documentEngineMode ?? null) === "hybrid") {
    tags.add("scan_or_ocr");
    tags.add("live_hybrid");
  }
  if ((latestRun?.documentEngineMode ?? null) === "local") {
    tags.add("live_local");
  }
  if ((latestRun?.ocrEngine ?? null) === "TESSERACT") {
    tags.add("scan_or_ocr");
    tags.add("ocr_token_noise");
  }

  if (
    classifications.some(
      (classification) =>
        classification.type === "STATUTORY_BALANCE_CONTINUATION",
    )
  ) {
    tags.add("continuation_complex");
    tags.add("multi_page_balance");
  }

  if (
    classifications.some((classification) =>
      ["SUPPLEMENTARY_INCOME", "SUPPLEMENTARY_BALANCE"].includes(
        String(classification.type),
      ),
    )
  ) {
    tags.add("supplementary_present");
  }

  if (
    classifications.some(
      (classification) =>
        classification.type === "NOTE" || Number(classification.unitScale) === 1000,
    )
  ) {
    tags.add("digital_note_heavy");
    tags.add("unit_scale_sensitive");
  }

  const reviewRuleCodes = dedupeTags([
    ...extractRuleCodes(latestReview?.blockingRuleCodes ?? []),
    ...extractRuleCodes(
      Array.isArray(runSummary?.issues)
        ? runSummary?.issues.map((issue: Record<string, any>) => issue.ruleCode)
        : [],
    ),
  ]);

  if (reviewRuleCodes.some((code) => code.includes("UNIT") || code.includes("SCALE"))) {
    tags.add("unit_scale_sensitive");
  }
  if (reviewRuleCodes.some((code) => code.includes("COLUMN_SWAP"))) {
    tags.add("column_swap");
    tags.add("degraded_ambiguous");
  }
  if (
    reviewRuleCodes.some((code) =>
      [
        "STATEMENT_TABLE_LAYOUT_WEAK",
        "CLASSIFICATION_UNCERTAIN",
        "UNIT_SCALE_UNCERTAIN",
      ].includes(code),
    )
  ) {
    tags.add("degraded_ambiguous");
  }
  if (latestReview?.status === "PENDING_REVIEW") {
    tags.add("manual_review_expected");
  }

  if (tags.size === 0) {
    tags.add("digital_simple");
  }

  return dedupeTags(tags);
}

export function parseAnnualReportShadowBatchManifest(raw: unknown) {
  return shadowBatchManifestSchema.parse(raw);
}

export async function selectAnnualReportShadowBatchManifest(
  options: AnnualReportShadowBatchSelectionOptions = {},
) {
  const filings = await listAnnualReportFilingsForShadowSelection({
    filingIds: options.filingIds,
    orgNumbers: options.orgNumbers,
    statuses: options.statuses as any,
    fiscalYearFrom: options.fiscalYearFrom,
    fiscalYearTo: options.fiscalYearTo,
    reviewStatuses: options.reviewStatuses as any,
    ruleCodes: options.ruleCodes,
    onlyLatest: options.onlyLatest ?? true,
    requirePdfArtifact: options.requirePdfArtifact ?? true,
    limit: options.limit ?? 20,
  });

  const desiredTags = new Set(options.desiredTags ?? []);
  const entries = filings
    .map((filing) => {
      const tagHints = inferTagHintsFromStoredFiling(filing);
      return {
        filingId: filing.id,
        orgNumber: filing.company.orgNumber,
        fiscalYear: filing.fiscalYear,
        label: `${filing.company.orgNumber} ${filing.fiscalYear}`,
        tagHints,
        notes:
          filing.reviews[0]?.latestActionNote ??
          filing.lastError ??
          undefined,
      } satisfies AnnualReportShadowBatchManifestEntry;
    })
    .filter((entry) =>
      desiredTags.size === 0
        ? true
        : entry.tagHints.some((tag) => desiredTags.has(tag)),
    );

  return {
    name:
      options.name ??
      `shadow-batch-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    selection: {
      filingIds: options.filingIds ?? [],
      orgNumbers: options.orgNumbers ?? [],
      statuses: options.statuses ?? [],
      fiscalYearFrom: options.fiscalYearFrom ?? null,
      fiscalYearTo: options.fiscalYearTo ?? null,
      reviewStatuses: options.reviewStatuses ?? [],
      ruleCodes: options.ruleCodes ?? [],
      onlyLatest: options.onlyLatest ?? true,
      requirePdfArtifact: options.requirePdfArtifact ?? true,
      desiredTags: options.desiredTags ?? [],
      limit: options.limit ?? 20,
    },
    entries,
  } satisfies AnnualReportShadowBatchManifest;
}

export async function buildBaselineAnnualReportShadowBatchManifest(input?: {
  orgNumber?: string;
  fiscalYears?: number[];
  name?: string;
}) {
  const orgNumber = input?.orgNumber ?? BASELINE_OCR_ORG_NUMBER;
  const fiscalYears = [...(input?.fiscalYears ?? [...BASELINE_OCR_FISCAL_YEARS])]
    .filter((year) => Number.isInteger(year))
    .sort((left, right) => right - left);
  if (fiscalYears.length === 0) {
    throw new Error("Baseline shadow batch krever minst ett regnskapsar.");
  }

  const manifest = await selectAnnualReportShadowBatchManifest({
    name:
      input?.name ??
      `baseline-shadow-batch-${orgNumber}-${fiscalYears.at(-1)}-${fiscalYears[0]}`,
    orgNumbers: [orgNumber],
    fiscalYearFrom: fiscalYears.at(-1),
    fiscalYearTo: fiscalYears[0],
    onlyLatest: true,
    requirePdfArtifact: true,
    limit: Math.max(fiscalYears.length, 20),
  });

  const allowedYears = new Set(fiscalYears);
  const entries = manifest.entries
    .filter(
      (entry) =>
        entry.orgNumber === orgNumber &&
        typeof entry.fiscalYear === "number" &&
        allowedYears.has(entry.fiscalYear),
    )
    .sort((left, right) => (right.fiscalYear ?? 0) - (left.fiscalYear ?? 0))
    .map((entry) => ({
      ...entry,
      tagHints: dedupeTags([
        ...entry.tagHints,
        "scan_or_ocr",
        "manual_review_expected",
      ]),
      notes:
        entry.notes ??
        "Baseline OCR/scanned annual-report filing selected for recurring shadow evaluation.",
    }));

  return {
    ...manifest,
    name:
      input?.name ??
      `baseline-shadow-batch-${orgNumber}-${fiscalYears.at(-1)}-${fiscalYears[0]}`,
    selection: {
      ...(manifest.selection ?? {}),
      baselineOrgNumber: orgNumber,
      baselineFiscalYears: fiscalYears,
      baselineClass: "scan_or_ocr",
    },
    entries,
  } satisfies AnnualReportShadowBatchManifest;
}

function toBenchmarkCaseResult(
  result: AnnualReportShadowBatchCaseResult,
): AnnualReportBenchmarkCaseResult {
  return {
    caseId: result.caseId,
    name: result.name,
    fiscalYear: result.fiscalYear,
    documentTags: result.documentTags,
    mode: "differential",
    status: result.status,
    errors: result.errors,
    evidenceKind: result.evidenceKind,
    knownEvidenceLimitations: result.knownEvidenceLimitations,
    legacy: result.legacy,
    openDataLoader: result.openDataLoader,
    comparison: result.comparison ?? null,
    comparisonAssessment: result.comparisonAssessment ?? null,
    divergenceSummary: result.divergenceSummary ?? null,
  };
}

function summarizeAnnualReportPageStructure(pages: AnnualReportParsedInputPage[]) {
  return {
    pageCount: pages.length,
    totalLines: pages.reduce((sum, page) => sum + page.lines.length, 0),
    totalTables: pages.reduce(
      (sum, page) => sum + ("tables" in page && Array.isArray(page.tables) ? page.tables.length : 0),
      0,
    ),
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      lineCount: page.lines.length,
      tableCount: "tables" in page && Array.isArray(page.tables) ? page.tables.length : 0,
      textLength: page.text.length,
      blockKindCounts:
        "blocks" in page && Array.isArray(page.blocks)
          ? page.blocks.reduce<Record<string, number>>((counts, block) => {
              counts[block.kind] = (counts[block.kind] ?? 0) + 1;
              return counts;
            }, {})
          : {},
    })),
  };
}

function buildOpenDataLoaderStructureDiagnostics(input: {
  diagnostics?: OpenDataLoaderParseDiagnostics;
  parsedPages?: AnnualReportParsedInputPage[];
  openDataLoader?: BenchmarkPipelineResult;
}) {
  const rawOutput = input.diagnostics?.rawOutput ?? null;
  const normalizedOutput = input.diagnostics?.normalizedOutput ?? null;
  const annualReportPages = input.parsedPages
    ? summarizeAnnualReportPageStructure(input.parsedPages)
    : null;
  const imageOnlyRawOutput =
    Boolean(rawOutput) &&
    rawOutput!.elementCount > 0 &&
    Object.keys(rawOutput!.elementTypeCounts).length > 0 &&
    Object.keys(rawOutput!.elementTypeCounts).every((type) => ["image", "picture"].includes(type)) &&
    rawOutput!.textElementCount === 0 &&
    rawOutput!.tableCount === 0;
  const statementLikeSignalsPresent = Boolean(
    input.openDataLoader?.classifications.some((classification) =>
      [
        "STATUTORY_INCOME",
        "STATUTORY_BALANCE",
        "STATUTORY_BALANCE_CONTINUATION",
        "SUPPLEMENTARY_INCOME",
        "SUPPLEMENTARY_BALANCE",
        "NOTE",
      ].includes(classification.type),
    ) ||
      input.openDataLoader?.classificationDiagnostics?.some(
        (diagnostic) =>
          diagnostic.tableLike ||
          diagnostic.numericRowCount >= 3 ||
          diagnostic.yearHeaderYears.length >= 2,
      ),
  );

  if (rawOutput && rawOutput.elementCount === 0) {
    return {
      rawOutput,
      normalizedOutput,
      annualReportPages,
      firstFailingStage: "hybrid_output" as const,
      rootCauseClassification: "hybrid_output_weakness" as const,
      firstFailingReason: "Hybrid returned zero document elements, so no annual-report structure could be derived.",
      statementLikeSignalsPresent,
      imageOnlyRawOutput: false,
    };
  }

  if (imageOnlyRawOutput) {
    return {
      rawOutput,
      normalizedOutput,
      annualReportPages,
      firstFailingStage: "hybrid_output" as const,
      rootCauseClassification: "hybrid_output_weakness" as const,
      firstFailingReason:
        "Hybrid returned only image blocks without text or table structure, so downstream statement detection had no usable signals.",
      statementLikeSignalsPresent,
      imageOnlyRawOutput,
    };
  }

  if (normalizedOutput && normalizedOutput.pageCount === 0) {
    return {
      rawOutput,
      normalizedOutput,
      annualReportPages,
      firstFailingStage: "normalization" as const,
      rootCauseClassification: "normalization_loss" as const,
      firstFailingReason: "Raw hybrid output existed, but normalization produced zero pages.",
      statementLikeSignalsPresent,
      imageOnlyRawOutput: false,
    };
  }

  if (annualReportPages && annualReportPages.pageCount === 0) {
    return {
      rawOutput,
      normalizedOutput,
      annualReportPages,
      firstFailingStage: "annual_report_page_conversion" as const,
      rootCauseClassification: "annual_report_page_conversion_loss" as const,
      firstFailingReason: "Normalized pages existed, but none survived annual-report page conversion.",
      statementLikeSignalsPresent,
      imageOnlyRawOutput: false,
    };
  }

  if (
    input.openDataLoader &&
    !statementLikeSignalsPresent &&
    input.openDataLoader.classifications.length > 0 &&
    input.openDataLoader.classifications.every((classification) => classification.type === "COVER")
  ) {
    return {
      rawOutput,
      normalizedOutput,
      annualReportPages,
      firstFailingStage: "page_classification" as const,
      rootCauseClassification: "page_classification_weakness" as const,
      firstFailingReason:
        "Annual-report pages survived, but none retained enough statement-like signals to classify beyond COVER.",
      statementLikeSignalsPresent,
      imageOnlyRawOutput: false,
    };
  }

  return {
    rawOutput,
    normalizedOutput,
    annualReportPages,
    firstFailingStage: "none" as const,
    rootCauseClassification: "none" as const,
    firstFailingReason: "No earlier structure-stage failure was detected from stored ODL diagnostics.",
    statementLikeSignalsPresent,
    imageOnlyRawOutput: false,
  };
}

function inferRuntimeTags(input: {
  tagHints: string[];
  preflight: Awaited<ReturnType<typeof preflightAnnualReportDocument>>;
  legacyPages: AnnualReportParsedInputPage[];
  legacy: BenchmarkPipelineResult;
  openDataLoaderRoute?: { executionMode: "local" | "hybrid" } | null;
}) {
  const tags = new Set<string>(input.tagHints);
  const normalizedText = normalizeNorwegianText(
    input.legacyPages.map((page) => page.text).join("\n"),
  );

  if (input.preflight.hasReliableTextLayer) {
    tags.add("digital_simple");
  } else {
    tags.add("scan_or_ocr");
  }

  if (input.openDataLoaderRoute?.executionMode === "local") {
    tags.add("live_local");
  }
  if (input.openDataLoaderRoute?.executionMode === "hybrid") {
    tags.add("live_hybrid");
    tags.add("scan_or_ocr");
  }

  if (
    input.legacy.classifications.some(
      (classification) =>
        classification.type === "STATUTORY_BALANCE_CONTINUATION",
    )
  ) {
    tags.add("continuation_complex");
    tags.add("multi_page_balance");
  }

  if (
    input.legacy.classifications.some((classification) =>
      ["SUPPLEMENTARY_INCOME", "SUPPLEMENTARY_BALANCE"].includes(
        classification.type,
      ),
    )
  ) {
    tags.add("supplementary_present");
  }

  if (input.legacy.classifications.some((classification) => classification.type === "NOTE")) {
    tags.add("digital_note_heavy");
  }

  if (
    input.legacy.classifications.some(
      (classification) =>
        classification.unitScale === 1000 || classification.unitScale === null,
    ) ||
    input.legacy.issueCodes.some(
      (ruleCode) => ruleCode.includes("UNIT") || ruleCode.includes("SCALE"),
    )
  ) {
    tags.add("unit_scale_sensitive");
  }

  if (
    /\([0-9\s.]+?\)/.test(normalizedText) ||
    /tnok|nok 1000|nok 1 000|nok 1\.000/.test(normalizedText)
  ) {
    tags.add("formatting_edge");
  }

  if (
    /[a-zæøå]{4,}\d{2,}/.test(normalizedText) ||
    /note\d{1,2}/.test(normalizedText)
  ) {
    tags.add("ocr_token_noise");
  }

  if (
    input.legacy.blockingRuleCodes.length > 0 ||
    input.legacy.issueCodes.includes("CLASSIFICATION_UNCERTAIN") ||
    input.legacy.issueCodes.includes("UNIT_SCALE_UNCERTAIN")
  ) {
    tags.add("degraded_ambiguous");
  }

  if (!input.legacy.shouldPublish) {
    tags.add("manual_review_expected");
  }

  return dedupeTags(tags).filter((tag) =>
    SHADOW_BATCH_DOCUMENT_TAGS.includes(tag as (typeof SHADOW_BATCH_DOCUMENT_TAGS)[number]),
  );
}

async function runShadowCase(
  entry: AnnualReportShadowBatchManifestEntry,
): Promise<AnnualReportShadowBatchCaseResult> {
  const filing = await getAnnualReportFilingWithArtifacts(entry.filingId);
  if (!filing) {
    return {
      caseId: entry.filingId,
      filingId: entry.filingId,
      orgNumber: entry.orgNumber ?? null,
      companyName: null,
      fiscalYear: entry.fiscalYear ?? 0,
      name: entry.label ?? entry.filingId,
      documentTags: dedupeTags(entry.tagHints ?? []),
      tagHints: dedupeTags(entry.tagHints ?? []),
      notes: entry.notes,
      status: "error",
      evidenceKind: "legacy-only",
      evidenceQuality: "missing-pdf-artifact",
      errors: [`Fant ikke filing ${entry.filingId}.`],
      knownEvidenceLimitations: [],
    };
  }

  const pdfArtifact =
    filing.artifacts.find((artifact) => artifact.artifactType === "PDF") ?? null;
  if (!pdfArtifact) {
    return {
      caseId: filing.id,
      filingId: filing.id,
      orgNumber: filing.company.orgNumber,
      companyName: filing.company.name,
      fiscalYear: filing.fiscalYear,
      name: entry.label ?? `${filing.company.orgNumber} ${filing.fiscalYear}`,
      documentTags: dedupeTags(entry.tagHints ?? []),
      tagHints: dedupeTags(entry.tagHints ?? []),
      notes: entry.notes,
      status: "skipped",
      evidenceKind: "legacy-only",
      evidenceQuality: "missing-pdf-artifact",
      errors: ["Filing mangler lagret PDF-artifact for shadow-evaluering."],
      knownEvidenceLimitations: [],
    };
  }

  const pdfBuffer = await artifactStorage.getArtifactBuffer(pdfArtifact.storageKey);
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  const legacyOcrResult = preflight.hasReliableTextLayer
    ? null
    : await extractOcrPagesWithDiagnostics(pdfBuffer);
  const legacyPages = preflight.hasReliableTextLayer
    ? preflight.parsedPages
    : legacyOcrResult.pages;
  const legacy = runPipelineFromPages({
    fiscalYear: filing.fiscalYear,
    pages: legacyPages,
    engine: "LEGACY",
    mode: "legacy",
    runtimeMs: 0,
    executionSource: preflight.hasReliableTextLayer ? "document_fixture" : "ocr_fixture",
    artifactGeneration: {
      attempted: false,
      success: null,
      artifactKinds: [],
      detail: preflight.hasReliableTextLayer
        ? "real filing text layer"
        : "real filing OCR",
    },
  });

  const resolvedConfig = {
    ...resolveOpenDataLoaderConfig(process.env),
    enabled: true,
    mode: (process.env.OPENDATALOADER_MODE?.trim().toLowerCase() as
      | "local"
      | "hybrid"
      | "auto"
      | undefined) ?? "auto",
  };
  const route = chooseOpenDataLoaderRoute({
    config: resolvedConfig,
    preflight,
  });

  const baseResult = {
    caseId: filing.id,
    filingId: filing.id,
    orgNumber: filing.company.orgNumber,
    companyName: filing.company.name,
    fiscalYear: filing.fiscalYear,
    name: entry.label ?? `${filing.company.orgNumber} ${filing.fiscalYear}`,
    tagHints: dedupeTags(entry.tagHints ?? []),
    notes: entry.notes,
    routeDecision: {
      executionMode: route.executionMode,
      hybridMode: route.hybridMode,
      requiresOcr: route.requiresOcr,
      reasonCode: route.reasonCode,
      reason: route.reason,
    },
    legacyOcrDiagnostics: legacyOcrResult?.diagnostics ?? null,
  };

  try {
    await assertOpenDataLoaderRuntimeReady({
      config: resolvedConfig,
      route,
    });
  } catch (error) {
    const documentTags = inferRuntimeTags({
      tagHints: entry.tagHints ?? [],
      preflight,
      legacyPages,
      legacy,
      openDataLoaderRoute: route,
    });

    return {
      ...baseResult,
      documentTags,
      status: "skipped",
      evidenceKind: "legacy-only",
      evidenceQuality: "runtime-unavailable",
      errors: [error instanceof Error ? error.message : "OpenDataLoader runtime not ready."],
      knownEvidenceLimitations: [
        route.executionMode === "hybrid"
          ? `Real hybrid/OCR evidence could not be collected because hybrid runtime is not configured. Route ${route.reasonCode}: ${route.reason}`
          : "Real local OpenDataLoader evidence could not be collected because runtime readiness failed.",
      ],
      legacy,
    };
  }

  let openDataLoaderResult;
  try {
    openDataLoaderResult = await parseAnnualReportPdfWithOpenDataLoader({
      pdfBuffer,
      sourceFilename: `${filing.company.orgNumber}-${filing.fiscalYear}.pdf`,
      preflight,
      config: resolvedConfig,
    });
  } catch (error) {
    const documentTags = inferRuntimeTags({
      tagHints: entry.tagHints ?? [],
      preflight,
      legacyPages,
      legacy,
      openDataLoaderRoute: route,
    });
    const diagnostics =
      error && typeof error === "object" && "diagnostics" in error
        ? (error as { diagnostics?: { failureStage?: string; failureReason?: string } }).diagnostics
        : null;
    const failureStage = diagnostics?.failureStage ?? null;
    const failureReason =
      diagnostics?.failureReason ??
      (error instanceof Error ? error.message : "OpenDataLoader parse failed.");
    const isRuntimeFailure =
      failureStage === "opendataloader-invocation" ||
      failureStage === "raw-output-loading" ||
      failureStage === null;

    const openDataLoaderDiagnostics = buildOpenDataLoaderStructureDiagnostics({
      diagnostics: error && typeof error === "object" && "diagnostics" in error
        ? (error as { diagnostics?: OpenDataLoaderParseDiagnostics }).diagnostics
        : undefined,
    });

    return {
      ...baseResult,
      documentTags,
      status: isRuntimeFailure ? "skipped" : "error",
      evidenceKind:
        route.executionMode === "hybrid" ? "live-hybrid-odl" : "live-local-odl",
      evidenceQuality:
        isRuntimeFailure
          ? "runtime-unavailable"
          : route.executionMode === "hybrid"
            ? "real-filing-live-hybrid"
            : "real-filing-live-local",
      errors: [failureReason],
      knownEvidenceLimitations: [
        isRuntimeFailure
          ? `OpenDataLoader ${route.executionMode} runtime failed before a comparable shadow result was produced. Route ${route.reasonCode}: ${route.reason}`
          : `OpenDataLoader produced an extraction failure at stage ${failureStage ?? "unknown"}; treat this as extraction quality, not publish evidence.`,
      ],
      legacy,
      openDataLoaderDiagnostics,
    };
  }
  const parsedPages = openDataLoaderResult.annualReportPages;
  const openDataLoader = runPipelineFromPages({
    fiscalYear: filing.fiscalYear,
    pages: parsedPages,
    engine: "OPENDATALOADER",
    mode: openDataLoaderResult.routing.executionMode,
    runtimeMs: openDataLoaderResult.durationMs,
    executionSource: "live_pdf",
    artifactGeneration: {
      attempted: true,
      success: true,
      artifactKinds: [
        "DOCUMENT_JSON",
        ...(openDataLoaderResult.artifacts.markdown ? ["DOCUMENT_MARKDOWN"] : []),
        ...(openDataLoaderResult.artifacts.annotatedPdf ? ["ANNOTATED_PDF"] : []),
      ],
      detail: "real filing live ODL parse",
    },
  });

  const benchmarkCase: AnnualReportBenchmarkCase = {
    id: filing.id,
    name: entry.label ?? `${filing.company.orgNumber} ${filing.fiscalYear}`,
    fiscalYear: filing.fiscalYear,
    mode: "differential",
    documentTags: entry.tagHints ?? [],
    notes: entry.notes,
    knownEvidenceLimitations: [],
    legacySource: preflight.hasReliableTextLayer
      ? { kind: "inline_document_pages", pages: [] }
      : { kind: "ocr_regression", name: "real-filing-shadow" },
  };

  const comparison = buildOpenDataLoaderComparisonSummary({
    primary: legacy.snapshot,
    shadow: openDataLoader.snapshot,
  });
  const comparisonAssessment = assessComparison(benchmarkCase, comparison);
  const divergenceSummary = buildDivergenceSummary({
    legacy,
    openDataLoader,
  });
  const documentTags = inferRuntimeTags({
    tagHints: entry.tagHints ?? [],
    preflight,
    legacyPages,
    legacy,
    openDataLoaderRoute: route,
  });
  const openDataLoaderDiagnostics = buildOpenDataLoaderStructureDiagnostics({
    diagnostics: openDataLoaderResult.diagnostics,
    parsedPages,
    openDataLoader,
  });

  return {
    ...baseResult,
    documentTags,
    status: "completed",
    evidenceKind:
      route.executionMode === "hybrid" ? "live-hybrid-odl" : "live-local-odl",
    evidenceQuality:
      route.executionMode === "hybrid"
        ? "real-filing-live-hybrid"
        : "real-filing-live-local",
    errors: [],
    knownEvidenceLimitations: [],
    legacy,
    openDataLoader: {
      ...openDataLoader,
      routeReason: openDataLoaderResult.routing.reason,
      usablePageStructure: parsedPages.some((page) => page.lines.length > 0),
    },
    openDataLoaderDiagnostics,
    comparison,
    comparisonAssessment,
    divergenceSummary,
  };
}

export function summarizeShadowBatch(
  manifest: AnnualReportShadowBatchManifest,
  runtimeEnvironment: AnnualReportBenchmarkRun["runtimeEnvironment"],
  cases: AnnualReportShadowBatchCaseResult[],
) {
  const benchmarkCases = cases.map(toBenchmarkCaseResult);
  const benchmarkSummary = summarizeAnnualReportBenchmarkRun({
    cases: benchmarkCases,
    runtimeEnvironment,
  });
  const evidenceQualityCounts = {
    "real-filing-live-local": cases.filter(
      (item) => item.evidenceQuality === "real-filing-live-local",
    ).length,
    "real-filing-live-hybrid": cases.filter(
      (item) => item.evidenceQuality === "real-filing-live-hybrid",
    ).length,
    "runtime-unavailable": cases.filter(
      (item) => item.evidenceQuality === "runtime-unavailable",
    ).length,
    "missing-pdf-artifact": cases.filter(
      (item) => item.evidenceQuality === "missing-pdf-artifact",
    ).length,
  } satisfies Record<AnnualReportShadowBatchEvidenceQuality, number>;

  const observedTags = dedupeTags(cases.flatMap((item) => item.documentTags));
  const classesWithZeroLiveEvidence = observedTags
    .filter(
      (tag) =>
        !cases.some(
          (item) =>
            item.documentTags.includes(tag) &&
            ["real-filing-live-local", "real-filing-live-hybrid"].includes(
              item.evidenceQuality,
            ),
        ),
    )
    .sort();

  const ocrCases = cases.filter((item) =>
    item.documentTags.some((tag) =>
      ["scan_or_ocr", "ocr_token_noise", "degraded_ambiguous"].includes(tag),
    ),
  );

  return {
    ...benchmarkSummary,
    totalRealFilings: manifest.entries.length,
    evidenceQualityCounts,
    classesWithZeroLiveEvidence,
    liveOcrOrScannedCoverage: {
      totalCases: ocrCases.length,
      liveCases: ocrCases.filter((item) =>
        ["real-filing-live-local", "real-filing-live-hybrid"].includes(item.evidenceQuality),
      ).length,
      runtimeUnavailableCases: ocrCases.filter(
        (item) => item.evidenceQuality === "runtime-unavailable",
      ).length,
      publishMismatchCases: ocrCases.filter(
        (item) => item.comparison?.publishDecisionMismatch,
      ).length,
      materialDisagreementCases: ocrCases.filter(
        (item) => item.comparison?.materialDisagreement,
      ).length,
      safeManualReviewCases: ocrCases.filter(
        (item) =>
          item.legacy?.shouldPublish === false &&
          item.openDataLoader?.shouldPublish === false,
      ).length,
    },
  };
}

export async function runAnnualReportShadowBatch(
  manifestInput: AnnualReportShadowBatchManifest,
): Promise<AnnualReportShadowBatchRun> {
  const manifest = parseAnnualReportShadowBatchManifest(manifestInput);
  const config = resolveOpenDataLoaderConfig(process.env);
  const [runtime, hybridHealth] = await Promise.all([
    inspectOpenDataLoaderRuntime(config),
    inspectOpenDataLoaderHybridHealth({ config }),
  ]);
  const cases: AnnualReportShadowBatchCaseResult[] = [];
  for (const entry of manifest.entries) {
    cases.push(await runShadowCase(entry));
  }

  const runtimeEnvironment = {
    opendataloaderPackageVersion: runtime.packageVersion,
    javaVersion: runtime.java.rawVersion,
    javaMajorVersion: runtime.java.majorVersion,
    localOpenDataLoaderReady: runtime.localModeReady,
    localOpenDataLoaderReason: runtime.localModeReason,
    liveLocalBenchmarkReady: runtime.liveLocalBenchmarkReady,
    liveLocalBenchmarkReason: runtime.liveLocalBenchmarkReason,
    liveHybridBenchmarkReady: hybridHealth.liveHybridBenchmarkReady,
    liveHybridBenchmarkReason: hybridHealth.reason,
  } satisfies AnnualReportBenchmarkRun["runtimeEnvironment"];

  return {
    generatedAt: new Date().toISOString(),
    manifest,
    runtimeEnvironment,
    cases,
    summary: summarizeShadowBatch(manifest, runtimeEnvironment, cases),
  };
}

export function renderAnnualReportShadowBatchMarkdown(
  run: AnnualReportShadowBatchRun,
) {
  const lines = [
    "# Annual-report shadow batch",
    "",
    `Generated at: ${run.generatedAt}`,
    `Batch: ${run.manifest.name}`,
    `Entries: ${run.manifest.entries.length}`,
    "",
    "## Summary",
    "",
    `- Real filings evaluated: ${run.summary.totalRealFilings}`,
    `- Completed comparisons: ${run.summary.completedCases}`,
    `- Skipped: ${run.summary.skippedCases}`,
    `- Publish mismatches: ${run.summary.publishDecisionMismatchCases}`,
    `- Material disagreements: ${run.summary.disagreementCases}`,
    `- Evidence quality counts: live-local=${run.summary.evidenceQualityCounts["real-filing-live-local"]}, live-hybrid=${run.summary.evidenceQualityCounts["real-filing-live-hybrid"]}, runtime-unavailable=${run.summary.evidenceQualityCounts["runtime-unavailable"]}, missing-pdf=${run.summary.evidenceQualityCounts["missing-pdf-artifact"]}`,
    `- Classes with zero live evidence: ${run.summary.classesWithZeroLiveEvidence.join(", ") || "none"}`,
    "",
    "## OCR / Degraded Visibility",
    "",
    `- OCR/degraded cases: ${run.summary.liveOcrOrScannedCoverage.totalCases}`,
    `- Live OCR/degraded cases: ${run.summary.liveOcrOrScannedCoverage.liveCases}`,
    `- Runtime-unavailable OCR/degraded cases: ${run.summary.liveOcrOrScannedCoverage.runtimeUnavailableCases}`,
    `- OCR/degraded publish mismatches: ${run.summary.liveOcrOrScannedCoverage.publishMismatchCases}`,
    `- OCR/degraded material disagreements: ${run.summary.liveOcrOrScannedCoverage.materialDisagreementCases}`,
    `- OCR/degraded safe manual-review outcomes: ${run.summary.liveOcrOrScannedCoverage.safeManualReviewCases}`,
    "",
    "## Baseline OCR Batch",
    "",
    `- Default baseline org: ${BASELINE_OCR_ORG_NUMBER}`,
    `- Default baseline fiscal years: ${BASELINE_OCR_FISCAL_YEARS.join(", ")}`,
    `- Baseline filings present in manifest: ${run.cases.filter((item) => item.orgNumber === BASELINE_OCR_ORG_NUMBER).length}`,
    "",
    "## Shadow Evidence By Class",
    "",
    ...Object.entries(run.summary.shadowCoverageByDocumentTag)
      .filter(([, metrics]) => metrics.differentialCases > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([tag, metrics]) => [
        `- ${tag}: status=${metrics.status}, differential=${metrics.differentialCases}, live=${metrics.liveCases}, publishMismatch=${metrics.publishDecisionMismatchCases}, materialDisagreement=${metrics.materialDisagreementCases}, usableOdlStructure=${metrics.usablePageStructureCases}, manualReviewSafety=${metrics.manualReviewSafetyCases}`,
        `  reason: ${metrics.statusReason}`,
      ]),
    "",
    "## Recommendation",
    "",
    `- ${run.summary.recommendation}`,
    `- Reason: ${run.summary.recommendationReason}`,
    "",
    "## Cases",
    "",
  ];

  for (const item of run.cases) {
    lines.push(`### ${item.caseId}`);
    lines.push("");
    lines.push(
      `- Filing: ${item.filingId} (${item.orgNumber ?? "unknown"} ${item.fiscalYear})`,
    );
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Evidence quality: ${item.evidenceQuality}`);
    lines.push(`- Tags: ${item.documentTags.join(", ") || "none"}`);
    if (item.routeDecision) {
      lines.push(
        `- Route decision: ${item.routeDecision.executionMode}${item.routeDecision.hybridMode ? `/${item.routeDecision.hybridMode}` : ""} (${item.routeDecision.reasonCode})${item.routeDecision.requiresOcr ? ", requires OCR" : ""}`,
      );
      lines.push(`- Route reason: ${item.routeDecision.reason}`);
    }
    if (item.legacyOcrDiagnostics) {
      lines.push(
        `- OCR diagnostics: attempts=${item.legacyOcrDiagnostics.ocrAttemptCount}, usable=${item.legacyOcrDiagnostics.usableOcrRegionCount}, usableLines=${item.legacyOcrDiagnostics.usableLineCount}, rowCandidates=${item.legacyOcrDiagnostics.rowCandidateCount}, yearHeaders=${item.legacyOcrDiagnostics.yearHeaderCandidateCount}, statementLikePages=${item.legacyOcrDiagnostics.statementLikePageCount}, reconstructedNumericCells=${item.legacyOcrDiagnostics.reconstructedNumericCellCount}, mergedNumericTokens=${item.legacyOcrDiagnostics.mergedNumericTokenCount}, rowsWithAssignedYears=${item.legacyOcrDiagnostics.rowsWithAssignedYearColumns}, ambiguousRows=${item.legacyOcrDiagnostics.ambiguousRowCount}, tinySkipped=${item.legacyOcrDiagnostics.tinyCropSkippedCount}, invalid=${item.legacyOcrDiagnostics.invalidCropCount}, failures=${item.legacyOcrDiagnostics.ocrFailureCount}, pageFallbacks=${item.legacyOcrDiagnostics.pageLevelOcrFallbackCount}, manualReviewDueToOcrQuality=${item.legacyOcrDiagnostics.manualReviewDueToOcrQualityCount}`,
      );
      if (item.legacyOcrDiagnostics.suppressedFailureMessages.length > 0) {
        lines.push(
          `- OCR suppressed failures: ${item.legacyOcrDiagnostics.suppressedFailureMessages
            .map((failure) => `${failure.message} (${failure.count})`)
            .join(" | ")}`,
        );
      }
    }
    if (item.legacy) {
      lines.push(
        `- Legacy outcome: ${item.legacy.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW"}`,
      );
    }
    if (item.openDataLoader) {
      lines.push(
        `- ODL outcome: ${item.openDataLoader.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW"} (${item.openDataLoader.mode})`,
      );
      lines.push(`- ODL route reason: ${item.openDataLoader.routeReason ?? "n/a"}`);
    }
    if (item.openDataLoaderDiagnostics) {
      lines.push(
        `- ODL first failing stage: ${item.openDataLoaderDiagnostics.firstFailingStage} (${item.openDataLoaderDiagnostics.rootCauseClassification})`,
      );
      lines.push(`- ODL failing reason: ${item.openDataLoaderDiagnostics.firstFailingReason}`);
      if (item.openDataLoaderDiagnostics.rawOutput) {
        lines.push(
          `- ODL raw output: elements=${item.openDataLoaderDiagnostics.rawOutput.elementCount}, textElements=${item.openDataLoaderDiagnostics.rawOutput.textElementCount}, tables=${item.openDataLoaderDiagnostics.rawOutput.tableCount}, pages=${item.openDataLoaderDiagnostics.rawOutput.pageCount}, types=${Object.entries(item.openDataLoaderDiagnostics.rawOutput.elementTypeCounts).map(([type, count]) => `${type}:${count}`).join(", ") || "none"}`,
        );
      }
      if (item.openDataLoaderDiagnostics.normalizedOutput) {
        lines.push(
          `- ODL normalized output: pages=${item.openDataLoaderDiagnostics.normalizedOutput.pageCount}, blocks=${item.openDataLoaderDiagnostics.normalizedOutput.blockCount}, tables=${item.openDataLoaderDiagnostics.normalizedOutput.tableCount}, blockKinds=${Object.entries(item.openDataLoaderDiagnostics.normalizedOutput.blockKindCounts).map(([kind, count]) => `${kind}:${count}`).join(", ") || "none"}`,
        );
      }
      if (item.openDataLoaderDiagnostics.annualReportPages) {
        lines.push(
          `- ODL annual-report pages: pages=${item.openDataLoaderDiagnostics.annualReportPages.pageCount}, lines=${item.openDataLoaderDiagnostics.annualReportPages.totalLines}, tables=${item.openDataLoaderDiagnostics.annualReportPages.totalTables}, statementSignalsPresent=${item.openDataLoaderDiagnostics.statementLikeSignalsPresent}, imageOnlyRawOutput=${item.openDataLoaderDiagnostics.imageOnlyRawOutput}`,
        );
      }
    }
    if (item.divergenceSummary) {
      lines.push(`- Cross-engine divergence: ${item.divergenceSummary.firstDivergenceStage}`);
      lines.push(`- Cross-engine summary: ${item.divergenceSummary.summary}`);
    }
    if (item.errors.length > 0) {
      lines.push(`- Errors: ${item.errors.join(" | ")}`);
    }
    if (item.knownEvidenceLimitations.length > 0) {
      lines.push(
        `- Evidence limitations: ${item.knownEvidenceLimitations.join(" | ")}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
