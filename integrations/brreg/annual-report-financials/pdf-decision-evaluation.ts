import type { FinancialExtractionPageHints } from "@/integrations/brreg/annual-report-financials/financial-extraction-page-hints";
import { runPdfDecisionEngine } from "@/integrations/brreg/annual-report-financials/pdf-decision-engine";
import type {
  PdfDecisionRuleConfig,
  PdfDecisionRuleConfigOverrides,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-config";
import type {
  PdfDecisionEngineOutput,
  PdfDecisionRiskLevel,
  PdfDecisionRoute,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-types";

type PdfDecisionFixtureInput = Parameters<typeof runPdfDecisionEngine>[0] & {
  pageHints?: Omit<FinancialExtractionPageHints, "excludePages"> & {
    excludePages?: number[];
  };
  openDataLoaderConfig?: Parameters<typeof runPdfDecisionEngine>[0]["odlConfig"];
};

export type PdfDecisionEvaluationFixture = {
  name: string;
  description?: string;
  input: PdfDecisionFixtureInput;
  expected: {
    route?: PdfDecisionRoute;
    riskLevel?: PdfDecisionRiskLevel;
    minConfidenceScore?: number;
    maxConfidenceScore?: number;
    manualReviewReasonIncludes?: string[];
    reasonIncludes?: string[];
    financialFactsEnabled?: boolean;
    boardReportEnabled?: boolean;
    auditorReportEnabled?: boolean;
    notesEnabled?: boolean;
    hasReliablePageHints?: boolean;
  };
};

export type PdfDecisionEvaluationResult = {
  name: string;
  description?: string;
  passed: boolean;
  failures: string[];
  route: PdfDecisionRoute;
  riskLevel: PdfDecisionRiskLevel;
  confidenceScore: number;
  manualReviewReasons: string[];
  reasons: string[];
  enabledExtractors: PdfDecisionEngineOutput["enabledExtractors"];
  pageHints: PdfDecisionEngineOutput["pageHints"];
};

export type PdfDecisionEvaluationSummary = {
  version: "pdf-decision-evaluation-v1";
  fixtureCount: number;
  passedCount: number;
  failedCount: number;
  results: PdfDecisionEvaluationResult[];
};

// Backward-compat alias so existing imports of PdfDecisionFixture continue to work.
export type PdfDecisionFixture = PdfDecisionEvaluationFixture;

function normalizeFixtureInput(
  fixture: PdfDecisionEvaluationFixture,
): Parameters<typeof runPdfDecisionEngine>[0] {
  const raw = fixture.input;
  const pageHints = raw.pageHints
    ? {
        ...raw.pageHints,
        excludePages: new Set(raw.pageHints.excludePages ?? []),
      }
    : undefined;

  return {
    ...raw,
    pageHints,
    odlConfig: raw.odlConfig ?? raw.openDataLoaderConfig ?? null,
  };
}

export function evaluatePdfDecisionFixture(
  fixture: PdfDecisionEvaluationFixture,
  options?: { ruleConfig?: PdfDecisionRuleConfigOverrides | PdfDecisionRuleConfig },
): PdfDecisionEvaluationResult {
  const decision = runPdfDecisionEngine(normalizeFixtureInput(fixture), options);
  const failures: string[] = [];
  const expected = fixture.expected;

  if (expected.route !== undefined && decision.route !== expected.route) {
    failures.push(`route expected ${expected.route}, got ${decision.route}`);
  }
  if (expected.riskLevel !== undefined && decision.riskLevel !== expected.riskLevel) {
    failures.push(`riskLevel expected ${expected.riskLevel}, got ${decision.riskLevel}`);
  }
  if (
    expected.minConfidenceScore !== undefined &&
    decision.confidenceScore < expected.minConfidenceScore
  ) {
    failures.push(
      `confidenceScore expected >= ${expected.minConfidenceScore}, got ${decision.confidenceScore}`,
    );
  }
  if (
    expected.maxConfidenceScore !== undefined &&
    decision.confidenceScore > expected.maxConfidenceScore
  ) {
    failures.push(
      `confidenceScore expected <= ${expected.maxConfidenceScore}, got ${decision.confidenceScore}`,
    );
  }
  if (
    expected.financialFactsEnabled !== undefined &&
    decision.enabledExtractors.financialFacts !== expected.financialFactsEnabled
  ) {
    failures.push(
      `financialFactsEnabled expected ${expected.financialFactsEnabled}, got ${decision.enabledExtractors.financialFacts}`,
    );
  }
  if (
    expected.boardReportEnabled !== undefined &&
    decision.enabledExtractors.boardReport !== expected.boardReportEnabled
  ) {
    failures.push(
      `boardReportEnabled expected ${expected.boardReportEnabled}, got ${decision.enabledExtractors.boardReport}`,
    );
  }
  if (
    expected.auditorReportEnabled !== undefined &&
    decision.enabledExtractors.auditorReport !== expected.auditorReportEnabled
  ) {
    failures.push(
      `auditorReportEnabled expected ${expected.auditorReportEnabled}, got ${decision.enabledExtractors.auditorReport}`,
    );
  }
  if (
    expected.notesEnabled !== undefined &&
    decision.enabledExtractors.notes !== expected.notesEnabled
  ) {
    failures.push(
      `notesEnabled expected ${expected.notesEnabled}, got ${decision.enabledExtractors.notes}`,
    );
  }
  if (
    expected.hasReliablePageHints !== undefined &&
    decision.pageHints.hasReliableHints !== expected.hasReliablePageHints
  ) {
    failures.push(
      `hasReliablePageHints expected ${expected.hasReliablePageHints}, got ${decision.pageHints.hasReliableHints}`,
    );
  }
  for (const fragment of expected.manualReviewReasonIncludes ?? []) {
    if (!decision.manualReviewReasons.some((reason) => reason.includes(fragment))) {
      failures.push(`manualReviewReasons missing "${fragment}"`);
    }
  }
  for (const fragment of expected.reasonIncludes ?? []) {
    if (!decision.reasons.some((reason) => reason.includes(fragment))) {
      failures.push(`reasons missing "${fragment}"`);
    }
  }

  return {
    name: fixture.name,
    description: fixture.description,
    passed: failures.length === 0,
    failures,
    route: decision.route,
    riskLevel: decision.riskLevel,
    confidenceScore: decision.confidenceScore,
    manualReviewReasons: decision.manualReviewReasons,
    reasons: decision.reasons,
    enabledExtractors: decision.enabledExtractors,
    pageHints: decision.pageHints,
  };
}

export function evaluatePdfDecisionFixtures(
  fixtures: PdfDecisionEvaluationFixture[],
  options?: { ruleConfig?: PdfDecisionRuleConfigOverrides | PdfDecisionRuleConfig },
): PdfDecisionEvaluationSummary {
  const results = fixtures.map((fixture) => evaluatePdfDecisionFixture(fixture, options));
  const passedCount = results.filter((result) => result.passed).length;
  return {
    version: "pdf-decision-evaluation-v1",
    fixtureCount: fixtures.length,
    passedCount,
    failedCount: fixtures.length - passedCount,
    results,
  };
}
