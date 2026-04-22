import { chooseCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import {
  CanonicalFactCandidate,
  PageClassification,
  ValidationIssueDraft,
} from "@/integrations/brreg/annual-report-financials/types";
import { requiredPublishMetricKeys } from "@/integrations/brreg/annual-report-financials/taxonomy";

export function primaryStatementPages(classifications: PageClassification[]) {
  return classifications.filter((classification) =>
    [
      "STATUTORY_INCOME",
      "STATUTORY_BALANCE",
      "STATUTORY_BALANCE_CONTINUATION",
      "SUPPLEMENTARY_INCOME",
      "SUPPLEMENTARY_BALANCE",
    ].includes(classification.type),
  );
}

export function buildClassificationIssues(
  fiscalYear: number,
  classifications: PageClassification[],
): ValidationIssueDraft[] {
  const primaryPages = primaryStatementPages(classifications);
  const issues: ValidationIssueDraft[] = [];

  if (!primaryPages.some((page) => ["STATUTORY_INCOME", "SUPPLEMENTARY_INCOME"].includes(page.type))) {
    issues.push({
      severity: "ERROR",
      ruleCode: "PRIMARY_INCOME_PAGE_MISSING",
      message: "Could not classify a reliable income-statement page.",
    });
  }

  if (
    !primaryPages.some((page) =>
      ["STATUTORY_BALANCE", "STATUTORY_BALANCE_CONTINUATION", "SUPPLEMENTARY_BALANCE"].includes(
        page.type,
      ),
    )
  ) {
    issues.push({
      severity: "ERROR",
      ruleCode: "PRIMARY_BALANCE_PAGE_MISSING",
      message: "Could not classify a reliable balance-sheet page.",
    });
  }

  for (const page of primaryPages) {
    if (page.confidence < 0.74) {
      issues.push({
        severity: "ERROR",
        ruleCode: "PAGE_CLASSIFICATION_UNCERTAIN",
        message: `Statement page ${page.pageNumber} was classified with low confidence (${page.confidence}).`,
        context: { pageNumber: page.pageNumber, type: page.type, reasons: page.reasons },
      });
    }

    if (!page.tableLike || page.numericRowCount < 3) {
      issues.push({
        severity: "WARNING",
        ruleCode: "STATEMENT_TABLE_LAYOUT_WEAK",
        message: `Statement page ${page.pageNumber} does not look like a strong financial table.`,
        context: {
          pageNumber: page.pageNumber,
          type: page.type,
          numericRowCount: page.numericRowCount,
        },
      });
    }

    if (page.hasConflictingUnitSignals) {
      issues.push({
        severity: "ERROR",
        ruleCode: "PAGE_UNIT_SCALE_CONFLICT",
        message: `Statement page ${page.pageNumber} contains conflicting unit-scale declarations.`,
        context: { pageNumber: page.pageNumber, type: page.type, reasons: page.reasons },
      });
    }

    if (page.unitScale === null || page.unitScaleConfidence < 0.8) {
      issues.push({
        severity: "ERROR",
        ruleCode: "PAGE_UNIT_SCALE_UNCERTAIN",
        message: `Statement page ${page.pageNumber} lacks a confident unit-scale declaration.`,
        context: {
          pageNumber: page.pageNumber,
          type: page.type,
          unitScale: page.unitScale,
          unitScaleConfidence: page.unitScaleConfidence,
        },
      });
    }

    if (page.yearHeaderYears.length >= 2 && page.yearHeaderYears[0] !== fiscalYear) {
      issues.push({
        severity: "ERROR",
        ruleCode: "SUSPICIOUS_COLUMN_SWAP",
        message: `Page ${page.pageNumber} appears to start with year ${page.yearHeaderYears[0]} instead of ${fiscalYear}.`,
        context: { pageNumber: page.pageNumber, yearHeaderYears: page.yearHeaderYears },
      });
    }
  }

  return issues;
}

export function hasKnownUnitScale(classifications: PageClassification[]) {
  const pages = primaryStatementPages(classifications);
  return (
    pages.length > 0 &&
    pages.every(
      (page) =>
        page.unitScale !== null &&
        page.unitScaleConfidence >= 0.8 &&
        !page.hasConflictingUnitSignals,
    )
  );
}

export function calculateConfidenceScore(input: {
  classifications: PageClassification[];
  selectedFactCount: number;
  validationScore: number;
  duplicateSupport: number;
  noteSupport: number;
  issueCount: number;
}) {
  const primaryPages = primaryStatementPages(input.classifications);
  const classificationScore =
    primaryPages.length > 0
      ? primaryPages.reduce((sum, page) => sum + page.confidence, 0) / primaryPages.length
      : 0;
  const unitScore =
    primaryPages.length > 0
      ? primaryPages.reduce((sum, page) => sum + page.unitScaleConfidence, 0) /
        primaryPages.length
      : 0;
  const coverageScore = Math.min(1, input.selectedFactCount / requiredPublishMetricKeys.length);
  const issuePenalty = Math.min(0.18, input.issueCount * 0.015);
  const deterministicReadinessBonus =
    primaryPages.length >= 2 &&
    coverageScore === 1 &&
    input.validationScore >= 0.99 &&
    input.issueCount === 0 &&
    primaryPages.every(
      (page) =>
        page.tableLike &&
        page.numericRowCount >= 3 &&
        page.unitScaleConfidence >= 0.85 &&
        page.confidence >= 0.8,
    )
      ? 0.04
      : 0;

  return Number(
    Math.max(
      0,
      Math.min(
        0.995,
        classificationScore * 0.26 +
          unitScore * 0.18 +
          coverageScore * 0.22 +
          input.validationScore * 0.24 +
          input.duplicateSupport * 0.07 +
          input.noteSupport * 0.03 -
          issuePenalty +
          deterministicReadinessBonus,
      ),
    ).toFixed(4),
  );
}

export function canPublishAutomatically(input: {
  filingFiscalYear: number;
  classifications: PageClassification[];
  selectedFacts: ReturnType<typeof chooseCanonicalFacts>;
  validationIssues: ValidationIssueDraft[];
  confidenceScore: number;
}) {
  const primaryPages = primaryStatementPages(input.classifications);
  const hasIncomePage = primaryPages.some((page) =>
    ["STATUTORY_INCOME", "SUPPLEMENTARY_INCOME"].includes(page.type),
  );
  const hasBalancePage = primaryPages.some((page) =>
    ["STATUTORY_BALANCE", "STATUTORY_BALANCE_CONTINUATION", "SUPPLEMENTARY_BALANCE"].includes(
      page.type,
    ),
  );
  const hasBlockingErrors = input.validationIssues.some((issue) => issue.severity === "ERROR");
  const hasRequiredMetrics = requiredPublishMetricKeys.every((metricKey) =>
    input.selectedFacts.has(metricKey),
  );
  const hasReliableClassifications =
    primaryPages.length >= 2 && primaryPages.every((page) => page.confidence >= 0.74);
  const hasReliableYears = primaryPages.every(
    (page) =>
      page.yearHeaderYears.length === 0 || page.yearHeaderYears[0] === input.filingFiscalYear,
  );

  return (
    hasIncomePage &&
    hasBalancePage &&
    hasRequiredMetrics &&
    hasKnownUnitScale(input.classifications) &&
    hasReliableClassifications &&
    hasReliableYears &&
    !hasBlockingErrors &&
    input.confidenceScore >= 0.9
  );
}

export function summarizeProcessingResults(
  results: Array<{
    published?: boolean;
    skipped?: boolean;
    error?: string;
  }>,
) {
  return {
    processedCount: results.length,
    publishedCount: results.filter((result) => result.published).length,
    manualReviewCount: results.filter(
      (result) => !result.published && !result.skipped && !result.error,
    ).length,
    failedCount: results.filter((result) => Boolean(result.error)).length,
    skippedCount: results.filter((result) => result.skipped).length,
  };
}

export function summarizeDiscoveryResults(
  discoveries: Array<{
    discoveredFilings: number;
  }>,
) {
  return discoveries.reduce((sum, item) => sum + item.discoveredFilings, 0);
}
