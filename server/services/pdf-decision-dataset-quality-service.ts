import type {
  PdfDecisionOutcomeDataset,
  PdfDecisionOutcomeDatasetRecord,
} from "@/server/services/pdf-decision-outcome-dataset-service";

export type PdfDecisionDatasetQualityIssueSeverity = "INFO" | "WARNING" | "ERROR";

export type PdfDecisionDatasetQualityIssue = {
  severity: PdfDecisionDatasetQualityIssueSeverity;
  code:
    | "EMPTY_DATASET"
    | "MISSING_LABEL"
    | "MISSING_DECISION"
    | "MISSING_OUTCOME"
    | "MISSING_RULE_CONFIG_VERSION"
    | "DUPLICATE_FILING"
    | "DUPLICATE_EXTRACTION_RUN"
    | "POTENTIAL_LEAKAGE"
    | "CLASS_IMBALANCE"
    | "LOW_GOLD_SET_COVERAGE"
    | "LOW_REVIEWED_COVERAGE"
    | "INVALID_RECORD";
  message: string;
  filingId?: string;
  extractionRunId?: string | null;
};

export type PdfDecisionDatasetQualityReport = {
  version: "pdf-decision-dataset-quality-v1";
  generatedAt: string;
  recordCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  distributions: {
    outcome: Record<string, number>;
    route: Record<string, number>;
    risk: Record<string, number>;
    fiscalYear: Record<string, number>;
    goldSetStatus: Record<string, number>;
    ruleConfigVersion: Record<string, number>;
  };
  coverage: {
    goldSetCoverage: number;
    reviewedCoverage: number;
    publishedCoverage: number;
    correctedCoverage: number;
    unreadableCoverage: number;
  };
  issues: PdfDecisionDatasetQualityIssue[];
};

function isJsonSafe(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonSafe);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonSafe);
  }
  return false;
}

function countDistribution<T extends string | number>(
  values: T[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = String(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function evaluatePdfDecisionDatasetQuality(
  dataset: PdfDecisionOutcomeDataset,
): PdfDecisionDatasetQualityReport {
  const issues: PdfDecisionDatasetQualityIssue[] = [];
  const records = dataset.records;

  if (records.length === 0) {
    issues.push({
      severity: "ERROR",
      code: "EMPTY_DATASET",
      message: "Dataset contains no records.",
    });
    return {
      version: "pdf-decision-dataset-quality-v1",
      generatedAt: new Date().toISOString(),
      recordCount: 0,
      issueCount: 1,
      errorCount: 1,
      warningCount: 0,
      distributions: {
        outcome: {},
        route: {},
        risk: {},
        fiscalYear: {},
        goldSetStatus: {},
        ruleConfigVersion: {},
      },
      coverage: {
        goldSetCoverage: 0,
        reviewedCoverage: 0,
        publishedCoverage: 0,
        correctedCoverage: 0,
        unreadableCoverage: 0,
      },
      issues,
    };
  }

  // Per-record checks
  const filingIdCounts: Record<string, number> = {};
  const extractionRunIdCounts: Record<string, number> = {};

  for (const record of records) {
    // Duplicate filing
    filingIdCounts[record.filingId] = (filingIdCounts[record.filingId] ?? 0) + 1;

    // Duplicate extraction run
    const runId = record.extractionRunId;
    if (runId) {
      extractionRunIdCounts[runId] = (extractionRunIdCounts[runId] ?? 0) + 1;
    }

    // Missing outcome
    if (!record.labels.outcome || record.labels.outcome.trim().length === 0) {
      issues.push({
        severity: "ERROR",
        code: "MISSING_OUTCOME",
        message: `Record ${record.filingId} has no outcome label.`,
        filingId: record.filingId,
        extractionRunId: record.extractionRunId,
      });
    }

    // Missing label (published/corrected/etc are all false can be legitimate, but outcome must exist)
    const hasAnyLabel =
      record.labels.published ||
      record.labels.corrected ||
      record.labels.unreadable ||
      record.labels.reprocessRequested ||
      record.labels.failed ||
      (record.labels.outcome && record.labels.outcome.length > 0);
    if (!hasAnyLabel) {
      issues.push({
        severity: "ERROR",
        code: "MISSING_LABEL",
        message: `Record ${record.filingId} has no meaningful label.`,
        filingId: record.filingId,
        extractionRunId: record.extractionRunId,
      });
    }

    // Missing decision route
    if (!record.features.decisionRoute) {
      issues.push({
        severity: "WARNING",
        code: "MISSING_DECISION",
        message: `Record ${record.filingId} has no decisionRoute.`,
        filingId: record.filingId,
        extractionRunId: record.extractionRunId,
      });
    }

    // Missing rule config version
    if (!record.features.ruleConfigVersion) {
      issues.push({
        severity: "WARNING",
        code: "MISSING_RULE_CONFIG_VERSION",
        message: `Record ${record.filingId} has no ruleConfigVersion.`,
        filingId: record.filingId,
        extractionRunId: record.extractionRunId,
      });
    }

    // Potential leakage: labels object should not appear under features
    const featuresStr = JSON.stringify(record.features);
    if (
      featuresStr.includes('"published"') ||
      featuresStr.includes('"corrected"') ||
      featuresStr.includes('"unreadable"') ||
      featuresStr.includes('"reprocessRequested"') ||
      featuresStr.includes('"failed"') ||
      featuresStr.includes('"outcome"')
    ) {
      const featureKeys = Object.keys(record.features);
      const labelKeys = ["published", "corrected", "unreadable", "reprocessRequested", "failed", "outcome"];
      const leaked = featureKeys.filter((k) => labelKeys.includes(k));
      if (leaked.length > 0) {
        issues.push({
          severity: "ERROR",
          code: "POTENTIAL_LEAKAGE",
          message: `Record ${record.filingId} has label key(s) ${leaked.join(", ")} embedded in features.`,
          filingId: record.filingId,
          extractionRunId: record.extractionRunId,
        });
      }
    }

    // JSON-safe check
    if (!isJsonSafe(record)) {
      issues.push({
        severity: "ERROR",
        code: "INVALID_RECORD",
        message: `Record ${record.filingId} contains non-JSON-safe values (NaN or Infinity).`,
        filingId: record.filingId,
        extractionRunId: record.extractionRunId,
      });
    }
  }

  // Duplicate filings
  for (const [filingId, count] of Object.entries(filingIdCounts)) {
    if (count > 1) {
      issues.push({
        severity: "WARNING",
        code: "DUPLICATE_FILING",
        message: `Filing ${filingId} appears ${count} times in the dataset.`,
        filingId,
      });
    }
  }

  // Duplicate extraction runs
  for (const [runId, count] of Object.entries(extractionRunIdCounts)) {
    if (count > 1) {
      issues.push({
        severity: "WARNING",
        code: "DUPLICATE_EXTRACTION_RUN",
        message: `Extraction run ${runId} appears ${count} times in the dataset.`,
        extractionRunId: runId,
      });
    }
  }

  // Class imbalance: any outcome class with < 2 records if dataset >= 10
  const outcomeCounts = countDistribution(records.map((r) => r.labels.outcome));
  if (records.length >= 10) {
    for (const [outcome, count] of Object.entries(outcomeCounts)) {
      if (count < 2) {
        issues.push({
          severity: "WARNING",
          code: "CLASS_IMBALANCE",
          message: `Outcome class "${outcome}" has only ${count} record(s); dataset has ${records.length} records.`,
        });
      }
    }
  }

  // Coverage metrics
  const n = records.length;
  const goldSetCount = records.filter((r) => r.features.hasGoldSet).length;
  const reviewedCount = records.filter((r) => (r.features.reviewedFactCount ?? 0) > 0).length;
  const publishedCount = records.filter((r) => r.labels.published).length;
  const correctedCount = records.filter((r) => r.labels.corrected).length;
  const unreadableCount = records.filter((r) => r.labels.unreadable).length;

  const goldSetCoverage = goldSetCount / n;
  const reviewedCoverage = reviewedCount / n;

  if (n >= 50 && goldSetCoverage < 0.05) {
    issues.push({
      severity: "INFO",
      code: "LOW_GOLD_SET_COVERAGE",
      message: `Gold-set coverage is ${(goldSetCoverage * 100).toFixed(1)}% (${goldSetCount}/${n}); consider curating more gold-set items.`,
    });
  }

  // Distributions
  const routeCounts = countDistribution(
    records.map((r) => r.features.decisionRoute ?? "UNKNOWN"),
  );
  const riskCounts = countDistribution(
    records.map((r) => r.features.riskLevel ?? "UNKNOWN"),
  );
  const fiscalYearCounts = countDistribution(
    records.map((r) => String(r.fiscalYear ?? "UNKNOWN")),
  );
  const goldSetStatusCounts = countDistribution(
    records.map((r) => r.features.goldSetStatus ?? "NONE"),
  );
  const ruleConfigVersionCounts = countDistribution(
    records.map((r) => r.features.ruleConfigVersion ?? "UNKNOWN"),
  );

  const errorCount = issues.filter((i) => i.severity === "ERROR").length;
  const warningCount = issues.filter((i) => i.severity === "WARNING").length;

  return {
    version: "pdf-decision-dataset-quality-v1",
    generatedAt: new Date().toISOString(),
    recordCount: n,
    issueCount: issues.length,
    errorCount,
    warningCount,
    distributions: {
      outcome: outcomeCounts,
      route: routeCounts,
      risk: riskCounts,
      fiscalYear: fiscalYearCounts,
      goldSetStatus: goldSetStatusCounts,
      ruleConfigVersion: ruleConfigVersionCounts,
    },
    coverage: {
      goldSetCoverage,
      reviewedCoverage,
      publishedCoverage: publishedCount / n,
      correctedCoverage: correctedCount / n,
      unreadableCoverage: unreadableCount / n,
    },
    issues,
  };
}

export function validatePdfDecisionDatasetForMlReadiness(dataset: PdfDecisionOutcomeDataset): {
  ready: boolean;
  report: PdfDecisionDatasetQualityReport;
} {
  const report = evaluatePdfDecisionDatasetQuality(dataset);
  const ready = report.errorCount === 0;
  return { ready, report };
}
