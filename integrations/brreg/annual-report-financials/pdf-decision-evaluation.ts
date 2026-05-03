import type { FinancialExtractionPageHints } from "@/integrations/brreg/annual-report-financials/financial-extraction-page-hints";
import { runPdfDecisionEngine } from "@/integrations/brreg/annual-report-financials/pdf-decision-engine";
import type {
  PdfDecisionRiskLevel,
  PdfDecisionRoute,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-types";

type PdfDecisionFixture = {
  name: string;
  input: Parameters<typeof runPdfDecisionEngine>[0] & {
    pageHints?: Omit<FinancialExtractionPageHints, "excludePages"> & {
      excludePages?: number[];
    };
    openDataLoaderConfig?: Parameters<typeof runPdfDecisionEngine>[0]["odlConfig"];
  };
  expected: {
    route: PdfDecisionRoute;
    riskLevel: PdfDecisionRiskLevel;
    manualReviewReasonIncludes?: string[];
    financialFactsEnabled?: boolean;
  };
};

export type PdfDecisionEvaluationResult = {
  name: string;
  route: PdfDecisionRoute;
  riskLevel: PdfDecisionRiskLevel;
  confidenceScore: number;
  expectedRoute: PdfDecisionRoute;
  expectedRiskLevel: PdfDecisionRiskLevel;
  passed: boolean;
  failures: string[];
};

function normalizeFixtureInput(fixture: PdfDecisionFixture) {
  const pageHints = fixture.input.pageHints
    ? {
        ...fixture.input.pageHints,
        excludePages: new Set(fixture.input.pageHints.excludePages ?? []),
      }
    : undefined;

  return {
    ...fixture.input,
    pageHints,
    odlConfig: fixture.input.odlConfig ?? fixture.input.openDataLoaderConfig ?? null,
  };
}

export function evaluatePdfDecisionFixture(
  fixture: PdfDecisionFixture,
): PdfDecisionEvaluationResult {
  const decision = runPdfDecisionEngine(normalizeFixtureInput(fixture));
  const failures: string[] = [];

  if (decision.route !== fixture.expected.route) {
    failures.push(`route expected ${fixture.expected.route}, got ${decision.route}`);
  }
  if (decision.riskLevel !== fixture.expected.riskLevel) {
    failures.push(
      `riskLevel expected ${fixture.expected.riskLevel}, got ${decision.riskLevel}`,
    );
  }
  if (
    fixture.expected.financialFactsEnabled !== undefined &&
    decision.enabledExtractors.financialFacts !== fixture.expected.financialFactsEnabled
  ) {
    failures.push(
      `financialFactsEnabled expected ${fixture.expected.financialFactsEnabled}, got ${decision.enabledExtractors.financialFacts}`,
    );
  }
  for (const expectedReason of fixture.expected.manualReviewReasonIncludes ?? []) {
    if (!decision.manualReviewReasons.some((reason) => reason.includes(expectedReason))) {
      failures.push(`manualReviewReasons missing "${expectedReason}"`);
    }
  }

  return {
    name: fixture.name,
    route: decision.route,
    riskLevel: decision.riskLevel,
    confidenceScore: decision.confidenceScore,
    expectedRoute: fixture.expected.route,
    expectedRiskLevel: fixture.expected.riskLevel,
    passed: failures.length === 0,
    failures,
  };
}

export function evaluatePdfDecisionFixtures(fixtures: PdfDecisionFixture[]) {
  const results = fixtures.map(evaluatePdfDecisionFixture);
  const passedCount = results.filter((result) => result.passed).length;
  return {
    fixtureCount: fixtures.length,
    passedCount,
    failedCount: fixtures.length - passedCount,
    results,
  };
}

export type { PdfDecisionFixture };

