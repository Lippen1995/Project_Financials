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
