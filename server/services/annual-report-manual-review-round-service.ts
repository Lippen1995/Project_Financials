import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  AnnualReportArtifactType,
  PdfModelArtifactKind,
  PdfModelArtifactStatus,
  type AnnualReportArtifact,
} from "@prisma/client";

import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import { getAnnualReportFilingWithArtifacts } from "@/server/persistence/annual-report-ingestion-repository";
import type {
  UnifiedConfidenceComparisonFact,
  UnifiedConfidenceFilingDrilldown,
} from "@/server/services/annual-report-unified-confidence-drilldown-service";
import { getUnifiedConfidenceFilingDrilldownForAdmin } from "@/server/services/annual-report-unified-confidence-drilldown-service";

const GOLD_SET_SHADOW_RUN_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-gold-set-shadow-runs",
);

const MANUAL_REVIEW_OUTPUT_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-manual-review-rounds",
);

const PRIORITY_CANONICAL_KEYS = [
  "revenue",
  "operating_result",
  "net_income",
  "total_assets",
  "total_equity",
  "total_liabilities",
  "cash_and_cash_equivalents",
] as const;

const TAG_TRIGGER_SET = new Set([
  "manual_review_expected",
  "degraded_ambiguous",
  "ocr_token_noise",
  "continuation_complex",
  "unit_scale_sensitive",
  "formatting_edge",
  "scan_or_ocr",
]);
const PRIORITY_CANONICAL_KEY_SET = new Set<string>(PRIORITY_CANONICAL_KEYS);

const REVIEW_DECISION_VALUES = [
  "LEGACY_CORRECT",
  "UNIFIED_CORRECT",
  "BOTH_CORRECT",
  "BOTH_WRONG",
  "AMBIGUOUS",
  "NEEDS_EXTRACTION_FIX",
  "BLOCK_PUBLISH",
] as const;

const CANDIDATE_STATUS_VALUES = ["PENDING", "REVIEWED", "BLOCKED"] as const;
const CANDIDATE_SEVERITY_VALUES = ["HIGH", "MEDIUM", "LOW"] as const;

export type AnnualReportManualReviewDecisionValue = (typeof REVIEW_DECISION_VALUES)[number];
export type AnnualReportManualReviewCandidateStatus = (typeof CANDIDATE_STATUS_VALUES)[number];
export type AnnualReportManualReviewSeverity = (typeof CANDIDATE_SEVERITY_VALUES)[number];

export type AnnualReportManualReviewArtifactRef = {
  key:
    | "source_pdf"
    | "preflight_artifact"
    | "structured_document_json"
    | "legacy_extraction"
    | "unified_extraction"
    | "shadow_comparison_output"
    | "confidence_gate_output";
  label: string;
  status: "available" | "missing" | "unavailable";
  artifactId: string | null;
  storageKey: string | null;
  artifactType: AnnualReportArtifactType | null;
  kind: PdfModelArtifactKind | null;
  href: string | null;
  note: string | null;
};

export type AnnualReportManualReviewDecision = {
  candidateId: string;
  runId: string;
  filingId: string;
  decision: AnnualReportManualReviewDecisionValue;
  issueClasses: string[];
  reviewerNotes: string | null;
  reviewedBy: string;
  reviewedByRole: "ADMIN" | "FINANCIAL_REVIEWER";
  reviewedAt: string;
  severityOverride: AnnualReportManualReviewSeverity | null;
};

export type AnnualReportManualReviewCandidate = {
  candidateId: string;
  reviewRoundId: string;
  runId: string;
  orgNumber: string | null;
  companyName: string | null;
  accountingYear: number | null;
  filingId: string;
  reportId: string | null;
  documentRef: string | null;
  tags: string[];
  evidenceType: string | null;
  evidenceQuality: string | null;
  confidenceGateResult: "PASS" | "WARN" | "FAIL" | "INSUFFICIENT_DATA" | null;
  comparisonResult: {
    mismatchCount: number;
    narrativeMismatchCount: number;
    exactMatchCount: number | null;
    matchRate: number | null;
  };
  firstDivergenceStage: string | null;
  severity: AnnualReportManualReviewSeverity;
  reviewReasons: string[];
  issueClasses: string[];
  financialComparisons: Array<
    UnifiedConfidenceComparisonFact & {
      legacyLabel: string | null;
      unifiedLabel: string | null;
      legacyUnitScale: number | null;
      unifiedUnitScale: string | null;
      reviewRequired: boolean;
    }
  >;
  narrativeComparisons: Array<Record<string, unknown>>;
  artifactRefs: AnnualReportManualReviewArtifactRef[];
  confidenceGateDiagnostics: Array<{
    checkCode: string;
    verdict: string;
    message: string;
  }>;
  parserOrEvidence: string;
  status: AnnualReportManualReviewCandidateStatus;
  updatedAt: string | null;
  latestDecision: AnnualReportManualReviewDecision | null;
  diagnostics: string[];
};

export type AnnualReportManualReviewRoundSummary = {
  totalFilings: number;
  reviewCandidateCount: number;
  reviewedCount: number;
  pendingCount: number;
  blockedCount: number;
  severityCounts: Record<AnnualReportManualReviewSeverity, number>;
  issueClassCounts: Record<string, number>;
  tagCoverage: Record<string, number>;
  evidenceQualitySummary: Record<string, number>;
  topFailingCanonicalFinancialKeys: Array<{ canonicalKey: string; count: number }>;
  topDivergenceStages: Array<{ stage: string; count: number }>;
  missingArtifactCounts: Record<string, number>;
  narrativeMismatchCount: number;
  unitScaleAmbiguityCount: number;
};

export type AnnualReportManualReviewRound = {
  version: "annual-report-manual-review-round-v1";
  reviewRoundId: string;
  generatedAt: string;
  sourceRun: {
    runId: string;
    generatedAt: string;
    manifestName: string;
    manifestHash: string;
    gitCommitSha: string | null;
  };
  summary: AnnualReportManualReviewRoundSummary;
  candidates: AnnualReportManualReviewCandidate[];
  decisions: AnnualReportManualReviewDecision[];
  diagnostics: string[];
  recommendedNextActions: {
    pr77Calibration: string[];
    pr78FailureTaxonomy: string[];
    pr79ExtractionFixes: string[];
  };
};

export type BuildAnnualReportManualReviewRoundInput = {
  runId?: string;
  latest?: boolean;
};

export type ListAnnualReportManualReviewCandidatesInput = {
  runId?: string;
  status?: AnnualReportManualReviewCandidateStatus[];
  severity?: AnnualReportManualReviewSeverity[];
  tag?: string[];
  issueClass?: string[];
  accountingYear?: number;
  search?: string;
  goldSetOnly?: boolean;
  highSeverityOnly?: boolean;
};

export type SaveAnnualReportManualReviewDecisionInput = {
  runId: string;
  candidateId: string;
  decision: AnnualReportManualReviewDecisionValue;
  issueClasses: string[];
  reviewerNotes?: string | null;
  reviewedBy: string;
  reviewedByRole: "ADMIN" | "FINANCIAL_REVIEWER";
  severityOverride?: AnnualReportManualReviewSeverity | null;
};

export type AnnualReportManualReviewRoundServiceDeps = {
  readDir?: typeof fs.readdir;
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
  mkdir?: typeof fs.mkdir;
  getDrilldown?: typeof getUnifiedConfidenceFilingDrilldownForAdmin;
  getFiling?: typeof getAnnualReportFilingWithArtifacts;
  now?: () => Date;
};

type FilingRecord = NonNullable<Awaited<ReturnType<typeof getAnnualReportFilingWithArtifacts>>>;

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

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function uniqueStrings(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter((value) => value.trim().length > 0)));
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function sortCountEntries(input: Record<string, number>, keyName: "count", labelName: string) {
  return Object.entries(input)
    .map(([label, count]) => ({ [labelName]: label, [keyName]: count }) as Record<string, string | number>)
    .sort((left, right) => Number(right[keyName]) - Number(left[keyName]) || String(left[labelName]).localeCompare(String(right[labelName])));
}

function isDecisionValue(value: string): value is AnnualReportManualReviewDecisionValue {
  return (REVIEW_DECISION_VALUES as readonly string[]).includes(value);
}

function isSeverityValue(value: string): value is AnnualReportManualReviewSeverity {
  return (CANDIDATE_SEVERITY_VALUES as readonly string[]).includes(value);
}

function createCandidateId(runId: string, filingId: string) {
  return crypto.createHash("sha1").update(`${runId}:${filingId}`).digest("hex").slice(0, 16);
}

function artifactApiHref(artifactId: string | null) {
  return artifactId ? `/api/admin/pdf-model-artifacts/${artifactId}` : null;
}

async function readShadowRunByRunId(
  runId: string,
  deps: AnnualReportManualReviewRoundServiceDeps,
): Promise<AnnualReportGoldSetShadowRun | null> {
  const readDir = deps.readDir ?? fs.readdir;
  const readFile = deps.readFile ?? fs.readFile;
  const files = await readDir(GOLD_SET_SHADOW_RUN_DIR);
  const jsonFiles = files.filter((file) => file.endsWith(".json") && file !== "latest.json");

  for (const file of jsonFiles) {
    const raw = await readFile(path.join(GOLD_SET_SHADOW_RUN_DIR, file), "utf8");
    const parsed = safeParseJson<AnnualReportGoldSetShadowRun>(raw);
    if (parsed?.version === "annual-report-gold-set-shadow-run-v1" && parsed.runId === runId) {
      return parsed;
    }
  }

  return null;
}

async function readLatestShadowRun(
  deps: AnnualReportManualReviewRoundServiceDeps,
): Promise<AnnualReportGoldSetShadowRun | null> {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(path.join(GOLD_SET_SHADOW_RUN_DIR, "latest.json"), "utf8");
    const parsed = safeParseJson<AnnualReportGoldSetShadowRun>(raw);
    return parsed?.version === "annual-report-gold-set-shadow-run-v1" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function decisionFilePath(runId: string) {
  return path.join(MANUAL_REVIEW_OUTPUT_DIR, `${runId}.decisions.json`);
}

function roundJsonPath(runId: string) {
  return path.join(MANUAL_REVIEW_OUTPUT_DIR, `${runId}.json`);
}

function roundMarkdownPath(runId: string) {
  return path.join(MANUAL_REVIEW_OUTPUT_DIR, `${runId}.md`);
}

async function readPersistedDecisions(
  runId: string,
  deps: AnnualReportManualReviewRoundServiceDeps,
): Promise<AnnualReportManualReviewDecision[]> {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(decisionFilePath(runId), "utf8");
    const parsed = safeParseJson<AnnualReportManualReviewDecision[]>(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) =>
      item &&
      typeof item === "object" &&
      typeof item.candidateId === "string" &&
      typeof item.filingId === "string" &&
      typeof item.runId === "string" &&
      isDecisionValue(String(item.decision)) &&
      typeof item.reviewedBy === "string" &&
      typeof item.reviewedAt === "string",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writePersistedDecisions(
  runId: string,
  decisions: AnnualReportManualReviewDecision[],
  deps: AnnualReportManualReviewRoundServiceDeps,
) {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  await mkdir(MANUAL_REVIEW_OUTPUT_DIR, { recursive: true });
  await writeFile(decisionFilePath(runId), JSON.stringify(decisions, null, 2), "utf8");
}

function latestDecisionByCandidate(decisions: AnnualReportManualReviewDecision[]) {
  const map = new Map<string, AnnualReportManualReviewDecision>();

  for (const decision of decisions) {
    const existing = map.get(decision.candidateId);
    if (!existing || existing.reviewedAt < decision.reviewedAt) {
      map.set(decision.candidateId, decision);
    }
  }

  return map;
}

function findAnnualReportArtifact(
  filing: FilingRecord | null,
  artifactType: AnnualReportArtifactType,
): AnnualReportArtifact | null {
  if (!filing) {
    return null;
  }

  return (
    filing.artifacts.find((artifact) => artifact.artifactType === artifactType) ?? null
  );
}

function buildArtifactRefs(
  filing: FilingRecord | null,
  drilldown: UnifiedConfidenceFilingDrilldown | null,
  shadowCase: AnnualReportGoldSetShadowRun["batch"]["cases"][number],
): AnnualReportManualReviewArtifactRef[] {
  const sourcePdf = findAnnualReportArtifact(filing, AnnualReportArtifactType.PDF);
  const preflight = findAnnualReportArtifact(filing, AnnualReportArtifactType.PREFLIGHT_JSON);
  const structuredDocument = findAnnualReportArtifact(
    filing,
    AnnualReportArtifactType.STRUCTURED_DOCUMENT_JSON,
  );
  const parserDocumentArtifact = drilldown?.artifacts.parserDocument;
  const legacyExtraction = findAnnualReportArtifact(filing, AnnualReportArtifactType.EXTRACTION_JSON);

  const financialArtifact = drilldown?.artifacts.financialExtraction;
  const narrativeArtifact = drilldown?.artifacts.narrativeExtraction;
  const comparisonArtifact = drilldown?.artifacts.comparison;
  const confidenceArtifact = drilldown?.artifacts.confidenceGate;

  const unifiedAvailableArtifact =
    financialArtifact?.artifactId !== null
      ? financialArtifact
      : narrativeArtifact?.artifactId !== null
        ? narrativeArtifact
        : null;

  const sourcePdfHref = filing?.sourceUrl ?? null;

  return [
    {
      key: "source_pdf",
      label: "Source PDF",
      status: sourcePdf ? "available" : filing?.sourceUrl ? "available" : "missing",
      artifactId: sourcePdf?.id ?? null,
      storageKey: sourcePdf?.storageKey ?? filing?.sourceUrl ?? null,
      artifactType: sourcePdf?.artifactType ?? null,
      kind: null,
      href: sourcePdfHref,
      note: sourcePdf ? null : filing?.sourceUrl ? "Only source URL available." : "Source PDF missing.",
    },
    {
      key: "preflight_artifact",
      label: "Preflight artifact",
      status: preflight ? "available" : "missing",
      artifactId: preflight?.id ?? null,
      storageKey: preflight?.storageKey ?? null,
      artifactType: preflight?.artifactType ?? null,
      kind: null,
      href: null,
      note: preflight ? null : "No persisted preflight artifact found.",
    },
    {
      key: "structured_document_json",
      label: "Structured document JSON",
      status:
        structuredDocument || parserDocumentArtifact?.status === "available"
          ? "available"
          : parserDocumentArtifact?.status === "missing"
            ? "missing"
            : "missing",
      artifactId: structuredDocument?.id ?? parserDocumentArtifact?.artifactId ?? null,
      storageKey: structuredDocument?.storageKey ?? null,
      artifactType: structuredDocument?.artifactType ?? null,
      kind:
        structuredDocument !== null
          ? null
          : parserDocumentArtifact?.artifactId !== null
            ? PdfModelArtifactKind.UNIFIED_PARSER_DOCUMENT
            : null,
      href:
        structuredDocument !== null
          ? null
          : artifactApiHref(parserDocumentArtifact?.artifactId ?? null),
      note:
        structuredDocument
          ? null
          : parserDocumentArtifact?.issues.join(" ") ||
            (parserDocumentArtifact?.status === "available"
              ? "Structured document is available via persisted unified parser artifact."
              : "Structured document artifact missing."),
    },
    {
      key: "legacy_extraction",
      label: "Legacy extraction",
      status:
        legacyExtraction || shadowCase.legacyCandidateSet.classification === "real_legacy_candidate"
          ? "available"
          : shadowCase.legacyCandidateSet.classification === "unavailable_candidate"
            ? "missing"
            : "unavailable",
      artifactId: legacyExtraction?.id ?? null,
      storageKey:
        legacyExtraction?.storageKey ??
        shadowCase.legacyCandidateSet.provenance.sourceArtifactReference ??
        shadowCase.legacyCandidateSet.provenance.sourceDocumentReference ??
        null,
      artifactType: legacyExtraction?.artifactType ?? null,
      kind: null,
      href: null,
      note:
        shadowCase.legacyCandidateSet.classification === "fixture_candidate"
          ? "Loaded from fixture for evaluation only."
          : shadowCase.legacyCandidateSet.classification === "unavailable_candidate"
            ? "Legacy candidate unavailable."
            : null,
    },
    {
      key: "unified_extraction",
      label: "Unified extraction",
      status: unifiedAvailableArtifact?.status === "available" ? "available" : unifiedAvailableArtifact?.status === "missing" ? "missing" : "unavailable",
      artifactId: unifiedAvailableArtifact?.artifactId ?? null,
      storageKey: null,
      artifactType: null,
      kind:
        financialArtifact?.artifactId !== null
          ? PdfModelArtifactKind.UNIFIED_FINANCIAL_EXTRACTION
          : narrativeArtifact?.artifactId !== null
            ? PdfModelArtifactKind.UNIFIED_NARRATIVE_EXTRACTION
            : null,
      href: artifactApiHref(unifiedAvailableArtifact?.artifactId ?? null),
      note:
        unifiedAvailableArtifact?.issues.join(" ") ||
        (unifiedAvailableArtifact ? null : "No unified extraction artifact found."),
    },
    {
      key: "shadow_comparison_output",
      label: "Shadow comparison output",
      status: comparisonArtifact?.status === "available" ? "available" : comparisonArtifact?.status === "missing" ? "missing" : "unavailable",
      artifactId: comparisonArtifact?.artifactId ?? null,
      storageKey: null,
      artifactType: null,
      kind: PdfModelArtifactKind.LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON,
      href: artifactApiHref(comparisonArtifact?.artifactId ?? null),
      note: comparisonArtifact?.issues.join(" ") || null,
    },
    {
      key: "confidence_gate_output",
      label: "Confidence gate output",
      status: confidenceArtifact?.status === "available" ? "available" : confidenceArtifact?.status === "missing" ? "missing" : "unavailable",
      artifactId: confidenceArtifact?.artifactId ?? null,
      storageKey: null,
      artifactType: null,
      kind: PdfModelArtifactKind.UNIFIED_EXTRACTION_CONFIDENCE_GATE,
      href: artifactApiHref(confidenceArtifact?.artifactId ?? null),
      note: confidenceArtifact?.issues.join(" ") || null,
    },
  ];
}

function computeComparisonResult(drilldown: UnifiedConfidenceFilingDrilldown | null) {
  const summary = asRecord(drilldown?.artifacts.comparison.data?.summary);
  const narrativeComparisons = drilldown?.artifacts.comparison.data?.narrativeComparisons ?? [];
  const financialComparisons = drilldown?.artifacts.comparison.data?.financialComparisons ?? [];
  const mismatchCount = drilldown?.artifacts.comparison.data?.mismatches.length ?? 0;
  const exactMatchCount = asNumber(summary.financialExactMatchCount);
  const compared = asNumber(summary.financialTotalCompared);

  const narrativeMismatchCount = narrativeComparisons.filter((item) => {
    const legacyFound = item.legacyFound === true;
    const unifiedFound = item.unifiedFound === true;
    const similarity = asNumber(item.textSimilarity);
    return legacyFound !== unifiedFound || (similarity !== null && similarity < 0.8);
  }).length;

  return {
    mismatchCount,
    narrativeMismatchCount,
    exactMatchCount,
    matchRate:
      compared !== null && compared > 0 && exactMatchCount !== null
        ? exactMatchCount / compared
        : null,
    financialComparisons,
    narrativeComparisons,
  };
}

function classifyIssueClasses(input: {
  shadowCase: AnnualReportGoldSetShadowRun["batch"]["cases"][number];
  drilldown: UnifiedConfidenceFilingDrilldown | null;
  comparisonResult: ReturnType<typeof computeComparisonResult>;
  artifactRefs: AnnualReportManualReviewArtifactRef[];
}) {
  const issueClasses = new Set<string>();
  const reviewReasons: string[] = [];

  if (input.shadowCase.gateSummary.overallVerdict === "FAIL") {
    issueClasses.add("confidence_gate_fail");
    reviewReasons.push("Confidence gate vurderte rapporten som FAIL.");
  } else if (input.shadowCase.gateSummary.overallVerdict === "WARN") {
    issueClasses.add("confidence_gate_review");
    reviewReasons.push("Confidence gate anbefalte review.");
  }

  if (input.shadowCase.shadow?.summary.comparisonMismatchCount && input.shadowCase.shadow.summary.comparisonMismatchCount > 0) {
    issueClasses.add("shadow_comparison_mismatch");
    reviewReasons.push("Legacy og unified har mismatch i shadow-sammenligningen.");
  }

  if (input.shadowCase.legacyCandidateSet.classification === "unavailable_candidate") {
    issueClasses.add("missing_legacy_result");
    reviewReasons.push("Legacy-resultat mangler for denne rapporten.");
  }

  if (
    !input.drilldown ||
    input.drilldown.artifacts.financialExtraction.status !== "available"
  ) {
    issueClasses.add("missing_unified_result");
    reviewReasons.push("Unified-resultat mangler eller kunne ikke leses.");
  }

  if (input.shadowCase.status === "skipped" || input.shadowCase.status === "error") {
    issueClasses.add("artifact_or_runtime_blocker");
    reviewReasons.push("Kjøringen ble hoppet over eller stoppet på grunn av artifact/runtime/parser-problem.");
  }

  if (input.artifactRefs.some((ref) => ref.key === "structured_document_json" && ref.status !== "available")) {
    issueClasses.add("missing_structured_document");
    reviewReasons.push("Strukturert dokument-artifact mangler.");
  }

  const comparisonData = input.drilldown?.artifacts.comparison.data;
  const ambiguousUnitScale = comparisonData?.financialComparisons.some(
    (item) => item.match === "LOW_CONFIDENCE_AMBIGUOUS",
  ) ?? false;
  const gateHasUnitIssue = [
    ...input.shadowCase.gateSummary.blockingCheckCodes,
    ...input.shadowCase.gateSummary.warningCheckCodes,
  ].some((code) => code.includes("UNIT"));
  if (ambiguousUnitScale || gateHasUnitIssue) {
    issueClasses.add("unit_scale_ambiguity");
    reviewReasons.push("Enhetsskala ser ut til å være uklar eller tvetydig.");
  }

  const largeDeviation = comparisonData?.mismatches.some(
    (item) => item.relativeDeviation !== null && item.relativeDeviation >= 0.2,
  ) ?? false;
  if (largeDeviation) {
    issueClasses.add("large_relative_deviation");
    reviewReasons.push("Minst ett nøkkeltall har stort relativt avvik.");
  }

  const keyProblems = comparisonData?.financialComparisons.filter((item) =>
    PRIORITY_CANONICAL_KEY_SET.has(item.canonicalKey) &&
    (item.match === "CONFLICTING_VALUES" ||
      item.match === "MISSING_IN_LEGACY" ||
      item.match === "MISSING_IN_UNIFIED"),
  ) ?? [];
  if (keyProblems.length > 0) {
    issueClasses.add("norwegian_statement_line_item_conflict");
    reviewReasons.push("Viktige norske regnskapslinjer mangler eller er i konflikt.");
  }

  if (input.comparisonResult.narrativeMismatchCount > 0) {
    issueClasses.add("narrative_mismatch");
    reviewReasons.push("Styrets eller revisors tekst samsvarer ikke godt nok.");
  }

  for (const tag of input.shadowCase.tagHints) {
    if (TAG_TRIGGER_SET.has(tag)) {
      issueClasses.add(`tag:${tag}`);
      reviewReasons.push(`Gold-set-taggen "${tag}" tilsier manuell kontroll.`);
    }
  }

  for (const artifactRef of input.artifactRefs) {
    if (artifactRef.status !== "available") {
      issueClasses.add(`missing_artifact:${artifactRef.key}`);
    }
  }

  for (const diagnostic of input.shadowCase.legacyCandidateSet.diagnostics) {
    reviewReasons.push(diagnostic.message);
  }

  return {
    issueClasses: uniqueStrings(issueClasses),
    reviewReasons: uniqueStrings(reviewReasons),
  };
}

function classifySeverity(input: {
  gateResult: AnnualReportManualReviewCandidate["confidenceGateResult"];
  issueClasses: string[];
  comparisonResult: ReturnType<typeof computeComparisonResult>;
  artifactRefs: AnnualReportManualReviewArtifactRef[];
}) {
  const missingCriticalArtifact = input.artifactRefs.some(
    (artifact) =>
      artifact.key !== "preflight_artifact" &&
      artifact.status !== "available",
  );
  if (
    input.gateResult === "FAIL" ||
    input.issueClasses.includes("missing_legacy_result") ||
    input.issueClasses.includes("artifact_or_runtime_blocker") ||
    input.issueClasses.includes("large_relative_deviation") ||
    input.issueClasses.includes("norwegian_statement_line_item_conflict") ||
    missingCriticalArtifact
  ) {
    return "HIGH" satisfies AnnualReportManualReviewSeverity;
  }

  if (
    input.gateResult === "WARN" ||
    input.comparisonResult.mismatchCount > 0 ||
    input.comparisonResult.narrativeMismatchCount > 0 ||
    input.issueClasses.some((item) => item.startsWith("tag:"))
  ) {
    return "MEDIUM" satisfies AnnualReportManualReviewSeverity;
  }

  return "LOW" satisfies AnnualReportManualReviewSeverity;
}

function requiresReview(
  shadowCase: AnnualReportGoldSetShadowRun["batch"]["cases"][number],
  comparisonResult: ReturnType<typeof computeComparisonResult>,
  artifactRefs: AnnualReportManualReviewArtifactRef[],
): boolean {
  if (
    shadowCase.gateSummary.overallVerdict === "FAIL" ||
    shadowCase.gateSummary.overallVerdict === "WARN"
  ) {
    return true;
  }

  if (
    shadowCase.legacyCandidateSet.classification === "unavailable_candidate" ||
    shadowCase.legacyCandidateSet.classification === "malformed_candidate"
  ) {
    return true;
  }

  if (shadowCase.status === "skipped" || shadowCase.status === "error") {
    return true;
  }

  if (comparisonResult.mismatchCount > 0 || comparisonResult.narrativeMismatchCount > 0) {
    return true;
  }

  if (artifactRefs.some((artifact) => artifact.status !== "available")) {
    return true;
  }

  return shadowCase.tagHints.some((tag) => TAG_TRIGGER_SET.has(tag));
}

function determineFirstDivergenceStage(input: {
  shadowCase: AnnualReportGoldSetShadowRun["batch"]["cases"][number];
  artifactRefs: AnnualReportManualReviewArtifactRef[];
  issueClasses: string[];
}) {
  if (input.artifactRefs.find((ref) => ref.key === "source_pdf" && ref.status !== "available")) {
    return "source_pdf";
  }
  if (input.artifactRefs.find((ref) => ref.key === "structured_document_json" && ref.status !== "available")) {
    return "structured_document";
  }
  if (input.issueClasses.includes("artifact_or_runtime_blocker")) {
    return "parser_runtime";
  }
  if (input.issueClasses.includes("unit_scale_ambiguity")) {
    return "unit_scale";
  }
  if (input.issueClasses.includes("norwegian_statement_line_item_conflict")) {
    return "comparison";
  }
  if (input.issueClasses.includes("narrative_mismatch")) {
    return "narrative";
  }
  if (
    input.shadowCase.gateSummary.overallVerdict === "FAIL" ||
    input.shadowCase.gateSummary.overallVerdict === "WARN"
  ) {
    return "confidence_gate";
  }
  return null;
}

function prioritizedFinancialComparisons(
  comparisons: UnifiedConfidenceComparisonFact[],
) {
  const priorityOrder = new Map<string, number>(
    PRIORITY_CANONICAL_KEYS.map((key, index) => [key, index]),
  );
  return [...comparisons].sort((left, right) => {
    const leftPriority = priorityOrder.get(left.canonicalKey) ?? 999;
    const rightPriority = priorityOrder.get(right.canonicalKey) ?? 999;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.canonicalKey.localeCompare(right.canonicalKey) || (left.fiscalYear ?? 0) - (right.fiscalYear ?? 0);
  });
}

async function buildCandidate(
  shadowCase: AnnualReportGoldSetShadowRun["batch"]["cases"][number],
  run: AnnualReportGoldSetShadowRun,
  decisionIndex: Map<string, AnnualReportManualReviewDecision>,
  deps: AnnualReportManualReviewRoundServiceDeps,
): Promise<AnnualReportManualReviewCandidate | null> {
  const diagnostics = [...shadowCase.errors, ...shadowCase.warnings];
  const getDrilldown = deps.getDrilldown ?? getUnifiedConfidenceFilingDrilldownForAdmin;
  const getFiling = deps.getFiling ?? getAnnualReportFilingWithArtifacts;

  let filing: FilingRecord | null = null;
  let drilldown: UnifiedConfidenceFilingDrilldown | null = null;

  try {
    filing = await getFiling(shadowCase.filingId);
  } catch (error) {
    diagnostics.push(
      error instanceof Error
        ? `Could not load filing: ${error.message}`
        : `Could not load filing: ${String(error)}`,
    );
  }

  try {
    drilldown = await getDrilldown(shadowCase.filingId);
  } catch (error) {
    diagnostics.push(
      error instanceof Error
        ? `Could not load drilldown: ${error.message}`
        : `Could not load drilldown: ${String(error)}`,
    );
  }

  const artifactRefs = buildArtifactRefs(filing, drilldown, shadowCase);
  const comparisonResult = computeComparisonResult(drilldown);

  if (!requiresReview(shadowCase, comparisonResult, artifactRefs)) {
    return null;
  }

  const candidateId = createCandidateId(run.runId, shadowCase.filingId);
  const latestDecision = decisionIndex.get(candidateId) ?? null;
  const { issueClasses, reviewReasons } = classifyIssueClasses({
    shadowCase,
    drilldown,
    comparisonResult,
    artifactRefs,
  });

  const severity = latestDecision?.severityOverride ?? classifySeverity({
    gateResult: shadowCase.gateSummary.overallVerdict,
    issueClasses,
    comparisonResult,
    artifactRefs,
  });

  const comparisonDetails = drilldown?.artifacts.comparison.data?.financialComparisons ?? [];
  const financialComparisons = prioritizedFinancialComparisons(comparisonDetails).map((item) => {
    return {
      ...item,
      reviewRequired:
        item.match === "CONFLICTING_VALUES" ||
        item.match === "MISSING_IN_LEGACY" ||
        item.match === "MISSING_IN_UNIFIED" ||
        item.match === "LOW_CONFIDENCE_AMBIGUOUS",
    };
  });

  const status: AnnualReportManualReviewCandidateStatus =
    latestDecision?.decision === "BLOCK_PUBLISH"
      ? "BLOCKED"
      : latestDecision
        ? "REVIEWED"
        : "PENDING";

  return {
    candidateId,
    reviewRoundId: run.runId,
    runId: run.runId,
    orgNumber: shadowCase.orgNumber,
    companyName: shadowCase.companyName,
    accountingYear: shadowCase.fiscalYear,
    filingId: shadowCase.filingId,
    reportId: filing?.sourceIdempotencyKey ?? shadowCase.legacyCandidateSet.provenance.filingReportId ?? null,
    documentRef:
      shadowCase.legacyCandidateSet.provenance.sourceDocumentReference ??
      filing?.sourceUrl ??
      null,
    tags: [...shadowCase.tagHints],
    evidenceType: shadowCase.legacyCandidateSet.provenance.evidenceType,
    evidenceQuality: shadowCase.legacyCandidateSet.classification,
    confidenceGateResult: shadowCase.gateSummary.overallVerdict,
    comparisonResult: {
      mismatchCount: comparisonResult.mismatchCount,
      narrativeMismatchCount: comparisonResult.narrativeMismatchCount,
      exactMatchCount: comparisonResult.exactMatchCount,
      matchRate: comparisonResult.matchRate,
    },
    firstDivergenceStage: determineFirstDivergenceStage({
      shadowCase,
      artifactRefs,
      issueClasses,
    }),
    severity,
    reviewReasons,
    issueClasses,
    financialComparisons,
    narrativeComparisons: comparisonResult.narrativeComparisons,
    artifactRefs,
    confidenceGateDiagnostics:
      drilldown?.detail.fullChecks
        .filter((check) => check.verdict === "FAIL" || check.verdict === "WARN")
        .map((check) => ({
          checkCode: check.checkCode,
          verdict: check.verdict,
          message: check.message,
        })) ?? [],
    parserOrEvidence:
      filing?.extractionRuns[0]?.documentEngine ??
      shadowCase.legacyCandidateSet.provenance.extractionRoute ??
      shadowCase.legacyCandidateSet.provenance.source ??
      "Ukjent",
    status,
    updatedAt: latestDecision?.reviewedAt ?? null,
    latestDecision,
    diagnostics: uniqueStrings(diagnostics),
  };
}

function buildSummary(
  candidates: AnnualReportManualReviewCandidate[],
): AnnualReportManualReviewRoundSummary {
  const severityCounts = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  } satisfies Record<AnnualReportManualReviewSeverity, number>;

  const issueClassCounts: Record<string, number> = {};
  const tagCoverage: Record<string, number> = {};
  const evidenceQualitySummary: Record<string, number> = {};
  const topFailingKeyCounts: Record<string, number> = {};
  const topDivergenceStages: Record<string, number> = {};
  const missingArtifactCounts: Record<string, number> = {};
  let narrativeMismatchCount = 0;
  let unitScaleAmbiguityCount = 0;
  let reviewedCount = 0;
  let pendingCount = 0;
  let blockedCount = 0;

  for (const candidate of candidates) {
    severityCounts[candidate.severity] += 1;

    if (candidate.status === "REVIEWED") {
      reviewedCount += 1;
    } else if (candidate.status === "BLOCKED") {
      blockedCount += 1;
    } else {
      pendingCount += 1;
    }

    for (const issueClass of candidate.issueClasses) {
      issueClassCounts[issueClass] = (issueClassCounts[issueClass] ?? 0) + 1;
      if (issueClass === "unit_scale_ambiguity") {
        unitScaleAmbiguityCount += 1;
      }
    }

    for (const tag of candidate.tags) {
      tagCoverage[tag] = (tagCoverage[tag] ?? 0) + 1;
    }

    if (candidate.evidenceQuality) {
      evidenceQualitySummary[candidate.evidenceQuality] =
        (evidenceQualitySummary[candidate.evidenceQuality] ?? 0) + 1;
    }

    for (const comparison of candidate.financialComparisons) {
      if (comparison.reviewRequired) {
        topFailingKeyCounts[comparison.canonicalKey] =
          (topFailingKeyCounts[comparison.canonicalKey] ?? 0) + 1;
      }
    }

    if (candidate.firstDivergenceStage) {
      topDivergenceStages[candidate.firstDivergenceStage] =
        (topDivergenceStages[candidate.firstDivergenceStage] ?? 0) + 1;
    }

    for (const ref of candidate.artifactRefs) {
      if (ref.status !== "available") {
        missingArtifactCounts[ref.key] = (missingArtifactCounts[ref.key] ?? 0) + 1;
      }
    }

    if (candidate.comparisonResult.narrativeMismatchCount > 0) {
      narrativeMismatchCount += 1;
    }
  }

  return {
    totalFilings: candidates.length,
    reviewCandidateCount: candidates.length,
    reviewedCount,
    pendingCount,
    blockedCount,
    severityCounts,
    issueClassCounts,
    tagCoverage,
    evidenceQualitySummary,
    topFailingCanonicalFinancialKeys:
      sortCountEntries(topFailingKeyCounts, "count", "canonicalKey") as Array<{
        canonicalKey: string;
        count: number;
      }>,
    topDivergenceStages:
      sortCountEntries(topDivergenceStages, "count", "stage") as Array<{
        stage: string;
        count: number;
      }>,
    missingArtifactCounts,
    narrativeMismatchCount,
    unitScaleAmbiguityCount,
  };
}

function buildRecommendedNextActions(summary: AnnualReportManualReviewRoundSummary) {
  const pr77Calibration: string[] = [];
  const pr78FailureTaxonomy: string[] = [];
  const pr79ExtractionFixes: string[] = [];

  if (summary.unitScaleAmbiguityCount > 0) {
    pr77Calibration.push(
      "Gå gjennom enhetsskala-saker og vurder om confidence gate bør sende flere slike tilfeller direkte til review.",
    );
    pr78FailureTaxonomy.push(
      "Egen feilklasse for ukjent eller tvetydig enhetsskala bør inngå i taksonomien.",
    );
  }

  const topIssueClass = Object.entries(summary.issueClassCounts).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0];
  if (topIssueClass) {
    pr78FailureTaxonomy.push(
      `Bruk "${topIssueClass[0]}" som startpunkt for første failure-taxonomy-gruppering.`,
    );
  }

  const topKey = summary.topFailingCanonicalFinancialKeys[0];
  if (topKey) {
    pr79ExtractionFixes.push(
      `Prioriter ekstraksjonsfeil for nøkkelen "${topKey.canonicalKey}" siden den går igjen oftest i review-runden.`,
    );
  }

  if (summary.missingArtifactCounts.structured_document_json > 0) {
    pr79ExtractionFixes.push(
      "Undersøk hvorfor strukturert dokument-artifact mangler for flere kandidater før nye ekstraksjonsendringer vurderes.",
    );
  }

  if (summary.pendingCount > 0) {
    pr77Calibration.push(
      "Vent med kalibrering til flere kandidater er ferdig manuelt vurdert, slik at terskeljusteringene får bedre fasitgrunnlag.",
    );
  }

  if (pr77Calibration.length === 0) {
    pr77Calibration.push("Ingen tydelige kalibreringstiltak utledet fra tilgjengelige review-beslutninger ennå.");
  }
  if (pr78FailureTaxonomy.length === 0) {
    pr78FailureTaxonomy.push("Ingen tydelige failure-taxonomy-mønstre funnet ennå.");
  }
  if (pr79ExtractionFixes.length === 0) {
    pr79ExtractionFixes.push("Ingen tydelige ekstraksjonsfikser prioritert ennå.");
  }

  return {
    pr77Calibration,
    pr78FailureTaxonomy,
    pr79ExtractionFixes,
  };
}

export async function buildAnnualReportManualReviewRound(
  input: BuildAnnualReportManualReviewRoundInput = {},
  deps: AnnualReportManualReviewRoundServiceDeps = {},
): Promise<AnnualReportManualReviewRound | null> {
  const run =
    input.runId
      ? await readShadowRunByRunId(input.runId, deps)
      : await readLatestShadowRun(deps);

  if (!run) {
    return null;
  }

  const diagnostics: string[] = [];
  const decisions = await readPersistedDecisions(run.runId, deps);
  const decisionIndex = latestDecisionByCandidate(decisions);
  const candidates = (
    await Promise.all(
      run.batch.cases.map((shadowCase) =>
        buildCandidate(shadowCase, run, decisionIndex, deps).catch((error) => {
          diagnostics.push(
            error instanceof Error
              ? `Candidate ${shadowCase.filingId}: ${error.message}`
              : `Candidate ${shadowCase.filingId}: ${String(error)}`,
          );
          return null;
        }),
      ),
    )
  ).filter((candidate): candidate is AnnualReportManualReviewCandidate => candidate !== null);

  const summary = buildSummary(candidates);
  return {
    version: "annual-report-manual-review-round-v1",
    reviewRoundId: run.runId,
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    sourceRun: {
      runId: run.runId,
      generatedAt: run.generatedAt,
      manifestName: run.manifest.name,
      manifestHash: run.manifest.hash,
      gitCommitSha: run.gitCommitSha,
    },
    summary,
    candidates,
    decisions: decisions.sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt)),
    diagnostics,
    recommendedNextActions: buildRecommendedNextActions(summary),
  };
}

export async function readLatestAnnualReportManualReviewRound(
  deps: AnnualReportManualReviewRoundServiceDeps = {},
) {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(path.join(MANUAL_REVIEW_OUTPUT_DIR, "latest.json"), "utf8");
    const parsed = safeParseJson<AnnualReportManualReviewRound>(raw);
    return parsed?.version === "annual-report-manual-review-round-v1" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function listAnnualReportManualReviewCandidates(
  input: ListAnnualReportManualReviewCandidatesInput = {},
  deps: AnnualReportManualReviewRoundServiceDeps = {},
) {
  const round = await buildAnnualReportManualReviewRound({ runId: input.runId }, deps);
  if (!round) {
    return null;
  }

  const searchNeedle = input.search?.trim().toLowerCase() ?? "";
  const items = round.candidates.filter((candidate) => {
    if (input.goldSetOnly && !candidate.tags.length) {
      return false;
    }
    if (input.highSeverityOnly && candidate.severity !== "HIGH") {
      return false;
    }
    if (input.status?.length && !input.status.includes(candidate.status)) {
      return false;
    }
    if (input.severity?.length && !input.severity.includes(candidate.severity)) {
      return false;
    }
    if (input.tag?.length && !input.tag.some((tag) => candidate.tags.includes(tag))) {
      return false;
    }
    if (
      input.issueClass?.length &&
      !input.issueClass.some((issueClass) => candidate.issueClasses.includes(issueClass))
    ) {
      return false;
    }
    if (input.accountingYear !== undefined && candidate.accountingYear !== input.accountingYear) {
      return false;
    }
    if (searchNeedle) {
      const haystack = [
        candidate.companyName,
        candidate.orgNumber,
        candidate.filingId,
        candidate.reportId,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchNeedle)) {
        return false;
      }
    }
    return true;
  });

  return {
    round,
    items,
  };
}

export function renderAnnualReportManualReviewRoundMarkdown(
  round: AnnualReportManualReviewRound,
) {
  const lines = [
    "# Manual review round",
    "",
    `- Review round ID: ${round.reviewRoundId}`,
    `- Source run ID: ${round.sourceRun.runId}`,
    `- Generated at: ${round.generatedAt}`,
    `- Manifest: ${round.sourceRun.manifestName}`,
    "",
    "## Summary",
    "",
    `- Total filings: ${round.summary.totalFilings}`,
    `- Review candidates: ${round.summary.reviewCandidateCount}`,
    `- Reviewed: ${round.summary.reviewedCount}`,
    `- Pending: ${round.summary.pendingCount}`,
    `- Blocked: ${round.summary.blockedCount}`,
    `- Severity HIGH/MEDIUM/LOW: ${round.summary.severityCounts.HIGH}/${round.summary.severityCounts.MEDIUM}/${round.summary.severityCounts.LOW}`,
    "",
    "## Top issue classes",
    "",
    ...Object.entries(round.summary.issueClassCounts)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 10)
      .map(([issueClass, count]) => `- ${issueClass}: ${count}`),
    "",
    "## Recommended next actions",
    "",
    "- PR77 calibration:",
    ...round.recommendedNextActions.pr77Calibration.map((item) => `  - ${item}`),
    "- PR78 failure taxonomy:",
    ...round.recommendedNextActions.pr78FailureTaxonomy.map((item) => `  - ${item}`),
    "- PR79 extraction fixes:",
    ...round.recommendedNextActions.pr79ExtractionFixes.map((item) => `  - ${item}`),
    "",
  ];

  if (round.candidates.length > 0) {
    lines.push("## Representative candidates", "");
    for (const candidate of round.candidates.slice(0, 10)) {
      lines.push(
        `- ${candidate.companyName ?? candidate.filingId} (${candidate.orgNumber ?? "ukjent org.nr"})`,
        `  - Filing: ${candidate.filingId}`,
        `  - Severity: ${candidate.severity}`,
        `  - Status: ${candidate.status}`,
        `  - Reasons: ${candidate.reviewReasons.slice(0, 3).join("; ") || "Ingen"}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function persistAnnualReportManualReviewRoundArtifacts(
  round: AnnualReportManualReviewRound,
  deps: AnnualReportManualReviewRoundServiceDeps = {},
) {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  await mkdir(MANUAL_REVIEW_OUTPUT_DIR, { recursive: true });

  const json = JSON.stringify(round, null, 2);
  const markdown = renderAnnualReportManualReviewRoundMarkdown(round);

  await writeFile(roundJsonPath(round.reviewRoundId), json, "utf8");
  await writeFile(roundMarkdownPath(round.reviewRoundId), markdown, "utf8");
  await writeFile(path.join(MANUAL_REVIEW_OUTPUT_DIR, "latest.json"), json, "utf8");
  await writeFile(path.join(MANUAL_REVIEW_OUTPUT_DIR, "latest.md"), markdown, "utf8");
}

export async function saveAnnualReportManualReviewDecision(
  input: SaveAnnualReportManualReviewDecisionInput,
  deps: AnnualReportManualReviewRoundServiceDeps = {},
) {
  const existing = await readPersistedDecisions(input.runId, deps);
  const now = (deps.now?.() ?? new Date()).toISOString();
  const decision: AnnualReportManualReviewDecision = {
    candidateId: input.candidateId,
    runId: input.runId,
    filingId: input.candidateId,
    decision: input.decision,
    issueClasses: uniqueStrings(input.issueClasses),
    reviewerNotes: input.reviewerNotes?.trim() || null,
    reviewedBy: input.reviewedBy,
    reviewedByRole: input.reviewedByRole,
    reviewedAt: now,
    severityOverride: input.severityOverride ?? null,
  };

  const round = await buildAnnualReportManualReviewRound({ runId: input.runId }, deps);
  if (!round) {
    throw new Error(`Manual review round ${input.runId} not found.`);
  }

  const candidate = round.candidates.find((item) => item.candidateId === input.candidateId);
  if (!candidate) {
    throw new Error(`Candidate ${input.candidateId} not found in run ${input.runId}.`);
  }

  decision.filingId = candidate.filingId;

  const filtered = existing.filter((item) => item.candidateId !== input.candidateId);
  filtered.push(decision);

  await writePersistedDecisions(input.runId, filtered, deps);

  const rebuilt = await buildAnnualReportManualReviewRound({ runId: input.runId }, deps);
  if (!rebuilt) {
    throw new Error(`Manual review round ${input.runId} could not be rebuilt after save.`);
  }

  await persistAnnualReportManualReviewRoundArtifacts(rebuilt, deps);
  return {
    decision,
    round: rebuilt,
  };
}

export async function getAnnualReportManualReviewCandidate(
  candidateId: string,
  runId: string,
  deps: AnnualReportManualReviewRoundServiceDeps = {},
) {
  const round = await buildAnnualReportManualReviewRound({ runId }, deps);
  if (!round) {
    return null;
  }

  const candidate = round.candidates.find((item) => item.candidateId === candidateId) ?? null;
  return candidate ? { round, candidate } : null;
}
