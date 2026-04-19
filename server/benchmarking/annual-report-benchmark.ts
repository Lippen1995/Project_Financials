import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
  PageClassification,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import { validateCanonicalFacts } from "@/integrations/brreg/annual-report-financials/validation";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import { buildOpenDataLoaderComparisonSummary } from "@/server/document-understanding/opendataloader-comparison";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import {
  OpenDataLoaderComparisonSummary,
  OpenDataLoaderPipelineSnapshot,
  OpenDataLoaderResolvedConfig,
} from "@/server/document-understanding/opendataloader-types";
import {
  convertNormalizedDocumentToPageTextLayers,
  normalizeOpenDataLoaderPayload,
} from "@/server/document-understanding/opendataloader-normalizer";

const execFileAsync = promisify(execFile);

export type BenchmarkExpected = {
  classificationTypes?: string[];
  unitScaleByPage?: Record<string, number | null>;
  factValues?: Partial<Record<CanonicalMetricKey, number>>;
  shouldPublish?: boolean;
  requiredIssueCodes?: string[];
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
  | { kind: "inline_ocr_pages"; pages: InlineOcrPage[] };

export type AnnualReportBenchmarkCase = {
  id: string;
  name: string;
  orgNumber?: string;
  fiscalYear: number;
  mode?: "expected" | "differential" | "expected_and_differential";
  notes?: string;
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

export type AnnualReportBenchmarkCaseResult = {
  caseId: string;
  name: string;
  fiscalYear: number;
  mode: "expected" | "differential" | "expected_and_differential";
  notes?: string;
  status: "completed" | "error";
  errors: string[];
  expected?: BenchmarkExpected;
  legacy?: BenchmarkPipelineResult & { expectedEvaluation?: BenchmarkExpectedEvaluation };
  openDataLoader?: BenchmarkPipelineResult & {
    expectedEvaluation?: BenchmarkExpectedEvaluation;
    routeReason?: string | null;
  };
  comparison?: OpenDataLoaderComparisonSummary | null;
};

export type AnnualReportBenchmarkRun = {
  generatedAt: string;
  cases: AnnualReportBenchmarkCaseResult[];
  runtimeEnvironment: {
    opendataloaderPackageVersion: string | null;
    javaVersion: string | null;
    javaMajorVersion: number | null;
    localOpenDataLoaderReady: boolean;
  };
  summary: {
    totalCases: number;
    completedCases: number;
    failedCases: number;
    differentialCases: number;
    disagreementCases: number;
    publishDecisionMismatchCases: number;
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
  pages: PageTextLayer[];
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
): Promise<{ result: BenchmarkPipelineResult; routeReason: string | null }> {
  if (source.kind === "captured_normalized_json") {
    const absolutePath = path.resolve(process.cwd(), source.path);
    const payload = JSON.parse(await fs.readFile(absolutePath, "utf8"));
    const startedAt = Date.now();
    const normalized = normalizeOpenDataLoaderPayload({
      payload,
      hasEmbeddedText: source.hasEmbeddedText ?? true,
    });
    const pages = convertNormalizedDocumentToPageTextLayers(normalized);
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

  const absolutePath = path.resolve(process.cwd(), source.path);
  const pdfBuffer = await fs.readFile(absolutePath);
  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  const parsed = await parseAnnualReportPdfWithOpenDataLoader({
    pdfBuffer,
    sourceFilename: path.basename(absolutePath),
    preflight,
    config: withDefaultOpenDataLoaderConfig(source.config),
  });

  return {
    result: runPipelineFromPages({
      fiscalYear,
      pages: parsed.pageTextLayers,
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

async function readOpenDataLoaderPackageVersion() {
  try {
    const packageJsonPath = path.join(
      process.cwd(),
      "node_modules",
      "@opendataloader",
      "pdf",
      "package.json",
    );
    const parsed = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

function parseJavaMajorVersion(output: string) {
  const match = output.match(/version "(?<version>[^"]+)"/);
  const version = match?.groups?.version ?? null;
  if (!version) {
    return { version: null, major: null };
  }

  if (version.startsWith("1.")) {
    const legacyMajor = Number(version.split(".")[1]);
    return {
      version,
      major: Number.isFinite(legacyMajor) ? legacyMajor : null,
    };
  }

  const major = Number(version.split(".")[0]);
  return {
    version,
    major: Number.isFinite(major) ? major : null,
  };
}

export async function inspectOpenDataLoaderRuntime() {
  const packageVersion = await readOpenDataLoaderPackageVersion();

  try {
    const { stdout, stderr } = await execFileAsync("java", ["-version"]);
    const rawOutput = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
    const java = parseJavaMajorVersion(rawOutput);
    return {
      opendataloaderPackageVersion: packageVersion,
      javaVersion: java.version,
      javaMajorVersion: java.major,
      localOpenDataLoaderReady: Boolean(java.major && java.major >= 11),
    };
  } catch {
    return {
      opendataloaderPackageVersion: packageVersion,
      javaVersion: null,
      javaMajorVersion: null,
      localOpenDataLoaderReady: false,
    };
  }
}

export async function loadAnnualReportBenchmarkCases(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (filename) => {
      const absolutePath = path.join(directory, filename);
      return JSON.parse(await fs.readFile(absolutePath, "utf8")) as AnnualReportBenchmarkCase;
    }),
  );
}

export async function runAnnualReportBenchmarkCase(
  benchmarkCase: AnnualReportBenchmarkCase,
): Promise<AnnualReportBenchmarkCaseResult> {
  const result: AnnualReportBenchmarkCaseResult = {
    caseId: benchmarkCase.id,
    name: benchmarkCase.name,
    fiscalYear: benchmarkCase.fiscalYear,
    mode: benchmarkCase.mode ?? "expected",
    notes: benchmarkCase.notes,
    status: "completed",
    errors: [],
    expected: benchmarkCase.expected,
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
    }
  } catch (error) {
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
    (item) => item.openDataLoader?.executionSource === "live_pdf",
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

  if (disagreementCases.length > 0) {
    return {
      recommendation: "keep legacy as default, OpenDataLoader shadow-only",
      recommendationReason:
        "Det finnes materielle uenigheter mellom legacy og OpenDataLoader på benchmarksettet. Inntil disse er forklart, bør OpenDataLoader ikke få publiseringsansvar.",
    };
  }

  return {
    recommendation: "use OpenDataLoader only as fallback for hard PDFs",
    recommendationReason:
      "Benchmarken viser ingen materielle uenigheter på de live-kjørte sakene, men evidensgrunnlaget er fortsatt for smalt til å gjøre den til bred default-kilde.",
    };
}

export function summarizeAnnualReportBenchmarkRun(input: {
  cases: AnnualReportBenchmarkCaseResult[];
  runtimeEnvironment: AnnualReportBenchmarkRun["runtimeEnvironment"];
}) {
  const completed = input.cases.filter((item) => item.status === "completed");
  const failed = input.cases.filter((item) => item.status === "error");
  const differentialCases = completed.filter((item) => item.comparison);
  const disagreementCases = differentialCases.filter(
    (item) => item.comparison?.materialDisagreement,
  );
  const publishDecisionMismatchCases = differentialCases.filter(
    (item) => item.comparison?.publishDecisionMismatch,
  );

  const recommendation = buildRecommendation(input);

  return {
    totalCases: input.cases.length,
    completedCases: completed.length,
    failedCases: failed.length,
    differentialCases: differentialCases.length,
    disagreementCases: disagreementCases.length,
    publishDecisionMismatchCases: publishDecisionMismatchCases.length,
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
    "",
    "## Summary",
    "",
    `- Cases: ${run.summary.completedCases}/${run.summary.totalCases} completed`,
    `- Differential cases: ${run.summary.differentialCases}`,
    `- Material disagreements: ${run.summary.disagreementCases}`,
    `- Publish-decision mismatches: ${run.summary.publishDecisionMismatchCases}`,
    `- Legacy average runtime (ms): ${run.summary.averageRuntimeMs.legacy ?? "n/a"}`,
    `- OpenDataLoader average runtime (ms): ${run.summary.averageRuntimeMs.opendataloader ?? "n/a"}`,
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
    if (item.errors.length > 0) {
      lines.push(`- Errors: ${item.errors.join(" | ")}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}
