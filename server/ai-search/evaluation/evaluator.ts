import type {
  NjordEvaluationCase,
  NjordExpectedOutcome,
} from "./eval-set-v1";

export type NjordEvaluationObservation = {
  caseId: string;
  answer: string | null;
  toolNames: string[];
  evidenceKinds: Array<"DOCUMENTED_FACT" | "CALCULATION" | "EXPLANATION">;
  ungroundedOrgNumbers: string[];
  outcome: NjordExpectedOutcome;
  facts?: Array<{
    orgNumber: string;
    field: string;
    value: string | number | boolean | null;
    citationIds: string[];
  }>;
  sources?: Array<{
    citationId: string;
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: string;
    normalizedAt: string;
  }>;
};

export function evaluateNjordRun(
  cases: readonly NjordEvaluationCase[],
  observations: NjordEvaluationObservation[],
) {
  const observationsById = new Map(observations.map((item) => [item.caseId, item]));
  const results = cases.map((testCase) => {
    const observation = observationsById.get(testCase.id);
    const issues: string[] = [];
    if (!observation) {
      issues.push("MISSING_OBSERVATION");
    } else {
      if (observation.outcome !== testCase.expectedOutcome) issues.push("WRONG_OUTCOME");
      for (const requiredTool of testCase.requiredTools) {
        if (!observation.toolNames.includes(requiredTool)) issues.push(`MISSING_TOOL:${requiredTool}`);
      }
      if (
        testCase.forbiddenTools?.includes("*") &&
        observation.toolNames.length > 0
      ) {
        issues.push("FORBIDDEN_TOOL_USE");
      }
      for (const forbiddenTool of testCase.forbiddenTools ?? []) {
        if (forbiddenTool !== "*" && observation.toolNames.includes(forbiddenTool)) {
          issues.push(`FORBIDDEN_TOOL:${forbiddenTool}`);
        }
      }
      for (const requiredKind of testCase.requiredEvidenceKinds) {
        if (!observation.evidenceKinds.includes(requiredKind)) {
          issues.push(`MISSING_EVIDENCE:${requiredKind}`);
        }
      }
      if (observation.ungroundedOrgNumbers.length > 0) issues.push("UNGROUNDED_COMPANY");
      if (testCase.requiresCitation && !/knowledge:[A-Za-z0-9:_-]+/.test(observation.answer ?? "")) {
        issues.push("MISSING_CITATION");
      }
      for (const expectedFact of testCase.expectedFacts ?? []) {
        const issueSuffix = `${expectedFact.orgNumber}:${expectedFact.field}`;
        const observedFact = observation.facts?.find(
          (fact) =>
            fact.orgNumber === expectedFact.orgNumber &&
            fact.field === expectedFact.field,
        );
        if (!observedFact) {
          issues.push(`MISSING_FACT:${issueSuffix}`);
          continue;
        }
        if (observedFact.value !== expectedFact.value) {
          issues.push(`WRONG_FACT:${issueSuffix}`);
          continue;
        }
        if (observedFact.citationIds.length === 0) {
          issues.push(`MISSING_FACT_CITATION:${issueSuffix}`);
          continue;
        }
        const hasExpectedSource = observedFact.citationIds.some((citationId) =>
          observation.sources?.some((source) =>
            source.citationId === citationId &&
            source.sourceSystem === expectedFact.verifiedFrom.sourceSystem &&
            source.sourceEntityType === expectedFact.verifiedFrom.sourceEntityType &&
            source.sourceId === expectedFact.verifiedFrom.sourceId &&
            !Number.isNaN(Date.parse(source.fetchedAt)) &&
            !Number.isNaN(Date.parse(source.normalizedAt)),
          ),
        );
        if (!hasExpectedSource) issues.push(`MISSING_FACT_SOURCE:${issueSuffix}`);
      }
    }
    return { caseId: testCase.id, passed: issues.length === 0, issues };
  });
  const passed = results.filter((item) => item.passed).length;
  return {
    version: "njord-evaluation-report-v1" as const,
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length === 0 ? 0 : passed / results.length,
    results,
  };
}
