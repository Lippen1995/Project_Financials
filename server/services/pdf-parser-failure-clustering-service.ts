import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_PDF_DECISION_RULE_CONFIG,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { listAnnualReportDecisionShadowRows } from "@/server/persistence/annual-report-decision-shadow-repository";
import { listPdfDecisionGoldSetItemsByFilingIds } from "@/server/persistence/pdf-decision-gold-set-repository";
import {
  evaluatePdfDecisionShadow,
  type PdfDecisionShadowDocument,
  type PdfDecisionShadowEvaluationResult,
} from "@/server/services/annual-report-pdf-decision-shadow-evaluation";

export type PdfParserFailureClusterKind =
  | "WEAK_PAGE_HINTS"
  | "MISSING_FINANCIAL_SECTIONS"
  | "VALIDATION_BLOCKER"
  | "PARSER_RISK"
  | "READING_ORDER"
  | "UNREADABLE"
  | "LOW_CONFIDENCE"
  | "MANUAL_CORRECTION"
  | "REPROCESS"
  | "OCR_ODL_CANDIDATE"
  | "UNKNOWN";

export type PdfParserFailureClusterSeverity =
  | "INFO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type PdfParserFailureClusterExample = {
  filingId: string;
  extractionRunId?: string | null;
  orgNumber?: string | null;
  fiscalYear?: number | null;
  decisionRoute?: string | null;
  riskLevel?: string | null;
  confidenceScore?: number | null;
  outcome?: string | null;
  goldSetStatus?: string | null;
  latestReviewDecisionType?: string | null;
  blockingRuleCodes: string[];
  parserRiskReasons: string[];
  manualReviewReasons: string[];
};

export type PdfParserFailureCluster = {
  clusterId: string;
  kind: PdfParserFailureClusterKind;
  severity: PdfParserFailureClusterSeverity;
  label: string;
  description: string;
  documentCount: number;
  affectedOrgCount: number;
  affectedFiscalYears: number[];
  routeDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  outcomeDistribution: Record<string, number>;
  topBlockingRuleCodes: Array<{ code: string; count: number }>;
  topParserRiskReasons: Array<{ reason: string; count: number }>;
  topManualReviewReasons: Array<{ reason: string; count: number }>;
  likelyFixArea:
    | "PAGE_HINTS"
    | "SECTION_SEGMENTATION"
    | "VALIDATION_RULES"
    | "TEXT_LAYER"
    | "OCR_ODL_ROUTING"
    | "REVIEW_LABELING"
    | "UNKNOWN";
  suggestedNextAction:
    | "ADD_FIXTURE"
    | "ADD_GOLD_SET_ITEM"
    | "TUNE_RULE_CONFIG"
    | "INVESTIGATE_PARSER"
    | "EVALUATE_OCR_ODL"
    | "IMPROVE_SECTION_SEGMENTATION"
    | "IMPROVE_VALIDATION"
    | "NO_ACTION";
  examples: PdfParserFailureClusterExample[];
};

export type PdfParserFailureClusteringResult = {
  version: "pdf-parser-failure-clustering-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    maxExamplesPerCluster: number;
  };
  totalDocuments: number;
  clusterCount: number;
  clusters: PdfParserFailureCluster[];
};

type ClusterSeed = {
  kind: PdfParserFailureClusterKind;
  suffix: string;
};

type MutableCluster = {
  seed: ClusterSeed;
  documents: PdfDecisionShadowDocument[];
};

function normalizeClusterPart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "unknown";
}

function includesAny(values: string[], pattern: RegExp) {
  return values.some((value) => pattern.test(value));
}

function balanceRule(code: string) {
  return /balance|bs_total|total_balances/i.test(code);
}

function classifyDocument(doc: PdfDecisionShadowDocument): ClusterSeed {
  const manual = doc.manualReviewReasons;
  const parser = doc.parserRiskReasons;
  const blocking = doc.blockingRuleCodes;
  if (doc.outcome === "MANUAL_REVIEW_UNREADABLE" || doc.latestReviewDecisionType === "UNREADABLE") {
    return { kind: "UNREADABLE", suffix: "unreadable" };
  }
  if (doc.outcome === "REPROCESS_REQUESTED" || doc.latestReviewDecisionType === "REPROCESS_REQUESTED") {
    return { kind: "REPROCESS", suffix: "reprocess_requested" };
  }
  const balance = blocking.find(balanceRule);
  if (balance) {
    return { kind: "VALIDATION_BLOCKER", suffix: "balance_mismatch" };
  }
  if (blocking.length > 0) {
    return { kind: "VALIDATION_BLOCKER", suffix: normalizeClusterPart(blocking[0]) };
  }
  if (includesAny([...manual, ...parser], /weak page|page hint|unreliable hint/i)) {
    return { kind: "WEAK_PAGE_HINTS", suffix: "weak_page_hints" };
  }
  if (includesAny(manual, /missing financial|no financial|income statement|balance section|financial sections/i)) {
    return { kind: "MISSING_FINANCIAL_SECTIONS", suffix: "missing_financial_sections" };
  }
  if (includesAny(parser, /reading order|suspicious order|order/i)) {
    return { kind: "READING_ORDER", suffix: "reading_order" };
  }
  if (parser.length > 0) {
    return { kind: "PARSER_RISK", suffix: normalizeClusterPart(parser[0]) };
  }
  if (
    doc.confidenceScore !== null &&
    doc.confidenceScore !== undefined &&
    doc.confidenceScore < DEFAULT_PDF_DECISION_RULE_CONFIG.activeLearning!.lowConfidenceThreshold
  ) {
    return { kind: "LOW_CONFIDENCE", suffix: "low_confidence" };
  }
  if (doc.latestReviewDecisionType === "CORRECTED" || doc.outcome === "MANUAL_REVIEW_CORRECTED") {
    return { kind: "MANUAL_CORRECTION", suffix: "manual_correction" };
  }
  if (
    doc.decisionRoute === "FORCE_OCR" ||
    doc.decisionRoute === "OPENDATALOADER_HYBRID" ||
    doc.qualityRisk === "HIGH" ||
    doc.recommendedRouteHint === "OPENDATALOADER_HYBRID"
  ) {
    return { kind: "OCR_ODL_CANDIDATE", suffix: "ocr_odl_candidate" };
  }
  return { kind: "UNKNOWN", suffix: "unknown" };
}

function increment(record: Record<string, number>, key?: string | null) {
  const normalized = key || "UNKNOWN";
  record[normalized] = (record[normalized] ?? 0) + 1;
}

function topCounts(record: Record<string, number>, keyName: "code" | "reason") {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([key, count]) =>
      keyName === "code" ? { code: key, count } : { reason: key, count },
    );
}

function severity(kind: PdfParserFailureClusterKind, docs: PdfDecisionShadowDocument[]): PdfParserFailureClusterSeverity {
  const failureCount = docs.filter((doc) =>
    ["FAILED", "MANUAL_REVIEW_CORRECTED", "MANUAL_REVIEW_UNREADABLE", "REPROCESS_REQUESTED"].includes(doc.outcome),
  ).length;
  if (
    (kind === "UNREADABLE" && docs.length >= 5) ||
    (kind === "VALIDATION_BLOCKER" && (failureCount >= 3 || failureCount / docs.length >= 0.5))
  ) {
    return "CRITICAL";
  }
  if (["REPROCESS", "VALIDATION_BLOCKER", "MANUAL_CORRECTION", "MISSING_FINANCIAL_SECTIONS"].includes(kind)) {
    return "HIGH";
  }
  if (["PARSER_RISK", "READING_ORDER", "WEAK_PAGE_HINTS", "LOW_CONFIDENCE", "OCR_ODL_CANDIDATE"].includes(kind)) {
    return "MEDIUM";
  }
  return docs.length > 1 ? "LOW" : "INFO";
}

function fixArea(kind: PdfParserFailureClusterKind): PdfParserFailureCluster["likelyFixArea"] {
  if (kind === "WEAK_PAGE_HINTS") return "PAGE_HINTS";
  if (kind === "MISSING_FINANCIAL_SECTIONS") return "SECTION_SEGMENTATION";
  if (kind === "VALIDATION_BLOCKER") return "VALIDATION_RULES";
  if (kind === "READING_ORDER" || kind === "PARSER_RISK") return "TEXT_LAYER";
  if (kind === "OCR_ODL_CANDIDATE" || kind === "UNREADABLE") return "OCR_ODL_ROUTING";
  if (kind === "MANUAL_CORRECTION") return "REVIEW_LABELING";
  return "UNKNOWN";
}

function nextAction(kind: PdfParserFailureClusterKind): PdfParserFailureCluster["suggestedNextAction"] {
  if (kind === "MISSING_FINANCIAL_SECTIONS" || kind === "WEAK_PAGE_HINTS") {
    return "IMPROVE_SECTION_SEGMENTATION";
  }
  if (kind === "VALIDATION_BLOCKER") return "IMPROVE_VALIDATION";
  if (kind === "PARSER_RISK" || kind === "READING_ORDER") return "INVESTIGATE_PARSER";
  if (kind === "OCR_ODL_CANDIDATE" || kind === "UNREADABLE") return "EVALUATE_OCR_ODL";
  if (kind === "MANUAL_CORRECTION") return "ADD_GOLD_SET_ITEM";
  if (kind === "REPROCESS") return "INVESTIGATE_PARSER";
  return "NO_ACTION";
}

function labelFor(seed: ClusterSeed) {
  const suffix = seed.suffix.replace(/_/g, " ");
  return `${seed.kind.replace(/_/g, " ")}: ${suffix}`;
}

function descriptionFor(kind: PdfParserFailureClusterKind) {
  const descriptions: Record<PdfParserFailureClusterKind, string> = {
    WEAK_PAGE_HINTS: "Documents where page hint diagnostics indicate unreliable or weak extraction page targeting.",
    MISSING_FINANCIAL_SECTIONS: "Documents where expected financial statement sections were not detected.",
    VALIDATION_BLOCKER: "Documents blocked by validation rules after extraction.",
    PARSER_RISK: "Documents with parser risk diagnostics that may affect extracted facts.",
    READING_ORDER: "Documents with suspected reading order or layout ordering issues.",
    UNREADABLE: "Documents marked unreadable during review.",
    LOW_CONFIDENCE: "Documents with low PDF Decision confidence.",
    MANUAL_CORRECTION: "Documents that required reviewer correction.",
    REPROCESS: "Documents where review requested reprocessing.",
    OCR_ODL_CANDIDATE: "Documents likely to benefit from OCR/OpenDataLoader evaluation.",
    UNKNOWN: "Documents without a more specific deterministic failure signature.",
  };
  return descriptions[kind];
}

function toExample(doc: PdfDecisionShadowDocument): PdfParserFailureClusterExample {
  return {
    filingId: doc.filingId,
    extractionRunId: doc.extractionRunId ?? null,
    orgNumber: doc.orgNumber ?? null,
    fiscalYear: doc.fiscalYear ?? null,
    decisionRoute: doc.decisionRoute ?? null,
    riskLevel: doc.riskLevel ?? null,
    confidenceScore: doc.confidenceScore ?? null,
    outcome: doc.outcome,
    goldSetStatus: doc.goldSet?.status ?? null,
    latestReviewDecisionType: doc.latestReviewDecisionType ?? null,
    blockingRuleCodes: doc.blockingRuleCodes,
    parserRiskReasons: doc.parserRiskReasons,
    manualReviewReasons: doc.manualReviewReasons,
  };
}

function buildCluster(mutable: MutableCluster, maxExamples: number): PdfParserFailureCluster {
  const routeDistribution: Record<string, number> = {};
  const riskDistribution: Record<string, number> = {};
  const outcomeDistribution: Record<string, number> = {};
  const blocking: Record<string, number> = {};
  const parserRisk: Record<string, number> = {};
  const manualReview: Record<string, number> = {};
  const orgs = new Set<string>();
  const fiscalYears = new Set<number>();

  for (const doc of mutable.documents) {
    increment(routeDistribution, doc.decisionRoute);
    increment(riskDistribution, doc.riskLevel);
    increment(outcomeDistribution, doc.outcome);
    if (doc.orgNumber) orgs.add(doc.orgNumber);
    if (doc.fiscalYear != null) fiscalYears.add(doc.fiscalYear);
    for (const code of doc.blockingRuleCodes) increment(blocking, code);
    for (const reason of doc.parserRiskReasons) increment(parserRisk, reason);
    for (const reason of doc.manualReviewReasons) increment(manualReview, reason);
  }

  return {
    clusterId: `${mutable.seed.kind.toLowerCase()}:${normalizeClusterPart(mutable.seed.suffix)}`,
    kind: mutable.seed.kind,
    severity: severity(mutable.seed.kind, mutable.documents),
    label: labelFor(mutable.seed),
    description: descriptionFor(mutable.seed.kind),
    documentCount: mutable.documents.length,
    affectedOrgCount: orgs.size,
    affectedFiscalYears: [...fiscalYears].sort((a, b) => a - b),
    routeDistribution,
    riskDistribution,
    outcomeDistribution,
    topBlockingRuleCodes: topCounts(blocking, "code") as Array<{ code: string; count: number }>,
    topParserRiskReasons: topCounts(parserRisk, "reason") as Array<{ reason: string; count: number }>,
    topManualReviewReasons: topCounts(manualReview, "reason") as Array<{ reason: string; count: number }>,
    likelyFixArea: fixArea(mutable.seed.kind),
    suggestedNextAction: nextAction(mutable.seed.kind),
    examples: mutable.documents.slice(0, maxExamples).map(toExample),
  };
}

const SEVERITY_RANK: Record<PdfParserFailureClusterSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export async function clusterPdfParserFailures(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    maxExamplesPerCluster?: number;
  },
  deps?: {
    evaluateShadow?: (params: {
      limit: number;
      fiscalYear?: number;
      orgNumber?: string;
    }) => Promise<PdfDecisionShadowEvaluationResult>;
  },
): Promise<PdfParserFailureClusteringResult> {
  const limit = input?.limit ?? 100;
  const maxExamplesPerCluster = input?.maxExamplesPerCluster ?? 5;
  const evaluateShadow =
    deps?.evaluateShadow ??
    (async (params: { limit: number; fiscalYear?: number; orgNumber?: string }) => {
      const storage = new LocalAnnualReportArtifactStorage();
      return evaluatePdfDecisionShadow(params, {
        listRows: listAnnualReportDecisionShadowRows,
        listGoldSetItems: listPdfDecisionGoldSetItemsByFilingIds,
        readArtifact: async (key) => {
          try {
            return await storage.getArtifactBuffer(key);
          } catch {
            return null;
          }
        },
      });
    });
  const shadow = await evaluateShadow({
    limit,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
  });
  const clustersById = new Map<string, MutableCluster>();
  for (const doc of shadow.documents) {
    const seed = classifyDocument(doc);
    const clusterId = `${seed.kind.toLowerCase()}:${normalizeClusterPart(seed.suffix)}`;
    const existing = clustersById.get(clusterId);
    if (existing) {
      existing.documents.push(doc);
    } else {
      clustersById.set(clusterId, { seed, documents: [doc] });
    }
  }
  const clusters = [...clustersById.values()]
    .map((cluster) => buildCluster(cluster, maxExamplesPerCluster))
    .sort(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        right.documentCount - left.documentCount ||
        left.clusterId.localeCompare(right.clusterId),
    );

  return {
    version: "pdf-parser-failure-clustering-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      maxExamplesPerCluster,
    },
    totalDocuments: shadow.documents.length,
    clusterCount: clusters.length,
    clusters,
  };
}

export function serializePdfParserFailureClusteringResult(
  result: PdfParserFailureClusteringResult,
): string {
  return JSON.stringify(result, null, 2);
}

function hasInvalidNumber(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasInvalidNumber);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasInvalidNumber);
  }
  return false;
}

export function validatePdfParserFailureClusteringResult(
  result: PdfParserFailureClusteringResult,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (result.version !== "pdf-parser-failure-clustering-v1") issues.push("Invalid version.");
  if (hasInvalidNumber(result)) issues.push("Result contains NaN or Infinity.");
  for (const cluster of result.clusters ?? []) {
    if (!cluster.clusterId) issues.push("Cluster is missing clusterId.");
    if (!Array.isArray(cluster.examples)) {
      issues.push(`${cluster.clusterId || "unknown"} examples must be an array.`);
    } else {
      if (cluster.examples.length > result.input.maxExamplesPerCluster) {
        issues.push(`${cluster.clusterId} has too many examples.`);
      }
      if (cluster.documentCount < cluster.examples.length) {
        issues.push(`${cluster.clusterId} documentCount is smaller than examples length.`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export function writePdfParserFailureClusteringResult(
  result: PdfParserFailureClusteringResult,
  outputPath: string,
) {
  writeFileSync(resolve(process.cwd(), outputPath), `${serializePdfParserFailureClusteringResult(result)}\n`, "utf8");
}
