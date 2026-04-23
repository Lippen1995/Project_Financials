import fs from "node:fs/promises";
import path from "node:path";

import {
  buildClassificationIssues,
  calculateConfidenceScore,
  canPublishAutomatically,
} from "@/integrations/brreg/annual-report-financials/publish-gate";
import {
  documentRegressionFixtures,
  ocrRegressionFixtures,
} from "@/integrations/brreg/annual-report-financials/regression-fixtures";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { reconstructStatementRows } from "@/integrations/brreg/annual-report-financials/table-reconstruction";
import { CanonicalMetricKey } from "@/integrations/brreg/annual-report-financials/taxonomy";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import {
  CanonicalFactCandidate,
  ExtractedLine,
  AnnualReportParsedInputPage,
  PageClassification,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { buildOpenDataLoaderComparisonSummary } from "@/server/document-understanding/opendataloader-comparison";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import {
  inspectOpenDataLoaderRuntime,
} from "@/server/document-understanding/opendataloader-runtime";
import {
  OpenDataLoaderComparisonSummary,
  OpenDataLoaderPipelineSnapshot,
  OpenDataLoaderResolvedConfig,
} from "@/server/document-understanding/opendataloader-types";
import {
  convertNormalizedDocumentToAnnualReportPages,
  normalizeOpenDataLoaderPayload,
} from "@/server/document-understanding/opendataloader-normalizer";

export type BenchmarkExpected = {
  classificationTypes?: string[];
  unitScaleByPage?: Record<string, number | null>;
  factValues?: Partial<Record<CanonicalMetricKey, number>>;
  shouldPublish?: boolean;
  requiredIssueCodes?: string[];
};

export type BenchmarkEvidenceKind =
  | "captured-fixture"
  | "live-local-odl"
  | "live-hybrid-odl"
  | "legacy-only";

export type BenchmarkComparisonAssessment = {
  classification:
    | "no_material_disagreement"
    | "known_evidence_gap"
    | "likely_code_or_logic_issue";
  summary: string;
};

type InlineOcrPage = {
  pageNumber: number;
  lines: Array<{ words: string[] }>;
};

type LegacyBenchmarkSource =
  | { kind: "document_regression"; name: string }
  | { kind: "ocr_regression"; name: string }
  | { kind: "inline_document_pages"; pages: string[][] };

type OpenDataLoaderBenchmarkSource =
  | { kind: "captured_normalized_json"; path: string; hasEmbeddedText?: boolean }
  | { kind: "live_pdf"; path: string; config?: Partial<OpenDataLoaderResolvedConfig> }
  | {
      kind: "live_generated_pdf_from_legacy";
      executionMode?: "local" | "hybrid";
      config?: Partial<OpenDataLoaderResolvedConfig>;
    }
  | { kind: "inline_ocr_pages"; pages: InlineOcrPage[] };

export type AnnualReportBenchmarkCase = {
  id: string;
  name: string;
  orgNumber?: string;
  fiscalYear: number;
  documentTags?: string[];
  mode?: "expected" | "differential" | "expected_and_differential";
  notes?: string;
  includeInDefaultRun?: boolean;
  knownEvidenceLimitations?: string[];
  legacySource: LegacyBenchmarkSource;
  openDataLoaderSource?: OpenDataLoaderBenchmarkSource;
  expected?: BenchmarkExpected;
};

export type BenchmarkPipelineResult = {
  engine: "LEGACY" | "OPENDATALOADER";
  executionSource:
    | "document_fixture"
    | "ocr_fixture"
    | "captured_normalized_json"
    | "live_pdf";
  mode: "legacy" | "local" | "hybrid";
  runtimeMs: number;
  confidenceScore: number;
  validationScore: number;
  shouldPublish: boolean;
  artifactGeneration: {
    attempted: boolean;
    success: boolean | null;
    artifactKinds: string[];
    detail: string;
  };
  classifications: Array<{
    pageNumber: number;
    type: string;
    unitScale: number | null;
  }>;
  classificationDiagnostics?: Array<{
    pageNumber: number;
    type: string;
    confidence: number;
    unitScale: number | null;
    unitScaleConfidence: number;
    hasConflictingUnitSignals: boolean;
    declaredYears: number[];
    yearHeaderYears: number[];
    heading: string | null;
    numericRowCount: number;
    tableLike: boolean;
    reasons: string[];
  }>;
  selectedFacts: Array<{
    metricKey: string;
    value: number;
    sourcePage: number;
    sourceSection: string;
    precedence: string;
  }>;
  blockingRuleCodes: string[];
  issueCodes: string[];
  issueCount: number;
  validationPasses: boolean;
  evidenceKind: BenchmarkEvidenceKind;
  snapshot: OpenDataLoaderPipelineSnapshot;
};

export type BenchmarkExpectedEvaluation = {
  statementPageAccuracy: number | null;
  unitScaleAccuracy: number | null;
  factAccuracy: number | null;
  publishOutcomeMatch: boolean | null;
  matchedIssueCodes: string[];
  missingIssueCodes: string[];
  mismatches: string[];
};

export type BenchmarkDivergenceSummary = {
  firstDivergenceStage:
    | "none"
    | "page_classification"
    | "note_selection"
    | "unit_scale"
    | "table_reconstruction"
    | "canonical_mapping"
    | "validation"
    | "publish_gate";
  summary: string;
  legacyOutcome: "PUBLISHED" | "MANUAL_REVIEW";
  openDataLoaderOutcome: "PUBLISHED" | "MANUAL_REVIEW";
  legacyStatementPages: Array<{ pageNumber: number; type: string }>;
  openDataLoaderStatementPages: Array<{ pageNumber: number; type: string }>;
  legacyNotePages: number[];
  openDataLoaderNotePages: number[];
  unitScalesByPage: Array<{
    pageNumber: number;
    legacy: number | null;
    openDataLoader: number | null;
  }>;
  pageClassificationDifferences: Array<{
    pageNumber: number;
    legacyType: string | null;
    openDataLoaderType: string | null;
    legacyUnitScale: number | null;
    openDataLoaderUnitScale: number | null;
    legacySignals: string[];
    openDataLoaderSignals: string[];
    evidenceComparison: string;
  }>;
  missingCanonicalFactsOnOpenDataLoader: string[];
  differingCanonicalFacts: Array<{
    metricKey: string;
    legacyValue: number | null;
    openDataLoaderValue: number | null;
  }>;
  validationIssuesOnlyOnOpenDataLoader: string[];
  blockingReasonsOnOpenDataLoader: string[];
  confidence: {
    legacy: number;
    openDataLoader: number;
  };
};

export type AnnualReportBenchmarkCaseResult = {
  caseId: string;
  name: string;
  fiscalYear: number;
  documentTags: string[];
  mode: "expected" | "differential" | "expected_and_differential";
  notes?: string;
  status: "completed" | "error" | "skipped";
  errors: string[];
  expected?: BenchmarkExpected;
  evidenceKind: BenchmarkEvidenceKind;
  knownEvidenceLimitations: string[];
  legacy?: BenchmarkPipelineResult & { expectedEvaluation?: BenchmarkExpectedEvaluation };
  openDataLoader?: BenchmarkPipelineResult & {
    expectedEvaluation?: BenchmarkExpectedEvaluation;
    routeReason?: string | null;
  };
  comparison?: OpenDataLoaderComparisonSummary | null;
  comparisonAssessment?: BenchmarkComparisonAssessment | null;
  divergenceSummary?: BenchmarkDivergenceSummary | null;
};

export type AnnualReportBenchmarkRun = {
  generatedAt: string;
  cases: AnnualReportBenchmarkCaseResult[];
  runtimeEnvironment: {
    opendataloaderPackageVersion: string | null;
    javaVersion: string | null;
    javaMajorVersion: number | null;
    localOpenDataLoaderReady: boolean;
    localOpenDataLoaderReason: string;
    liveLocalBenchmarkReady: boolean;
    liveLocalBenchmarkReason: string;
    liveHybridBenchmarkReady: boolean;
    liveHybridBenchmarkReason: string;
  };
  summary: {
    totalCases: number;
    completedCases: number;
    failedCases: number;
    skippedCases: number;
    differentialCases: number;
    disagreementCases: number;
    publishDecisionMismatchCases: number;
    evidenceCounts: Record<BenchmarkEvidenceKind, number>;
    documentTagCounts: Record<string, number>;
    documentTagMetrics: Record<
      string,
      {
        totalCases: number;
        differentialCases: number;
        liveOpenDataLoaderCases: number;
        publishParityRate: number | null;
        materialDisagreementRate: number | null;
        knownEvidenceGapCount: number;
        likelyIssueCount: number;
      }
    >;
    comparisonAssessmentCounts: Record<BenchmarkComparisonAssessment["classification"], number>;
    divergenceStageCounts: Record<BenchmarkDivergenceSummary["firstDivergenceStage"], number>;
    openDataLoaderBlockingReasonCounts: Record<string, number>;
    missingCanonicalFactCounts: Record<string, number>;
    runtimeByEvidenceKind: Record<
      BenchmarkEvidenceKind,
      {
        caseCount: number;
        averageOpenDataLoaderMs: number | null;
        medianOpenDataLoaderMs: number | null;
      }
    >;
    averageRuntimeMs: Record<string, number | null>;
    medianRuntimeMs: Record<string, number | null>;
    expectedMetrics: Record<
      string,
      {
        evaluatedCases: number;
        averageStatementPageAccuracy: number | null;
        averageUnitScaleAccuracy: number | null;
        averageFactAccuracy: number | null;
        publishOutcomeMatchRate: number | null;
        validationPassRate: number | null;
      }
    >;
    recommendation: string;
    recommendationReason: string;
  };
};

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdfBuffer(pages: string[][]) {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const pageRefs: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageRefs.push(`${pageObjectId} 0 R`);

    const content = [
      "BT",
      "/F1 11 Tf",
      "14 TL",
      "50 780 Td",
      ...pages[index].flatMap((line, lineIndex) =>
        lineIndex === 0 ? [`(${escapePdfText(line)}) Tj`] : ["T*", `(${escapePdfText(line)}) Tj`],
      ),
      "ET",
    ].join("\n");

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function buildOcrPageTextLayers(pages: InlineOcrPage[]): PageTextLayer[] {
  return pages.map((page) => {
    const lines: ExtractedLine[] = page.lines.map((line, lineIndex) => {
      const words = line.words
        .filter((word) => word.length > 0)
        .map((word, wordIndex) => ({
          text: word,
          normalizedText: normalizeNorwegianText(word),
          x: 40 + wordIndex * 90,
          y: 40 + lineIndex * 16,
          width: Math.max(8, word.length * 7),
          height: 12,
          confidence: 0.86,
          lineNumber: lineIndex,
        }));
      const text = words.map((word) => word.text).join(" ");
      return {
        text,
        normalizedText: normalizeNorwegianText(text),
        x: 40,
        y: 40 + lineIndex * 16,
        width: Math.max(80, text.length * 7),
        height: 12,
        confidence: 0.86,
        words,
      };
    });
    const text = lines.map((line) => line.text).join("\n");
    return {
      pageNumber: page.pageNumber,
      text,
      normalizedText: normalizeNorwegianText(text),
      lines,
      hasEmbeddedText: false,
    };
  });
}

function buildPipelineSnapshot(input: {
  engine: "LEGACY" | "OPENDATALOADER";
  mode: "legacy" | "local" | "hybrid";
  classifications: PageClassification[];
  selectedFacts: Map<string, CanonicalFactCandidate>;
  blockingRuleCodes: string[];
  shouldPublish: boolean;
  confidenceScore: number;
  durationMs: number;
}) {
  return {
    engine: input.engine,
    mode: input.mode,
    classifications: input.classifications.map((classification) => ({
      pageNumber: classification.pageNumber,
      type: classification.type,
      unitScale: classification.unitScale,
    })),
    selectedFacts: Array.from(input.selectedFacts.values()).map((fact) => ({
      metricKey: fact.metricKey,
      value: fact.value,
      sourcePage: fact.sourcePage,
      sourceSection: fact.sourceSection,
      precedence: fact.precedence,
    })),
    blockingRuleCodes: input.blockingRuleCodes,
    shouldPublish: input.shouldPublish,
    confidenceScore: input.confidenceScore,
    durationMs: input.durationMs,
  } satisfies OpenDataLoaderPipelineSnapshot;
}

function runPipelineFromPages(input: {
  fiscalYear: number;
  pages: AnnualReportParsedInputPage[];
  engine: "LEGACY" | "OPENDATALOADER";
  mode: "legacy" | "local" | "hybrid";
  runtimeMs: number;
  executionSource: BenchmarkPipelineResult["executionSource"];
  artifactGeneration: BenchmarkPipelineResult["artifactGeneration"];
}) {
  const startedAt = Date.now();
  const classifications = classifyPages(input.pages);
  const rows = reconstructStatementRows(input.pages, classifications);
  const mapped = mapRowsToCanonicalFacts({
    filingFiscalYear: input.fiscalYear,
    classifications,
    rows,
  });
  const validation = validateCanonicalFacts(mapped.facts);
  const issues = [
    ...buildClassificationIssues(input.fiscalYear, classifications),
    ...mapped.issues,
    ...validation.issues,
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
    classifications,
    selectedFactCount: validation.selectedFacts.size,
    validationScore: validation.validationScore,
    duplicateSupport,
    noteSupport,
    issueCount: issues.length,
  });
  const shouldPublish = canPublishAutomatically({
    filingFiscalYear: input.fiscalYear,
    classifications,
    selectedFacts: validation.selectedFacts,
    validationIssues: issues,
    confidenceScore,
  });
  const blockingRuleCodes = Array.from(
    new Set(issues.filter((issue) => issue.severity === "ERROR").map((issue) => issue.ruleCode)),
  );
  const durationMs = input.runtimeMs + (Date.now() - startedAt);

  return {
    engine: input.engine,
    executionSource: input.executionSource,
    mode: input.mode,
    runtimeMs: durationMs,
    confidenceScore,
    validationScore: validation.validationScore,
    shouldPublish,
    artifactGeneration: input.artifactGeneration,
    classifications: classifications.map((classification) => ({
      pageNumber: classification.pageNumber,
      type: classification.type,
      unitScale: classification.unitScale,
    })),
    classificationDiagnostics: classifications.map((classification) => ({
      pageNumber: classification.pageNumber,
      type: classification.type,
      confidence: classification.confidence,
      unitScale: classification.unitScale,
      unitScaleConfidence: classification.unitScaleConfidence,
      hasConflictingUnitSignals: classification.hasConflictingUnitSignals,
      declaredYears: classification.declaredYears,
      yearHeaderYears: classification.yearHeaderYears,
      heading: classification.heading,
      numericRowCount: classification.numericRowCount,
      tableLike: classification.tableLike,
      reasons: classification.reasons,
    })),
    selectedFacts: Array.from(validation.selectedFacts.values()).map((fact) => ({
      metricKey: fact.metricKey,
      value: fact.value,
      sourcePage: fact.sourcePage,
      sourceSection: fact.sourceSection,
      precedence: fact.precedence,
    })),
    blockingRuleCodes,
    issueCodes: issues.map((issue) => issue.ruleCode),
    issueCount: issues.length,
    validationPasses: blockingRuleCodes.length === 0,
    evidenceKind:
      input.engine === "LEGACY"
        ? "legacy-only"
        : input.executionSource === "live_pdf"
          ? input.mode === "hybrid"
            ? "live-hybrid-odl"
            : "live-local-odl"
          : "captured-fixture",
    snapshot: buildPipelineSnapshot({
      engine: input.engine,
      mode: input.mode,
      classifications,
      selectedFacts: validation.selectedFacts,
      blockingRuleCodes,
      shouldPublish,
      confidenceScore,
      durationMs,
    }),
  } satisfies BenchmarkPipelineResult;
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function incrementCount(target: Record<string, number>, key: string, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

function defaultDocumentTags(benchmarkCase: AnnualReportBenchmarkCase) {
  if (benchmarkCase.documentTags && benchmarkCase.documentTags.length > 0) {
    return benchmarkCase.documentTags;
  }

  if (benchmarkCase.legacySource.kind === "ocr_regression") {
    return ["scan_or_ocr"];
  }

  if (benchmarkCase.openDataLoaderSource?.kind === "live_generated_pdf_from_legacy") {
    return ["live_local_candidate"];
  }

  return ["uncategorized"];
}

class BenchmarkSkipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkSkipError";
  }
}

function inferCaseEvidenceKind(
  benchmarkCase: AnnualReportBenchmarkCase,
  openDataLoaderResult?: BenchmarkPipelineResult | null,
): BenchmarkEvidenceKind {
  if (!benchmarkCase.openDataLoaderSource || !openDataLoaderResult) {
    return "legacy-only";
  }

  switch (openDataLoaderResult.executionSource) {
    case "captured_normalized_json":
      return "captured-fixture";
    case "live_pdf":
      return openDataLoaderResult.mode === "hybrid" ? "live-hybrid-odl" : "live-local-odl";
    default:
      return "captured-fixture";
  }
}

function assessComparison(
  benchmarkCase: AnnualReportBenchmarkCase,
  comparison: OpenDataLoaderComparisonSummary | null | undefined,
): BenchmarkComparisonAssessment | null {
  if (!comparison) {
    return null;
  }

  if (!comparison.materialDisagreement) {
    return {
      classification: "no_material_disagreement",
      summary: "No material disagreement was detected between legacy and OpenDataLoader for this case.",
    };
  }

  if (
    benchmarkCase.knownEvidenceLimitations &&
    benchmarkCase.knownEvidenceLimitations.length > 0
  ) {
    return {
      classification: "known_evidence_gap",
      summary: benchmarkCase.knownEvidenceLimitations.join(" "),
    };
  }

  return {
    classification: "likely_code_or_logic_issue",
    summary:
      "A material disagreement remains without a declared evidence limitation, so this case still looks like a parser or pipeline issue.",
  };
}

const STATEMENT_TYPES = new Set([
  "STATUTORY_INCOME",
  "STATUTORY_BALANCE",
  "STATUTORY_BALANCE_CONTINUATION",
  "SUPPLEMENTARY_INCOME",
  "SUPPLEMENTARY_BALANCE",
]);

function sameJsonValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

type BenchmarkClassificationDiagnostic = NonNullable<
  BenchmarkPipelineResult["classificationDiagnostics"]
>[number];

function summarizeClassificationSignals(
  diagnostic: BenchmarkClassificationDiagnostic | undefined,
) {
  if (!diagnostic) {
    return ["classification details unavailable"];
  }

  return [
    `confidence=${diagnostic.confidence.toFixed(3)}`,
    `unitScale=${diagnostic.unitScale ?? "unknown"}`,
    `unitScaleConfidence=${diagnostic.unitScaleConfidence.toFixed(3)}`,
    `tableLike=${diagnostic.tableLike}`,
    `numericRows=${diagnostic.numericRowCount}`,
    `years=${diagnostic.yearHeaderYears.join("/") || "none"}`,
    `heading=${diagnostic.heading ?? "none"}`,
    `conflictingUnitSignals=${diagnostic.hasConflictingUnitSignals}`,
    `reasons=${diagnostic.reasons.slice(0, 8).join("; ") || "none"}`,
  ];
}

function compareClassificationEvidence(input: {
  legacy: BenchmarkClassificationDiagnostic | undefined;
  openDataLoader: BenchmarkClassificationDiagnostic | undefined;
}) {
  if (!input.legacy || !input.openDataLoader) {
    return "One side is missing page-level classification diagnostics.";
  }

  if (input.openDataLoader.numericRowCount < input.legacy.numericRowCount) {
    return "OpenDataLoader had fewer numeric row signals than legacy on this page.";
  }

  if (input.legacy.tableLike && !input.openDataLoader.tableLike) {
    return "OpenDataLoader did not preserve a table-like page signal that legacy saw.";
  }

  if (input.openDataLoader.reasons.length < input.legacy.reasons.length) {
    return "OpenDataLoader produced fewer classification reasons/signals than legacy.";
  }

  return "Both paths had page-level evidence, but selected different labels.";
}

function buildDivergenceSummary(input: {
  legacy: BenchmarkPipelineResult;
  openDataLoader: BenchmarkPipelineResult;
}): BenchmarkDivergenceSummary | null {
  const legacy = input.legacy;
  const openDataLoader = input.openDataLoader;
  if (
    sameJsonValue(legacy.classifications, openDataLoader.classifications) &&
    sameJsonValue(legacy.selectedFacts, openDataLoader.selectedFacts) &&
    sameJsonValue(legacy.issueCodes, openDataLoader.issueCodes) &&
    legacy.shouldPublish === openDataLoader.shouldPublish
  ) {
    return null;
  }

  const statementPages = (result: BenchmarkPipelineResult) =>
    result.classifications
      .filter((classification) => STATEMENT_TYPES.has(classification.type))
      .map((classification) => ({
        pageNumber: classification.pageNumber,
        type: classification.type,
      }));
  const notePages = (result: BenchmarkPipelineResult) =>
    result.classifications
      .filter((classification) => classification.type === "NOTE")
      .map((classification) => classification.pageNumber);
  const allPageNumbers = Array.from(
    new Set([
      ...legacy.classifications.map((classification) => classification.pageNumber),
      ...openDataLoader.classifications.map((classification) => classification.pageNumber),
    ]),
  ).sort((left, right) => left - right);
  const unitScalesByPage = allPageNumbers.map((pageNumber) => ({
    pageNumber,
    legacy:
      legacy.classifications.find((classification) => classification.pageNumber === pageNumber)
        ?.unitScale ?? null,
    openDataLoader:
      openDataLoader.classifications.find((classification) => classification.pageNumber === pageNumber)
        ?.unitScale ?? null,
  }));
  const pageClassificationDifferences = allPageNumbers.flatMap((pageNumber) => {
    const legacyClassification = legacy.classifications.find(
      (classification) => classification.pageNumber === pageNumber,
    );
    const openDataLoaderClassification = openDataLoader.classifications.find(
      (classification) => classification.pageNumber === pageNumber,
    );
    if (
      (legacyClassification?.type ?? null) === (openDataLoaderClassification?.type ?? null) &&
      (legacyClassification?.unitScale ?? null) ===
        (openDataLoaderClassification?.unitScale ?? null)
    ) {
      return [];
    }

    const legacyDiagnostic = legacy.classificationDiagnostics?.find(
      (classification) => classification.pageNumber === pageNumber,
    );
    const openDataLoaderDiagnostic = openDataLoader.classificationDiagnostics?.find(
      (classification) => classification.pageNumber === pageNumber,
    );

    return [
      {
        pageNumber,
        legacyType: legacyClassification?.type ?? null,
        openDataLoaderType: openDataLoaderClassification?.type ?? null,
        legacyUnitScale: legacyClassification?.unitScale ?? null,
        openDataLoaderUnitScale: openDataLoaderClassification?.unitScale ?? null,
        legacySignals: summarizeClassificationSignals(legacyDiagnostic),
        openDataLoaderSignals: summarizeClassificationSignals(openDataLoaderDiagnostic),
        evidenceComparison: compareClassificationEvidence({
          legacy: legacyDiagnostic,
          openDataLoader: openDataLoaderDiagnostic,
        }),
      },
    ];
  });
  const legacyFactMap = new Map(legacy.selectedFacts.map((fact) => [fact.metricKey, fact]));
  const openDataLoaderFactMap = new Map(
    openDataLoader.selectedFacts.map((fact) => [fact.metricKey, fact]),
  );
  const missingCanonicalFactsOnOpenDataLoader = Array.from(legacyFactMap.keys())
    .filter((metricKey) => !openDataLoaderFactMap.has(metricKey))
    .sort();
  const differingCanonicalFacts = Array.from(
    new Set([...legacyFactMap.keys(), ...openDataLoaderFactMap.keys()]),
  )
    .sort()
    .flatMap((metricKey) => {
      const legacyFact = legacyFactMap.get(metricKey);
      const openDataLoaderFact = openDataLoaderFactMap.get(metricKey);
      const legacyValue = legacyFact?.value ?? null;
      const openDataLoaderValue = openDataLoaderFact?.value ?? null;
      return legacyValue !== openDataLoaderValue
        ? [{ metricKey, legacyValue, openDataLoaderValue }]
        : [];
    });
  const validationIssuesOnlyOnOpenDataLoader = Array.from(
    new Set(
      openDataLoader.issueCodes.filter((ruleCode) => !legacy.issueCodes.includes(ruleCode)),
    ),
  ).sort();
  const blockingReasonsOnOpenDataLoader = [...openDataLoader.blockingRuleCodes].sort();

  let firstDivergenceStage: BenchmarkDivergenceSummary["firstDivergenceStage"] = "none";
  if (!sameJsonValue(statementPages(legacy), statementPages(openDataLoader))) {
    firstDivergenceStage = "page_classification";
  } else if (!sameJsonValue(notePages(legacy), notePages(openDataLoader))) {
    firstDivergenceStage = "note_selection";
  } else if (unitScalesByPage.some((entry) => entry.legacy !== entry.openDataLoader)) {
    firstDivergenceStage = "unit_scale";
  } else if (
    openDataLoader.selectedFacts.length === 0 &&
    legacy.selectedFacts.length > 0 &&
    openDataLoader.issueCodes.includes("STATEMENT_TABLE_LAYOUT_WEAK")
  ) {
    firstDivergenceStage = "table_reconstruction";
  } else if (differingCanonicalFacts.length > 0) {
    firstDivergenceStage = "canonical_mapping";
  } else if (validationIssuesOnlyOnOpenDataLoader.length > 0) {
    firstDivergenceStage = "validation";
  } else if (legacy.shouldPublish !== openDataLoader.shouldPublish) {
    firstDivergenceStage = "publish_gate";
  }

  const summary =
    firstDivergenceStage === "table_reconstruction"
      ? "Statement pages and unit scales match, but OpenDataLoader produced no usable reconstructed statement rows/facts; publish gate blocks on missing required metrics."
      : firstDivergenceStage === "canonical_mapping"
        ? "Statement pages and unit scales match, but canonical fact values differ after row mapping."
        : firstDivergenceStage === "page_classification"
          ? "Statement page selection differs before row reconstruction."
          : firstDivergenceStage === "note_selection"
            ? "Note page selection differs before note tie-out validation."
            : firstDivergenceStage === "unit_scale"
              ? "Unit-scale decisions differ before normalization."
              : firstDivergenceStage === "validation"
                ? "Extracted facts agree enough to reach validation, but OpenDataLoader has additional validation issues."
                : firstDivergenceStage === "publish_gate"
                  ? "Pipeline outputs are otherwise aligned, but publish-gate decision differs."
                  : "No material divergence detected.";

  return {
    firstDivergenceStage,
    summary,
    legacyOutcome: legacy.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW",
    openDataLoaderOutcome: openDataLoader.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW",
    legacyStatementPages: statementPages(legacy),
    openDataLoaderStatementPages: statementPages(openDataLoader),
    legacyNotePages: notePages(legacy),
    openDataLoaderNotePages: notePages(openDataLoader),
    unitScalesByPage,
    pageClassificationDifferences,
    missingCanonicalFactsOnOpenDataLoader,
    differingCanonicalFacts,
    validationIssuesOnlyOnOpenDataLoader,
    blockingReasonsOnOpenDataLoader,
    confidence: {
      legacy: legacy.confidenceScore,
      openDataLoader: openDataLoader.confidenceScore,
    },
  };
}

function evaluateAgainstExpected(
  result: BenchmarkPipelineResult,
  expected: BenchmarkExpected | undefined,
): BenchmarkExpectedEvaluation | undefined {
  if (!expected) {
    return undefined;
  }

  const mismatches: string[] = [];
  let statementPageAccuracy: number | null = null;
  let unitScaleAccuracy: number | null = null;
  let factAccuracy: number | null = null;
  let publishOutcomeMatch: boolean | null = null;

  if (expected.classificationTypes?.length) {
    const actual = result.classifications.map((classification) => classification.type);
    const expectedTypes = expected.classificationTypes;
    const matches = expectedTypes.filter((type, index) => actual[index] === type).length;
    statementPageAccuracy = matches / expectedTypes.length;
    if (matches !== expectedTypes.length) {
      mismatches.push(
        `classification types differed: expected ${expectedTypes.join(", ")} but got ${actual.join(", ")}`,
      );
    }
  }

  if (expected.unitScaleByPage && Object.keys(expected.unitScaleByPage).length > 0) {
    const entries = Object.entries(expected.unitScaleByPage);
    const matches = entries.filter(([pageNumber, expectedUnitScale]) => {
      const actualUnitScale =
        result.classifications.find((classification) => classification.pageNumber === Number(pageNumber))
          ?.unitScale ?? null;
      return actualUnitScale === expectedUnitScale;
    }).length;
    unitScaleAccuracy = matches / entries.length;
    if (matches !== entries.length) {
      mismatches.push("unit scale differed on one or more expected pages");
    }
  }

  if (expected.factValues && Object.keys(expected.factValues).length > 0) {
    const factMap = new Map(result.selectedFacts.map((fact) => [fact.metricKey, fact.value]));
    const entries = Object.entries(expected.factValues);
    const matches = entries.filter(([metricKey, expectedValue]) => factMap.get(metricKey) === expectedValue).length;
    factAccuracy = matches / entries.length;
    if (matches !== entries.length) {
      mismatches.push("canonical fact values differed");
    }
  }

  if (typeof expected.shouldPublish === "boolean") {
    publishOutcomeMatch = result.shouldPublish === expected.shouldPublish;
    if (!publishOutcomeMatch) {
      mismatches.push(
        `publish decision differed: expected ${expected.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW"} but got ${result.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW"}`,
      );
    }
  }

  const matchedIssueCodes = (expected.requiredIssueCodes ?? []).filter((ruleCode) =>
    result.issueCodes.includes(ruleCode),
  );
  const missingIssueCodes = (expected.requiredIssueCodes ?? []).filter(
    (ruleCode) => !result.issueCodes.includes(ruleCode),
  );
  if (missingIssueCodes.length > 0) {
    mismatches.push(`missing expected issue codes: ${missingIssueCodes.join(", ")}`);
  }

  return {
    statementPageAccuracy,
    unitScaleAccuracy,
    factAccuracy,
    publishOutcomeMatch,
    matchedIssueCodes,
    missingIssueCodes,
    mismatches,
  };
}

function resolveDocumentFixture(name: string) {
  const fixture = documentRegressionFixtures.find((item) => item.name === name);
  if (!fixture) {
    throw new Error(`Unknown document regression fixture: ${name}`);
  }
  return fixture;
}

function resolveOcrFixture(name: string) {
  const fixture = ocrRegressionFixtures.find((item) => item.name === name);
  if (!fixture) {
    throw new Error(`Unknown OCR regression fixture: ${name}`);
  }
  return fixture;
}

function materializeLegacySourceToPdfBuffer(source: LegacyBenchmarkSource) {
  if (source.kind === "inline_document_pages") {
    return buildSimplePdfBuffer(source.pages);
  }

  if (source.kind === "document_regression") {
    return buildSimplePdfBuffer(resolveDocumentFixture(source.name).pages);
  }

  throw new BenchmarkSkipError(
    "This benchmark case cannot be materialized into a live PDF from the current legacy fixture source.",
  );
}

async function runLegacySource(
  fiscalYear: number,
  source: LegacyBenchmarkSource,
): Promise<{ result: BenchmarkPipelineResult; expected?: BenchmarkExpected }> {
  if (source.kind === "document_regression") {
    const fixture = resolveDocumentFixture(source.name);
    const pdfBuffer = buildSimplePdfBuffer(fixture.pages);
    const startedAt = Date.now();
    const preflight = await preflightAnnualReportDocument(pdfBuffer);
    const runtimeMs = Date.now() - startedAt;
    return {
      result: runPipelineFromPages({
        fiscalYear,
        pages: preflight.parsedPages,
        engine: "LEGACY",
        mode: "legacy",
        runtimeMs,
        executionSource: "document_fixture",
        artifactGeneration: {
          attempted: false,
          success: null,
          artifactKinds: [],
          detail: "Benchmark uses in-memory legacy document fixtures only.",
        },
      }),
      expected: fixture.expected,
    };
  }

  if (source.kind === "ocr_regression") {
    const fixture = resolveOcrFixture(source.name);
    return {
      result: runPipelineFromPages({
        fiscalYear,
        pages: buildOcrPageTextLayers(fixture.pages),
        engine: "LEGACY",
        mode: "legacy",
        runtimeMs: 0,
        executionSource: "ocr_fixture",
        artifactGeneration: {
          attempted: false,
          success: null,
          artifactKinds: [],
          detail: "Benchmark uses in-memory OCR fixtures only.",
        },
      }),
      expected: fixture.expected,
    };
  }

  const pdfBuffer = buildSimplePdfBuffer(source.pages);
  const startedAt = Date.now();
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  const runtimeMs = Date.now() - startedAt;
  return {
    result: runPipelineFromPages({
      fiscalYear,
      pages: preflight.parsedPages,
      engine: "LEGACY",
      mode: "legacy",
      runtimeMs,
      executionSource: "document_fixture",
      artifactGeneration: {
        attempted: false,
        success: null,
        artifactKinds: [],
        detail: "Benchmark uses in-memory inline PDF pages only.",
      },
    }),
  };
}

function withDefaultOpenDataLoaderConfig(
  override?: Partial<OpenDataLoaderResolvedConfig>,
): OpenDataLoaderResolvedConfig {
  return {
    enabled: true,
    mode: "local",
    hybridBackend: "docling-fast",
    hybridUrl: null,
    forceOcr: false,
    useStructTree: false,
    timeoutMs: 120_000,
    dualRun: false,
    storeAnnotatedPdf: true,
    fallbackToLegacy: true,
    ...override,
  };
}

async function runOpenDataLoaderSource(
  fiscalYear: number,
  source: OpenDataLoaderBenchmarkSource,
  legacySource: LegacyBenchmarkSource,
): Promise<{ result: BenchmarkPipelineResult; routeReason: string | null }> {
  if (source.kind === "captured_normalized_json") {
    const absolutePath = path.resolve(process.cwd(), source.path);
    const payload = JSON.parse(await fs.readFile(absolutePath, "utf8"));
    const startedAt = Date.now();
    const normalized = normalizeOpenDataLoaderPayload({
      payload,
      hasEmbeddedText: source.hasEmbeddedText ?? true,
    });
    const pages = convertNormalizedDocumentToAnnualReportPages(normalized);
    const runtimeMs = Date.now() - startedAt;
    return {
      result: runPipelineFromPages({
        fiscalYear,
        pages,
        engine: "OPENDATALOADER",
        mode: "local",
        runtimeMs,
        executionSource: "captured_normalized_json",
        artifactGeneration: {
          attempted: false,
          success: null,
          artifactKinds: ["DOCUMENT_JSON", "DOCUMENT_NORMALIZED_JSON"],
          detail: "Benchmark used a captured OpenDataLoader JSON artifact from the repo.",
        },
      }),
      routeReason: "captured-normalized-json",
    };
  }

  if (source.kind === "inline_ocr_pages") {
    return {
      result: runPipelineFromPages({
        fiscalYear,
        pages: buildOcrPageTextLayers(source.pages),
        engine: "OPENDATALOADER",
        mode: "hybrid",
        runtimeMs: 0,
        executionSource: "ocr_fixture",
        artifactGeneration: {
          attempted: false,
          success: null,
          artifactKinds: [],
          detail: "Benchmark used inline OCR-like pages as a stand-in for OpenDataLoader output.",
        },
      }),
      routeReason: "inline-ocr-pages",
    };
  }

  if (source.kind === "live_generated_pdf_from_legacy") {
    const config = withDefaultOpenDataLoaderConfig({
      ...source.config,
      enabled: true,
      mode: source.executionMode ?? "local",
    });
    const runtime = await inspectOpenDataLoaderRuntime(config);

    if (config.mode === "hybrid" && !runtime.liveHybridBenchmarkReady) {
      throw new BenchmarkSkipError(
        `Live hybrid benchmark is not ready: ${runtime.liveHybridBenchmarkReason}`,
      );
    }

    if (config.mode !== "hybrid" && !runtime.liveLocalBenchmarkReady) {
      throw new BenchmarkSkipError(
        `Live local benchmark is not ready: ${runtime.liveLocalBenchmarkReason}`,
      );
    }

    const pdfBuffer = materializeLegacySourceToPdfBuffer(legacySource);
    const preflight = await preflightAnnualReportDocument(pdfBuffer);
    const parsed = await parseAnnualReportPdfWithOpenDataLoader({
      pdfBuffer,
      sourceFilename: `benchmark-${fiscalYear}.pdf`,
      preflight,
      config,
    });

    return {
      result: runPipelineFromPages({
        fiscalYear,
        pages: parsed.annualReportPages,
        engine: "OPENDATALOADER",
        mode: parsed.routing.executionMode,
        runtimeMs: parsed.metrics.durationMs,
        executionSource: "live_pdf",
        artifactGeneration: {
          attempted: true,
          success: Boolean(parsed.artifacts.rawJson && parsed.artifacts.markdown),
          artifactKinds: [
            "DOCUMENT_JSON",
            ...(parsed.artifacts.markdown ? ["DOCUMENT_MARKDOWN"] : []),
            ...(parsed.artifacts.annotatedPdf ? ["ANNOTATED_PDF"] : []),
          ],
          detail:
            "OpenDataLoader was executed live against a benchmark PDF generated from the legacy benchmark source.",
        },
      }),
      routeReason: `live-generated-from-legacy:${parsed.routing.reason}`,
    };
  }

  const absolutePath = path.resolve(process.cwd(), source.path);
  const config = withDefaultOpenDataLoaderConfig(source.config);
  const runtime = await inspectOpenDataLoaderRuntime(config);

  if (config.mode === "hybrid" && !runtime.liveHybridBenchmarkReady) {
    throw new BenchmarkSkipError(
      `Live hybrid benchmark is not ready: ${runtime.liveHybridBenchmarkReason}`,
    );
  }

  if (config.mode !== "hybrid" && !runtime.liveLocalBenchmarkReady) {
    throw new BenchmarkSkipError(
      `Live local benchmark is not ready: ${runtime.liveLocalBenchmarkReason}`,
    );
  }

  const pdfBuffer = await fs.readFile(absolutePath);
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  const parsed = await parseAnnualReportPdfWithOpenDataLoader({
    pdfBuffer,
    sourceFilename: path.basename(absolutePath),
    preflight,
    config,
  });

  return {
    result: runPipelineFromPages({
      fiscalYear,
      pages: parsed.annualReportPages,
      engine: "OPENDATALOADER",
      mode: parsed.routing.executionMode,
      runtimeMs: parsed.metrics.durationMs,
      executionSource: "live_pdf",
      artifactGeneration: {
        attempted: true,
        success: Boolean(parsed.artifacts.rawJson && parsed.artifacts.markdown),
        artifactKinds: [
          "DOCUMENT_JSON",
          ...(parsed.artifacts.markdown ? ["DOCUMENT_MARKDOWN"] : []),
          ...(parsed.artifacts.annotatedPdf ? ["ANNOTATED_PDF"] : []),
        ],
        detail: "OpenDataLoader was executed live against a benchmark PDF.",
      },
    }),
    routeReason: parsed.routing.reason,
  };
}

export async function loadAnnualReportBenchmarkCases(
  directory: string,
  options?: {
    includeLiveCases?: boolean;
    liveOnly?: boolean;
  },
) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const loaded = await Promise.all(
    files.map(async (filename) => {
      const absolutePath = path.join(directory, filename);
      return JSON.parse(await fs.readFile(absolutePath, "utf8")) as AnnualReportBenchmarkCase;
    }),
  );

  return loaded.filter((benchmarkCase) => {
    const isLiveCase =
      benchmarkCase.openDataLoaderSource?.kind === "live_generated_pdf_from_legacy" ||
      benchmarkCase.openDataLoaderSource?.kind === "live_pdf";

    if (options?.liveOnly) {
      return isLiveCase;
    }

    if (!options?.includeLiveCases && benchmarkCase.includeInDefaultRun === false) {
      return false;
    }

    return true;
  });
}

export async function runAnnualReportBenchmarkCase(
  benchmarkCase: AnnualReportBenchmarkCase,
): Promise<AnnualReportBenchmarkCaseResult> {
  const result: AnnualReportBenchmarkCaseResult = {
    caseId: benchmarkCase.id,
    name: benchmarkCase.name,
    fiscalYear: benchmarkCase.fiscalYear,
    documentTags: defaultDocumentTags(benchmarkCase),
    mode: benchmarkCase.mode ?? "expected",
    notes: benchmarkCase.notes,
    status: "completed",
    errors: [],
    expected: benchmarkCase.expected,
    evidenceKind: "legacy-only",
    knownEvidenceLimitations: benchmarkCase.knownEvidenceLimitations ?? [],
  };

  try {
    const legacy = await runLegacySource(benchmarkCase.fiscalYear, benchmarkCase.legacySource);
    const expected = benchmarkCase.expected ?? legacy.expected;
    result.expected = expected;
    result.legacy = {
      ...legacy.result,
      expectedEvaluation: evaluateAgainstExpected(legacy.result, expected),
    };

    if (benchmarkCase.openDataLoaderSource) {
      const opendataloader = await runOpenDataLoaderSource(
        benchmarkCase.fiscalYear,
        benchmarkCase.openDataLoaderSource,
        benchmarkCase.legacySource,
      );
      result.openDataLoader = {
        ...opendataloader.result,
        expectedEvaluation: evaluateAgainstExpected(opendataloader.result, expected),
        routeReason: opendataloader.routeReason,
      };
      result.comparison = buildOpenDataLoaderComparisonSummary({
        primary: legacy.result.snapshot,
        shadow: opendataloader.result.snapshot,
      });
      result.comparisonAssessment = assessComparison(
        benchmarkCase,
        result.comparison,
      );
      result.divergenceSummary = buildDivergenceSummary({
        legacy: legacy.result,
        openDataLoader: opendataloader.result,
      });
      result.evidenceKind = inferCaseEvidenceKind(benchmarkCase, opendataloader.result);
    }
  } catch (error) {
    if (error instanceof BenchmarkSkipError) {
      result.status = "skipped";
      result.errors.push(error.message);
      return result;
    }

    result.status = "error";
    result.errors.push(error instanceof Error ? error.message : "Unknown benchmark error");
  }

  return result;
}

function summarizeExpectedMetrics(
  cases: AnnualReportBenchmarkCaseResult[],
  engineKey: "legacy" | "openDataLoader",
) {
  const evaluations = cases
    .map((item) => item[engineKey]?.expectedEvaluation)
    .filter((item): item is BenchmarkExpectedEvaluation => Boolean(item));

  return {
    evaluatedCases: evaluations.length,
    averageStatementPageAccuracy: average(
      evaluations
        .map((item) => item.statementPageAccuracy)
        .filter((value): value is number => value !== null),
    ),
    averageUnitScaleAccuracy: average(
      evaluations
        .map((item) => item.unitScaleAccuracy)
        .filter((value): value is number => value !== null),
    ),
    averageFactAccuracy: average(
      evaluations.map((item) => item.factAccuracy).filter((value): value is number => value !== null),
    ),
    publishOutcomeMatchRate: average(
      evaluations
        .map((item) => item.publishOutcomeMatch)
        .filter((value): value is boolean => value !== null)
        .map((value) => (value ? 1 : 0)),
    ),
    validationPassRate: average(
      cases
        .map((item) => item[engineKey]?.validationPasses)
        .filter((value): value is boolean => typeof value === "boolean")
        .map((value) => (value ? 1 : 0)),
    ),
  };
}

function summarizeDocumentTagMetrics(cases: AnnualReportBenchmarkCaseResult[]) {
  const metrics: AnnualReportBenchmarkRun["summary"]["documentTagMetrics"] = {};
  const tags = Array.from(new Set(cases.flatMap((item) => item.documentTags))).sort();

  for (const tag of tags) {
    const taggedCases = cases.filter((item) => item.documentTags.includes(tag));
    const differentialCases = taggedCases.filter((item) => item.comparison);
    const liveOpenDataLoaderCases = taggedCases.filter(
      (item) =>
        item.evidenceKind === "live-local-odl" || item.evidenceKind === "live-hybrid-odl",
    );
    const publishParityValues = differentialCases.map((item) =>
      item.comparison?.publishDecisionMismatch ? 0 : 1,
    );
    const disagreementValues = differentialCases.map((item) =>
      item.comparison?.materialDisagreement ? 1 : 0,
    );

    metrics[tag] = {
      totalCases: taggedCases.length,
      differentialCases: differentialCases.length,
      liveOpenDataLoaderCases: liveOpenDataLoaderCases.length,
      publishParityRate: average(publishParityValues),
      materialDisagreementRate: average(disagreementValues),
      knownEvidenceGapCount: taggedCases.filter(
        (item) => item.comparisonAssessment?.classification === "known_evidence_gap",
      ).length,
      likelyIssueCount: taggedCases.filter(
        (item) => item.comparisonAssessment?.classification === "likely_code_or_logic_issue",
      ).length,
    };
  }

  return metrics;
}

function summarizeRuntimeByEvidenceKind(cases: AnnualReportBenchmarkCaseResult[]) {
  const result = {} as AnnualReportBenchmarkRun["summary"]["runtimeByEvidenceKind"];
  const evidenceKinds: BenchmarkEvidenceKind[] = [
    "legacy-only",
    "captured-fixture",
    "live-local-odl",
    "live-hybrid-odl",
  ];

  for (const evidenceKind of evidenceKinds) {
    const matchingCases = cases.filter((item) => item.evidenceKind === evidenceKind);
    const runtimes = matchingCases
      .map((item) => item.openDataLoader?.runtimeMs)
      .filter((value): value is number => typeof value === "number");
    result[evidenceKind] = {
      caseCount: matchingCases.length,
      averageOpenDataLoaderMs: average(runtimes),
      medianOpenDataLoaderMs: median(runtimes),
    };
  }

  return result;
}

function buildRecommendation(run: {
  runtimeEnvironment: AnnualReportBenchmarkRun["runtimeEnvironment"];
  cases: AnnualReportBenchmarkCaseResult[];
}) {
  const completed = run.cases.filter((item) => item.status === "completed");
  const differentialCases = completed.filter((item) => item.comparison);
  const disagreementCases = differentialCases.filter(
    (item) => item.comparison?.materialDisagreement,
  );
  const odlLiveCases = completed.filter(
    (item) =>
      item.evidenceKind === "live-local-odl" || item.evidenceKind === "live-hybrid-odl",
  );
  const liveDisagreementCases = disagreementCases.filter(
    (item) =>
      item.evidenceKind === "live-local-odl" || item.evidenceKind === "live-hybrid-odl",
  );
  const unexplainedDisagreementCases = disagreementCases.filter(
    (item) => item.comparisonAssessment?.classification !== "known_evidence_gap",
  );

  if (!run.runtimeEnvironment.localOpenDataLoaderReady) {
    return {
      recommendation: "keep legacy as default, OpenDataLoader shadow-only",
      recommendationReason:
        "Repoet har ikke bekreftet lokal OpenDataLoader-runtime i dette miljoet. Java 11+ er ikke klart, sa rollout bor ikke skje utover fixture/shadow-evaluering.",
    };
  }

  if (odlLiveCases.length === 0) {
    return {
      recommendation: "keep legacy as default, OpenDataLoader shadow-only",
      recommendationReason:
        "Benchmarken har ingen live OpenDataLoader-PDF-kjoringer ennå. Captured-fixtures er nyttige for regresjon, men ikke sterke nok til å promotere engine-en.",
    };
  }

  if (liveDisagreementCases.length > 0) {
    return {
      recommendation: "keep legacy as default, OpenDataLoader shadow-only",
      recommendationReason:
        "Det finnes materielle uenigheter i live OpenDataLoader-kjøringer. Inntil disse er forklart, bør OpenDataLoader ikke få publiseringsansvar.",
    };
  }

  if (unexplainedDisagreementCases.length > 0) {
    return {
      recommendation: "keep legacy as default, OpenDataLoader shadow-only",
      recommendationReason:
        "Noen benchmark-uenigheter er fortsatt ikke forklart av kjente evidensbegrensninger. OpenDataLoader bør derfor forbli shadow-only.",
    };
  }

  return {
    recommendation: "keep legacy as default, OpenDataLoader shadow-only",
    recommendationReason:
      "Live benchmark-kjøringene er rene, og gjenværende uenigheter er forklart av captured-fixture-begrensninger. Evidensgrunnlaget er fortsatt for smalt til å endre rollout-postur, så OpenDataLoader forblir shadow-only.",
  };
}

export function summarizeAnnualReportBenchmarkRun(input: {
  cases: AnnualReportBenchmarkCaseResult[];
  runtimeEnvironment: AnnualReportBenchmarkRun["runtimeEnvironment"];
}) {
  const completed = input.cases.filter((item) => item.status === "completed");
  const failed = input.cases.filter((item) => item.status === "error");
  const skipped = input.cases.filter((item) => item.status === "skipped");
  const differentialCases = completed.filter((item) => item.comparison);
  const disagreementCases = differentialCases.filter(
    (item) => item.comparison?.materialDisagreement,
  );
  const publishDecisionMismatchCases = differentialCases.filter(
    (item) => item.comparison?.publishDecisionMismatch,
  );
  const documentTagCounts: Record<string, number> = {};
  const comparisonAssessmentCounts = {
    no_material_disagreement: 0,
    known_evidence_gap: 0,
    likely_code_or_logic_issue: 0,
  } satisfies Record<BenchmarkComparisonAssessment["classification"], number>;
  const divergenceStageCounts = {
    none: 0,
    page_classification: 0,
    note_selection: 0,
    unit_scale: 0,
    table_reconstruction: 0,
    canonical_mapping: 0,
    validation: 0,
    publish_gate: 0,
  } satisfies Record<BenchmarkDivergenceSummary["firstDivergenceStage"], number>;
  const openDataLoaderBlockingReasonCounts: Record<string, number> = {};
  const missingCanonicalFactCounts: Record<string, number> = {};

  input.cases.forEach((item) => {
    item.documentTags.forEach((tag) => incrementCount(documentTagCounts, tag));
    if (item.comparisonAssessment) {
      comparisonAssessmentCounts[item.comparisonAssessment.classification] += 1;
    }
    if (item.divergenceSummary) {
      divergenceStageCounts[item.divergenceSummary.firstDivergenceStage] += 1;
      item.divergenceSummary.blockingReasonsOnOpenDataLoader.forEach((reason) =>
        incrementCount(openDataLoaderBlockingReasonCounts, reason),
      );
      item.divergenceSummary.missingCanonicalFactsOnOpenDataLoader.forEach((metricKey) =>
        incrementCount(missingCanonicalFactCounts, metricKey),
      );
    } else if (item.comparison) {
      divergenceStageCounts.none += 1;
    }
  });

  const recommendation = buildRecommendation(input);

  return {
    totalCases: input.cases.length,
    completedCases: completed.length,
    failedCases: failed.length,
    skippedCases: skipped.length,
    differentialCases: differentialCases.length,
    disagreementCases: disagreementCases.length,
    publishDecisionMismatchCases: publishDecisionMismatchCases.length,
    evidenceCounts: {
      "legacy-only": input.cases.filter((item) => item.evidenceKind === "legacy-only").length,
      "captured-fixture": input.cases.filter((item) => item.evidenceKind === "captured-fixture").length,
      "live-local-odl": input.cases.filter((item) => item.evidenceKind === "live-local-odl").length,
      "live-hybrid-odl": input.cases.filter((item) => item.evidenceKind === "live-hybrid-odl").length,
    },
    documentTagCounts,
    documentTagMetrics: summarizeDocumentTagMetrics(input.cases),
    comparisonAssessmentCounts,
    divergenceStageCounts,
    openDataLoaderBlockingReasonCounts,
    missingCanonicalFactCounts,
    runtimeByEvidenceKind: summarizeRuntimeByEvidenceKind(completed),
    averageRuntimeMs: {
      legacy: average(
        completed
          .map((item) => item.legacy?.runtimeMs)
          .filter((value): value is number => typeof value === "number"),
      ),
      opendataloader: average(
        completed
          .map((item) => item.openDataLoader?.runtimeMs)
          .filter((value): value is number => typeof value === "number"),
      ),
    },
    medianRuntimeMs: {
      legacy: median(
        completed
          .map((item) => item.legacy?.runtimeMs)
          .filter((value): value is number => typeof value === "number"),
      ),
      opendataloader: median(
        completed
          .map((item) => item.openDataLoader?.runtimeMs)
          .filter((value): value is number => typeof value === "number"),
      ),
    },
    expectedMetrics: {
      legacy: summarizeExpectedMetrics(completed, "legacy"),
      opendataloader: summarizeExpectedMetrics(completed, "openDataLoader"),
    },
    recommendation: recommendation.recommendation,
    recommendationReason: recommendation.recommendationReason,
  };
}

export function renderAnnualReportBenchmarkMarkdown(run: AnnualReportBenchmarkRun) {
  const lines = [
    "# Annual-report benchmark",
    "",
    `Generated at: ${run.generatedAt}`,
    "",
    "## Runtime",
    "",
    `- OpenDataLoader package: ${run.runtimeEnvironment.opendataloaderPackageVersion ?? "not installed"}`,
    `- Java version: ${run.runtimeEnvironment.javaVersion ?? "not available"}`,
    `- Local OpenDataLoader ready: ${run.runtimeEnvironment.localOpenDataLoaderReady ? "yes" : "no"}`,
    `- Local readiness reason: ${run.runtimeEnvironment.localOpenDataLoaderReason}`,
    `- Live local benchmark ready: ${run.runtimeEnvironment.liveLocalBenchmarkReady ? "yes" : "no"} (${run.runtimeEnvironment.liveLocalBenchmarkReason})`,
    `- Live hybrid benchmark ready: ${run.runtimeEnvironment.liveHybridBenchmarkReady ? "yes" : "no"} (${run.runtimeEnvironment.liveHybridBenchmarkReason})`,
    "",
    "## Summary",
    "",
    `- Cases: ${run.summary.completedCases}/${run.summary.totalCases} completed`,
    `- Skipped cases: ${run.summary.skippedCases}`,
    `- Differential cases: ${run.summary.differentialCases}`,
    `- Material disagreements: ${run.summary.disagreementCases}`,
    `- Publish-decision mismatches: ${run.summary.publishDecisionMismatchCases}`,
    `- Evidence counts: legacy-only=${run.summary.evidenceCounts["legacy-only"]}, captured-fixture=${run.summary.evidenceCounts["captured-fixture"]}, live-local-odl=${run.summary.evidenceCounts["live-local-odl"]}, live-hybrid-odl=${run.summary.evidenceCounts["live-hybrid-odl"]}`,
    `- Comparison assessments: no-disagreement=${run.summary.comparisonAssessmentCounts.no_material_disagreement}, known-evidence-gap=${run.summary.comparisonAssessmentCounts.known_evidence_gap}, likely-issue=${run.summary.comparisonAssessmentCounts.likely_code_or_logic_issue}`,
    `- Divergence stages: ${Object.entries(run.summary.divergenceStageCounts).filter(([, count]) => count > 0).map(([stage, count]) => `${stage}=${count}`).join(", ") || "none"}`,
    `- Legacy average runtime (ms): ${run.summary.averageRuntimeMs.legacy ?? "n/a"}`,
    `- OpenDataLoader average runtime (ms): ${run.summary.averageRuntimeMs.opendataloader ?? "n/a"}`,
    "",
    "## Document Classes",
    "",
    ...Object.entries(run.summary.documentTagMetrics)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([tag, metrics]) => [
        `- ${tag}: cases=${metrics.totalCases}, differential=${metrics.differentialCases}, live=${metrics.liveOpenDataLoaderCases}, publishParity=${metrics.publishParityRate ?? "n/a"}, materialDisagreement=${metrics.materialDisagreementRate ?? "n/a"}, knownEvidenceGaps=${metrics.knownEvidenceGapCount}, likelyIssues=${metrics.likelyIssueCount}`,
      ]),
    "",
    "## ODL Shadow Signals",
    "",
    `- ODL-only blocking reasons: ${Object.entries(run.summary.openDataLoaderBlockingReasonCounts).sort((left, right) => right[1] - left[1]).map(([reason, count]) => `${reason}=${count}`).join(", ") || "none"}`,
    `- Missing ODL canonical facts: ${Object.entries(run.summary.missingCanonicalFactCounts).sort((left, right) => right[1] - left[1]).map(([metricKey, count]) => `${metricKey}=${count}`).join(", ") || "none"}`,
    "",
    "## Recommendation",
    "",
    `- ${run.summary.recommendation}`,
    `- Reason: ${run.summary.recommendationReason}`,
    "",
    "## Cases",
    "",
  ];

  run.cases.forEach((item) => {
    lines.push(`### ${item.caseId}`);
    lines.push("");
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Mode: ${item.mode}`);
    lines.push(`- Evidence: ${item.evidenceKind}`);
    lines.push(`- Tags: ${item.documentTags.join(", ") || "none"}`);
    if (item.legacy) {
      lines.push(
        `- Legacy: ${item.legacy.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW"}, runtime ${item.legacy.runtimeMs} ms`,
      );
    }
    if (item.openDataLoader) {
      lines.push(
        `- OpenDataLoader: ${item.openDataLoader.shouldPublish ? "PUBLISHED" : "MANUAL_REVIEW"}, runtime ${item.openDataLoader.runtimeMs} ms, source ${item.openDataLoader.executionSource}`,
      );
    }
    if (item.comparison) {
      lines.push(
        `- Comparison: disagreement=${item.comparison.materialDisagreement}, publishMismatch=${item.comparison.publishDecisionMismatch}`,
      );
    }
    if (item.comparisonAssessment) {
      lines.push(`- Comparison assessment: ${item.comparisonAssessment.classification} (${item.comparisonAssessment.summary})`);
    }
    if (item.divergenceSummary) {
      lines.push(`- First divergence: ${item.divergenceSummary.firstDivergenceStage}`);
      lines.push(`- Divergence summary: ${item.divergenceSummary.summary}`);
      lines.push(
        `- Statement pages: legacy=${item.divergenceSummary.legacyStatementPages.map((page) => `${page.pageNumber}:${page.type}`).join(", ") || "none"}; opendataloader=${item.divergenceSummary.openDataLoaderStatementPages.map((page) => `${page.pageNumber}:${page.type}`).join(", ") || "none"}`,
      );
      lines.push(
        `- Note pages: legacy=${item.divergenceSummary.legacyNotePages.join(", ") || "none"}; opendataloader=${item.divergenceSummary.openDataLoaderNotePages.join(", ") || "none"}`,
      );
      if (item.divergenceSummary.pageClassificationDifferences.length > 0) {
        lines.push(
          `- Page classification/unit diffs: ${item.divergenceSummary.pageClassificationDifferences
            .map(
              (diff) =>
                `page ${diff.pageNumber} legacy=${diff.legacyType ?? "none"}/scale=${diff.legacyUnitScale ?? "unknown"} opendataloader=${diff.openDataLoaderType ?? "none"}/scale=${diff.openDataLoaderUnitScale ?? "unknown"} (${diff.evidenceComparison})`,
            )
            .join(" | ")}`,
        );
      }
      const missingFacts = item.divergenceSummary.missingCanonicalFactsOnOpenDataLoader;
      if (missingFacts.length > 0) {
        lines.push(`- Missing ODL facts: ${missingFacts.join(", ")}`);
      }
      const uniqueIssues = item.divergenceSummary.validationIssuesOnlyOnOpenDataLoader;
      if (uniqueIssues.length > 0) {
        lines.push(`- Issues only on ODL: ${uniqueIssues.join(", ")}`);
      }
      const blockingReasons = item.divergenceSummary.blockingReasonsOnOpenDataLoader;
      if (blockingReasons.length > 0) {
        lines.push(`- ODL blocking reasons: ${blockingReasons.join(", ")}`);
      }
    }
    if (item.knownEvidenceLimitations.length > 0) {
      lines.push(`- Known evidence limitations: ${item.knownEvidenceLimitations.join(" | ")}`);
    }
    if (item.errors.length > 0) {
      lines.push(`- Errors: ${item.errors.join(" | ")}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}
