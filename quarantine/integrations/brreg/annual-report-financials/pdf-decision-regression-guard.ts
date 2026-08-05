import {
  evaluatePdfDecisionFixtures,
  type PdfDecisionEvaluationFixture,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";

export type PdfDecisionRegressionGuardSeverity = "INFO" | "WARNING" | "ERROR";

export type PdfDecisionRegressionGuardFailure = {
  source: "FIXTURE" | "GOLD_SET";
  name: string;
  severity: PdfDecisionRegressionGuardSeverity;
  failures: string[];
};

export type PdfDecisionRegressionGuardResult = {
  version: "pdf-decision-regression-guard-v1";
  generatedAt: string;
  passed: boolean;
  fixtureSummary: {
    fixtureCount: number;
    passedCount: number;
    failedCount: number;
  };
  goldSetSummary?: {
    totalItems: number;
    matchCount: number;
    mismatchCount: number;
    errorCount: number;
  };
  failures: PdfDecisionRegressionGuardFailure[];
};

export function runPdfDecisionFixtureRegressionGuard(
  fixtures: PdfDecisionEvaluationFixture[],
): PdfDecisionRegressionGuardResult {
  const summary = evaluatePdfDecisionFixtures(fixtures);
  const failures = summary.results
    .filter((result) => !result.passed)
    .map((result) => ({
      source: "FIXTURE" as const,
      name: result.name,
      severity: "ERROR" as const,
      failures: result.failures,
    }));

  return {
    version: "pdf-decision-regression-guard-v1",
    generatedAt: new Date().toISOString(),
    passed: failures.length === 0,
    fixtureSummary: {
      fixtureCount: summary.fixtureCount,
      passedCount: summary.passedCount,
      failedCount: summary.failedCount,
    },
    failures,
  };
}
