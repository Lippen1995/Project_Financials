import { describe, expect, it } from "vitest";

import { NJORD_EVAL_SET_V1 } from "./eval-set-v1";
import {
  evaluateNjordRun,
  type NjordEvaluationObservation,
} from "./evaluator";

describe("Njord evaluation set v1", () => {
  it("stores 50 unique representative cases across required outcomes", () => {
    expect(NJORD_EVAL_SET_V1).toHaveLength(50);
    expect(new Set(NJORD_EVAL_SET_V1.map((item) => item.id)).size).toBe(50);
    expect(new Set(NJORD_EVAL_SET_V1.map((item) => item.expectedOutcome))).toEqual(
      new Set(["GROUNDED_ANSWER", "UNAVAILABLE", "REFUSAL"]),
    );
  });

  it("stores verifiable facts for multiple real companies with complete official provenance", () => {
    const realFactCases = NJORD_EVAL_SET_V1.filter(
      (item) => (item.expectedFacts?.length ?? 0) > 0,
    );
    const orgNumbers = new Set(
      realFactCases.flatMap((item) =>
        item.expectedFacts?.map((fact) => fact.orgNumber) ?? [],
      ),
    );

    expect(orgNumbers.size).toBeGreaterThanOrEqual(4);
    expect(
      realFactCases.flatMap((item) => item.expectedFacts ?? []).every((fact) =>
        fact.verifiedFrom.sourceSystem === "BRREG" &&
        fact.verifiedFrom.sourceEntityType.length > 0 &&
        fact.verifiedFrom.sourceId.length > 0 &&
        !Number.isNaN(Date.parse(fact.verifiedFrom.fetchedAt)) &&
        !Number.isNaN(Date.parse(fact.verifiedFrom.normalizedAt))
      ),
    ).toBe(true);
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

  it("fails a real-fact case unless the exact value cites the expected official source", () => {
    const testCase = NJORD_EVAL_SET_V1.find((item) => item.id === "facts-06")!;
    const expected = testCase.expectedFacts![0]!;
    const baseObservation: NjordEvaluationObservation = {
      caseId: testCase.id,
      answer: `Dokumentert svar [source:1].`,
      toolNames: ["resolve_company", "get_company_profile"],
      evidenceKinds: ["DOCUMENTED_FACT"],
      ungroundedOrgNumbers: [],
      outcome: "GROUNDED_ANSWER",
      sources: [{
        citationId: "source:1",
        ...expected.verifiedFrom,
      }],
    };
    const missing = evaluateNjordRun([testCase], [{
      ...baseObservation,
      facts: [],
    }]);
    const matched = evaluateNjordRun([testCase], [{
      ...baseObservation,
      facts: testCase.expectedFacts!.map((fact) => ({
        orgNumber: fact.orgNumber,
        field: fact.field,
        value: fact.value,
        citationIds: ["source:1"],
      })),
    }]);

    expect(missing.results[0]?.issues).toContain(
      `MISSING_FACT:${expected.orgNumber}:${expected.field}`,
    );
    expect(matched.results[0]?.passed).toBe(true);
  });
});
