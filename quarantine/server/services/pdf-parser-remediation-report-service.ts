import {
  clusterPdfParserFailures,
  type PdfParserFailureCluster,
  type PdfParserFailureClusteringResult,
} from "@/server/services/pdf-parser-failure-clustering-service";

export type PdfParserRemediationWorkstream =
  | "PAGE_HINTS"
  | "SECTION_SEGMENTATION"
  | "VALIDATION_RULES"
  | "TEXT_LAYER"
  | "OCR_ODL_ROUTING"
  | "REVIEW_LABELING"
  | "GOLD_SET_CURATION"
  | "RULE_TUNING";

export type PdfParserRemediationPriority = "P0" | "P1" | "P2" | "P3";

export type PdfParserRemediationItem = {
  id: string;
  workstream: PdfParserRemediationWorkstream;
  priority: PdfParserRemediationPriority;
  title: string;
  description: string;
  clusterIds: string[];
  documentCount: number;
  affectedOrgCount: number;
  affectedFiscalYears: number[];
  expectedImpact: "HIGH" | "MEDIUM" | "LOW";
  recommendedAction:
    | "ADD_TEST_FIXTURES"
    | "CURATE_GOLD_SET"
    | "TUNE_DECISION_RULES"
    | "IMPROVE_PAGE_HINTS"
    | "IMPROVE_SECTION_SEGMENTATION"
    | "IMPROVE_VALIDATION_RULE"
    | "INVESTIGATE_TEXT_LAYER"
    | "EVALUATE_OCR_ODL_ROUTE"
    | "REVIEW_LABEL_QUALITY";
  evidence: Array<{
    clusterId: string;
    label: string;
    severity: string;
    documentCount: number;
    exampleFilingIds: string[];
  }>;
  suggestedOwner?: "PARSER" | "VALIDATION" | "REVIEW_OPS" | "DATASET" | "UNKNOWN";
};

export type PdfParserRemediationReport = {
  version: "pdf-parser-remediation-report-v1";
  generatedAt: string;
  input: {
    limit: number;
    fiscalYear?: number;
    orgNumber?: string;
    maxExamplesPerCluster: number;
  };
  sourceClusterCount: number;
  totalDocuments: number;
  itemCount: number;
  workstreamSummary: Record<PdfParserRemediationWorkstream, number>;
  prioritySummary: Record<PdfParserRemediationPriority, number>;
  items: PdfParserRemediationItem[];
};

const PRIORITY_RANK: Record<PdfParserRemediationPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function workstreamFor(cluster: PdfParserFailureCluster): PdfParserRemediationWorkstream {
  if (cluster.suggestedNextAction === "ADD_GOLD_SET_ITEM") return "GOLD_SET_CURATION";
  if (cluster.suggestedNextAction === "TUNE_RULE_CONFIG") return "RULE_TUNING";
  if (cluster.likelyFixArea === "PAGE_HINTS") return "PAGE_HINTS";
  if (cluster.likelyFixArea === "SECTION_SEGMENTATION") return "SECTION_SEGMENTATION";
  if (cluster.likelyFixArea === "VALIDATION_RULES") return "VALIDATION_RULES";
  if (cluster.likelyFixArea === "TEXT_LAYER") return "TEXT_LAYER";
  if (cluster.likelyFixArea === "OCR_ODL_ROUTING") return "OCR_ODL_ROUTING";
  if (cluster.likelyFixArea === "REVIEW_LABELING") return "REVIEW_LABELING";
  return "GOLD_SET_CURATION";
}

function actionFor(workstream: PdfParserRemediationWorkstream): PdfParserRemediationItem["recommendedAction"] {
  if (workstream === "PAGE_HINTS") return "IMPROVE_PAGE_HINTS";
  if (workstream === "SECTION_SEGMENTATION") return "IMPROVE_SECTION_SEGMENTATION";
  if (workstream === "VALIDATION_RULES") return "IMPROVE_VALIDATION_RULE";
  if (workstream === "TEXT_LAYER") return "INVESTIGATE_TEXT_LAYER";
  if (workstream === "OCR_ODL_ROUTING") return "EVALUATE_OCR_ODL_ROUTE";
  if (workstream === "REVIEW_LABELING") return "REVIEW_LABEL_QUALITY";
  if (workstream === "RULE_TUNING") return "TUNE_DECISION_RULES";
  return "CURATE_GOLD_SET";
}

function ownerFor(workstream: PdfParserRemediationWorkstream): PdfParserRemediationItem["suggestedOwner"] {
  if (["PAGE_HINTS", "SECTION_SEGMENTATION", "TEXT_LAYER", "OCR_ODL_ROUTING"].includes(workstream)) {
    return "PARSER";
  }
  if (workstream === "VALIDATION_RULES") return "VALIDATION";
  if (workstream === "REVIEW_LABELING") return "REVIEW_OPS";
  if (workstream === "GOLD_SET_CURATION" || workstream === "RULE_TUNING") return "DATASET";
  return "UNKNOWN";
}

function priorityFor(clusters: PdfParserFailureCluster[], documentCount: number): PdfParserRemediationPriority {
  if (
    clusters.some((cluster) => cluster.severity === "CRITICAL") ||
    (documentCount >= 10 &&
      clusters.some((cluster) => ["UNREADABLE", "REPROCESS", "VALIDATION_BLOCKER"].includes(cluster.kind)))
  ) {
    return "P0";
  }
  if (clusters.some((cluster) => cluster.severity === "HIGH")) return "P1";
  if (clusters.some((cluster) => cluster.severity === "MEDIUM")) return "P2";
  return "P3";
}

function impactFor(priority: PdfParserRemediationPriority, documentCount: number): "HIGH" | "MEDIUM" | "LOW" {
  if (priority === "P0" || documentCount >= 10) return "HIGH";
  if (priority === "P1" || priority === "P2" || documentCount >= 3) return "MEDIUM";
  return "LOW";
}

function titleFor(workstream: PdfParserRemediationWorkstream) {
  const titles: Record<PdfParserRemediationWorkstream, string> = {
    PAGE_HINTS: "Improve financial page hint reliability",
    SECTION_SEGMENTATION: "Improve financial section segmentation",
    VALIDATION_RULES: "Investigate blocking validation rules",
    TEXT_LAYER: "Investigate text-layer parser risks",
    OCR_ODL_ROUTING: "Evaluate OCR/OpenDataLoader candidates",
    REVIEW_LABELING: "Review label quality and correction patterns",
    GOLD_SET_CURATION: "Curate representative gold-set examples",
    RULE_TUNING: "Review Decision Engine rule tuning candidates",
  };
  return titles[workstream];
}

function descriptionFor(workstream: PdfParserRemediationWorkstream, clusters: PdfParserFailureCluster[]) {
  return `${titleFor(workstream)} based on ${clusters.length} parser failure cluster(s).`;
}

function buildItem(workstream: PdfParserRemediationWorkstream, clusters: PdfParserFailureCluster[]): PdfParserRemediationItem {
  const documentCount = clusters.reduce((sum, cluster) => sum + cluster.documentCount, 0);
  const orgCount = clusters.reduce((sum, cluster) => sum + cluster.affectedOrgCount, 0);
  const years = new Set<number>();
  for (const cluster of clusters) {
    for (const year of cluster.affectedFiscalYears) years.add(year);
  }
  const priority = priorityFor(clusters, documentCount);
  return {
    id: `remediation:${workstream.toLowerCase()}`,
    workstream,
    priority,
    title: titleFor(workstream),
    description: descriptionFor(workstream, clusters),
    clusterIds: clusters.map((cluster) => cluster.clusterId).sort(),
    documentCount,
    affectedOrgCount: orgCount,
    affectedFiscalYears: [...years].sort((a, b) => a - b),
    expectedImpact: impactFor(priority, documentCount),
    recommendedAction: actionFor(workstream),
    evidence: clusters.map((cluster) => ({
      clusterId: cluster.clusterId,
      label: cluster.label,
      severity: cluster.severity,
      documentCount: cluster.documentCount,
      exampleFilingIds: cluster.examples.map((example) => example.filingId),
    })),
    suggestedOwner: ownerFor(workstream),
  };
}

function emptySummary<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

const WORKSTREAMS: PdfParserRemediationWorkstream[] = [
  "PAGE_HINTS",
  "SECTION_SEGMENTATION",
  "VALIDATION_RULES",
  "TEXT_LAYER",
  "OCR_ODL_ROUTING",
  "REVIEW_LABELING",
  "GOLD_SET_CURATION",
  "RULE_TUNING",
];

const PRIORITIES: PdfParserRemediationPriority[] = ["P0", "P1", "P2", "P3"];

export async function buildPdfParserRemediationReport(
  input?: {
    limit?: number;
    fiscalYear?: number;
    orgNumber?: string;
    maxExamplesPerCluster?: number;
  },
  deps?: {
    clusterFailures?: (params: {
      limit?: number;
      fiscalYear?: number;
      orgNumber?: string;
      maxExamplesPerCluster?: number;
    }) => Promise<PdfParserFailureClusteringResult>;
  },
): Promise<PdfParserRemediationReport> {
  const limit = input?.limit ?? 100;
  const maxExamplesPerCluster = input?.maxExamplesPerCluster ?? 5;
  const clusterResult = await (deps?.clusterFailures ?? clusterPdfParserFailures)({
    limit,
    fiscalYear: input?.fiscalYear,
    orgNumber: input?.orgNumber,
    maxExamplesPerCluster,
  });
  const byWorkstream = new Map<PdfParserRemediationWorkstream, PdfParserFailureCluster[]>();
  for (const cluster of clusterResult.clusters) {
    const workstream = workstreamFor(cluster);
    byWorkstream.set(workstream, [...(byWorkstream.get(workstream) ?? []), cluster]);
  }
  const items = [...byWorkstream.entries()]
    .map(([workstream, clusters]) => buildItem(workstream, clusters))
    .sort(
      (left, right) =>
        PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
        right.documentCount - left.documentCount ||
        left.id.localeCompare(right.id),
    );
  const workstreamSummary = emptySummary(WORKSTREAMS);
  const prioritySummary = emptySummary(PRIORITIES);
  for (const item of items) {
    workstreamSummary[item.workstream] += 1;
    prioritySummary[item.priority] += 1;
  }

  return {
    version: "pdf-parser-remediation-report-v1",
    generatedAt: new Date().toISOString(),
    input: {
      limit,
      fiscalYear: input?.fiscalYear,
      orgNumber: input?.orgNumber,
      maxExamplesPerCluster,
    },
    sourceClusterCount: clusterResult.clusterCount,
    totalDocuments: clusterResult.totalDocuments,
    itemCount: items.length,
    workstreamSummary,
    prioritySummary,
    items,
  };
}
