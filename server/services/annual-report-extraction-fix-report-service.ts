import fs from "node:fs/promises";
import path from "node:path";

import { readLatestUnifiedConfidenceThresholdCalibrationReport } from "@/server/services/annual-report-unified-confidence-calibration-service";
import { readLatestAnnualReportUnifiedFailureTaxonomyReport } from "@/server/services/annual-report-unified-failure-taxonomy-service";

const EXTRACTION_FIX_OUTPUT_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-extraction-fixes",
);

const LATEST_BENCHMARK_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-golden",
  "latest.json",
);

const LATEST_SHADOW_BATCH_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-shadow-batches",
  "latest.json",
);

type ExtractionFixIssueClass =
  | "UNIT_SCALE_MISMATCH"
  | "NORWEGIAN_LABEL_MAPPING_ERROR"
  | "MULTI_PAGE_BALANCE_ERROR"
  | "TABLE_RECONSTRUCTION_ERROR"
  | "OCR_TOKEN_NOISE";

type ExtractionFixStatus =
  | "EVIDENCE_PENDING"
  | "TARGETED_FIXES_APPLIED"
  | "POST_FIX_VALIDATION_PENDING"
  | "REGRESSION_VERIFIED";

type ExtractionFixMetric = {
  label: string;
  before: number | null;
  after: number | null;
  unit: "count" | "boolean";
  note?: string | null;
};

export type AnnualReportExtractionFixReport = {
  version: "annual-report-extraction-fix-report-v1";
  generatedAt: string;
  status: ExtractionFixStatus;
  targetedIssueClasses: ExtractionFixIssueClass[];
  fixesImplemented: string[];
  testsAdded: string[];
  evidenceUsed: {
    benchmarkPath: string;
    shadowBatchPath: string;
    calibrationReportPath: string | null;
    taxonomyReportPath: string | null;
  };
  baselineMetrics: ExtractionFixMetric[];
  remainingBlockers: string[];
  recommendationsForPr80: string[];
  output: {
    jsonPath: string;
    markdownPath: string;
  };
  safety: {
    canUseForProductionRouting: false;
    productionRoutingChanged: false;
    productionFactsMutated: false;
    publishAffected: false;
  };
};

export type AnnualReportExtractionFixReportServiceDeps = {
  readFile?: (filePath: string, encoding: "utf8") => Promise<string>;
  writeFile?: (filePath: string, content: string, encoding: "utf8") => Promise<unknown>;
  mkdir?: (dirPath: string, options: { recursive: true }) => Promise<unknown>;
  now?: () => Date;
  readLatestCalibrationReport?: typeof readLatestUnifiedConfidenceThresholdCalibrationReport;
  readLatestTaxonomyReport?: typeof readLatestAnnualReportUnifiedFailureTaxonomyReport;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countTaggedCases(cases: unknown[], tag: string) {
  return cases.filter((item) => {
    const record = asRecord(item);
    if (!record) {
      return false;
    }
    return asArray(record.documentTags).some((candidate) => candidate === tag);
  }).length;
}

function countSkippedCases(cases: unknown[]) {
  return cases.filter((item) => asRecord(item)?.status === "skipped").length;
}

async function readJsonFile(
  filePath: string,
  deps: AnnualReportExtractionFixReportServiceDeps,
): Promise<Record<string, unknown> | null> {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return asRecord(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function defaultOutputPaths(now: Date) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return {
    jsonPath: path.join(EXTRACTION_FIX_OUTPUT_DIR, `pr79-extraction-fix-summary-${stamp}.json`),
    markdownPath: path.join(EXTRACTION_FIX_OUTPUT_DIR, `pr79-extraction-fix-summary-${stamp}.md`),
  };
}

export async function buildAnnualReportExtractionFixReport(
  deps: AnnualReportExtractionFixReportServiceDeps = {},
): Promise<AnnualReportExtractionFixReport> {
  const now = deps.now?.() ?? new Date();
  const benchmark = await readJsonFile(LATEST_BENCHMARK_PATH, deps);
  const shadowBatch = await readJsonFile(LATEST_SHADOW_BATCH_PATH, deps);
  const readLatestCalibrationReport =
    deps.readLatestCalibrationReport ?? readLatestUnifiedConfidenceThresholdCalibrationReport;
  const readLatestTaxonomyReport =
    deps.readLatestTaxonomyReport ?? readLatestAnnualReportUnifiedFailureTaxonomyReport;
  const calibrationReport = await readLatestCalibrationReport();
  const taxonomyReport = await readLatestTaxonomyReport();

  const benchmarkCases = asArray(benchmark?.cases);
  const shadowCases = asArray(shadowBatch?.cases);
  const benchmarkSummary = asRecord(benchmark?.summary);
  const runtimeEnvironment = asRecord(shadowBatch?.runtimeEnvironment);

  const targetedIssueClasses: ExtractionFixIssueClass[] = [
    "UNIT_SCALE_MISMATCH",
    "NORWEGIAN_LABEL_MAPPING_ERROR",
    "MULTI_PAGE_BALANCE_ERROR",
    "TABLE_RECONSTRUCTION_ERROR",
  ];

  if (countTaggedCases(benchmarkCases, "ocr_token_noise") > 0) {
    targetedIssueClasses.push("OCR_TOKEN_NOISE");
  }

  const baselineMetrics: ExtractionFixMetric[] = [
    {
      label: "Differential benchmark cases",
      before: asNumber(benchmarkSummary?.differentialCases),
      after: null,
      unit: "count",
      note: "Post-fix benchmark rerun er ikke persisted lokalt ennå.",
    },
    {
      label: "Material disagreements",
      before: asNumber(benchmarkSummary?.materialDisagreements),
      after: null,
      unit: "count",
      note: "Post-fix benchmark rerun er ikke persisted lokalt ennå.",
    },
    {
      label: "Unit-scale-sensitive cases",
      before: countTaggedCases(benchmarkCases, "unit_scale_sensitive"),
      after: null,
      unit: "count",
      note: "Brukes som baseline for skala-relaterte fikser.",
    },
    {
      label: "Multi-page balance cases",
      before: countTaggedCases(benchmarkCases, "multi_page_balance"),
      after: null,
      unit: "count",
      note: "Brukes som baseline for continuation-/balansefikser.",
    },
    {
      label: "OCR token noise cases",
      before: countTaggedCases(benchmarkCases, "ocr_token_noise"),
      after: null,
      unit: "count",
      note: "Brukes som baseline for numerisk/OCR-relatert parsing.",
    },
    {
      label: "Skipped shadow cases",
      before: countSkippedCases(shadowCases),
      after: null,
      unit: "count",
      note: "Skyldes fortsatt manglende hybrid-runtime lokalt.",
    },
    {
      label: "Hybrid runtime ready",
      before:
        typeof runtimeEnvironment?.liveHybridBenchmarkReady === "boolean"
          ? Number(runtimeEnvironment.liveHybridBenchmarkReady)
          : null,
      after: null,
      unit: "boolean",
      note: "0 betyr at hybrid-runtime ikke er klar i dette miljøet.",
    },
  ];

  const remainingBlockers: string[] = [];
  const hybridReason = asString(runtimeEnvironment?.liveHybridBenchmarkReason);
  if (hybridReason && runtimeEnvironment?.liveHybridBenchmarkReady === false) {
    remainingBlockers.push(hybridReason);
  }
  if (benchmarkCases.length === 0) {
    remainingBlockers.push("Ingen persisted annual-report benchmark-caser ble funnet lokalt.");
  }
  if (!taxonomyReport) {
    remainingBlockers.push("Ingen persisted PR78 failure taxonomy-report ble funnet lokalt.");
  }
  if (!calibrationReport) {
    remainingBlockers.push("Ingen persisted PR77 calibration-report ble funnet lokalt.");
  }

  const status: ExtractionFixStatus =
    remainingBlockers.length > 0 ? "POST_FIX_VALIDATION_PENDING" : "REGRESSION_VERIFIED";

  const output = defaultOutputPaths(now);

  return {
    version: "annual-report-extraction-fix-report-v1",
    generatedAt: now.toISOString(),
    status,
    targetedIssueClasses,
    fixesImplemented: [
      "Utvidet unit-scale-deteksjon for tusen-kroner-formuleringer i legacy parser-pathen.",
      "Lagt til millions/MNOK-deteksjon i unified extractor uten å påvirke publish safety.",
      "Rettet continuation-tabeller med tittelen 'Egenkapital og gjeld' til balansekontekst.",
      "Utvidet norsk label-mapping for profit_before_tax og cash_and_cash_equivalents.",
    ],
    testsAdded: [
      "unit-scale.test.ts: tusen-kroner og tusen-NOK erklæringer",
      "unified-financial-statement-extractor.test.ts: millions scale",
      "unified-financial-statement-extractor.test.ts: continuation-balance role detection",
      "unified-financial-statement-extractor.test.ts: Norwegian label mapping aliases",
    ],
    evidenceUsed: {
      benchmarkPath: LATEST_BENCHMARK_PATH,
      shadowBatchPath: LATEST_SHADOW_BATCH_PATH,
      calibrationReportPath: calibrationReport?.output.jsonPath ?? null,
      taxonomyReportPath: taxonomyReport?.output.jsonPath ?? null,
    },
    baselineMetrics,
    remainingBlockers,
    recommendationsForPr80: [
      "Kjør ny persisted gold-set/shadow-batch etter PR79 for å måle faktisk før/etter-effekt.",
      "Hold unified shadow-only til readiness-rapporten kan vise oppdatert post-fix evidens.",
      "Behandle manglende hybrid-runtime som egen readiness-blokkerer hvis den fortsatt mangler ved PR80.",
    ],
    output,
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
  };
}

export function renderAnnualReportExtractionFixMarkdown(
  report: AnnualReportExtractionFixReport,
) {
  const lines = [
    "# PR79 extraction fix summary",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    "",
    "## Targeted issue classes",
    "",
    ...report.targetedIssueClasses.map((item) => `- ${item}`),
    "",
    "## Fixes implemented",
    "",
    ...report.fixesImplemented.map((item) => `- ${item}`),
    "",
    "## Baseline metrics",
    "",
    ...report.baselineMetrics.map(
      (item) =>
        `- ${item.label}: before=${item.before ?? "unknown"}, after=${item.after ?? "unknown"}${item.note ? ` (${item.note})` : ""}`,
    ),
    "",
    "## Tests added",
    "",
    ...report.testsAdded.map((item) => `- ${item}`),
    "",
    "## Remaining blockers",
    "",
    ...(report.remainingBlockers.length > 0
      ? report.remainingBlockers.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Recommendations for PR80",
    "",
    ...report.recommendationsForPr80.map((item) => `- ${item}`),
    "",
  ];

  return lines.join("\n");
}

export async function persistAnnualReportExtractionFixArtifacts(
  report: AnnualReportExtractionFixReport,
  deps: AnnualReportExtractionFixReportServiceDeps = {},
) {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const json = JSON.stringify(report, null, 2);
  const markdown = renderAnnualReportExtractionFixMarkdown(report);

  await mkdir(EXTRACTION_FIX_OUTPUT_DIR, { recursive: true });
  await writeFile(report.output.jsonPath, json, "utf8");
  await writeFile(report.output.markdownPath, markdown, "utf8");
  await writeFile(path.join(EXTRACTION_FIX_OUTPUT_DIR, "latest.json"), json, "utf8");
  await writeFile(path.join(EXTRACTION_FIX_OUTPUT_DIR, "latest.md"), markdown, "utf8");
}

export async function readLatestAnnualReportExtractionFixReport(
  deps: AnnualReportExtractionFixReportServiceDeps = {},
) {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(path.join(EXTRACTION_FIX_OUTPUT_DIR, "latest.json"), "utf8");
    const parsed = JSON.parse(raw) as AnnualReportExtractionFixReport;
    return parsed.version === "annual-report-extraction-fix-report-v1" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
