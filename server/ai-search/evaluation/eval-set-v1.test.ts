import { describe, expect, it } from "vitest";

import { NJORD_EVAL_SET_V1 } from "./eval-set-v1";
import { evaluateNjordRun } from "./evaluator";

describe("Njord evaluation set v1", () => {
  it("stores 50 unique representative cases across required outcomes", () => {
    expect(NJORD_EVAL_SET_V1).toHaveLength(50);
    expect(new Set(NJORD_EVAL_SET_V1.map((item) => item.id)).size).toBe(50);
    expect(new Set(NJORD_EVAL_SET_V1.map((item) => item.expectedOutcome))).toEqual(
      new Set(["GROUNDED_ANSWER", "UNAVAILABLE", "REFUSAL"]),
    );
  });

  it("scores tool use, grounding, safety and response contract deterministically", () => {
    const report = evaluateNjordRun(NJORD_EVAL_SET_V1.slice(0, 2), [
      {
        caseId: "facts-01",
        answer: "Resultatet er bygget fra dokumenterte fakta.",
        toolNames: ["screen_company_universe"],
        evidenceKinds: ["DOCUMENTED_FACT", "CALCULATION"],
        ungroundedOrgNumbers: [],
        outcome: "GROUNDED_ANSWER",
      },
      {
        caseId: "facts-02",
        answer: "Resultatet er bygget fra dokumenterte fakta.",
        toolNames: ["screen_company_universe"],
        evidenceKinds: ["DOCUMENTED_FACT", "CALCULATION"],
        ungroundedOrgNumbers: [],
        outcome: "GROUNDED_ANSWER",
      },
    ]);

    expect(report).toMatchObject({
      version: "njord-evaluation-report-v1",
      total: 2,
      passed: 2,
      passRate: 1,
    });
  });
});
