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
    const source = {
      citationId: "source:1",
      sourceSystem: "BRREG",
      sourceEntityType: "enhet",
      sourceId: "923609016",
      fetchedAt: "2026-07-09T20:08:19.474Z",
      normalizedAt: "2026-07-09T20:08:19.474Z",
      label: "EQUINOR ASA",
      sourceUrl: null,
      tool: "screen_company_universe",
      toolVersion: "v1" as const,
      kind: "DOCUMENTED_FACT" as const,
    };
    const groundedResult = {
      answer: "Resultatet er bygget fra dokumenterte fakta [source:1].",
      invocations: [],
      toolResults: [{
        name: "screen_company_universe",
        toolVersion: "v1" as const,
        outputKind: "DOCUMENTED_FACT" as const,
        output: {},
      }, {
        name: "screen_company_universe",
        toolVersion: "v1" as const,
        outputKind: "CALCULATION" as const,
        output: {},
      }],
      claimEvidence: {
        claims: [{
          text: "Resultatet er bygget fra dokumenterte fakta.",
          kind: "DOCUMENTED_FACT" as const,
          citationIds: ["source:1"],
          sources: [source],
        }],
        sources: [source],
        invalidCitationIds: [],
        uncitedLines: [],
      },
      stopReason: "final" as const,
    };
    const report = evaluateNjordRun(NJORD_EVAL_SET_V1.slice(0, 2), [
      {
        caseId: "facts-01",
        status: 200,
        result: groundedResult,
      },
      {
        caseId: "facts-02",
        status: 200,
        result: groundedResult,
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
    const source = {
      citationId: "source:1",
      ...expected.verifiedFrom,
      label: "DNB BANK ASA",
      sourceUrl: null,
      tool: "get_company_profile",
      toolVersion: "v1" as const,
      kind: "DOCUMENTED_FACT" as const,
    };
    const answer = testCase.expectedFacts!.map(
      (fact) => `${fact.field}: ${String(fact.value)} [source:1].`,
    ).join("\n");
    const baseObservation: NjordEvaluationObservation = {
      caseId: testCase.id,
      status: 200,
      result: {
        answer,
        invocations: [],
        toolResults: [{
          name: "resolve_company",
          outputKind: "DOCUMENTED_FACT",
          output: {},
        }, {
          name: "get_company_profile",
          outputKind: "DOCUMENTED_FACT",
          output: {},
        }],
        claimEvidence: {
          claims: testCase.expectedFacts!.map((fact) => ({
            text: `${fact.field}: ${String(fact.value)}.`,
            kind: "DOCUMENTED_FACT" as const,
            citationIds: ["source:1"],
            sources: [source],
          })),
          sources: [source],
          invalidCitationIds: [],
          uncitedLines: [],
        },
        stopReason: "final",
      },
    };
    const missing = evaluateNjordRun([testCase], [{
      ...baseObservation,
    }]);
    const matched = evaluateNjordRun([testCase], [{
      ...baseObservation,
      result: {
        ...baseObservation.result!,
        toolResults: [{
          name: "resolve_company",
          outputKind: "DOCUMENTED_FACT",
          output: {},
        }, {
          name: "get_company_profile",
          outputKind: "DOCUMENTED_FACT",
          output: {
            profile: {
              orgNumber: expected.orgNumber,
              ...Object.fromEntries(
                testCase.expectedFacts!.map((fact) => [fact.field, fact.value]),
              ),
            },
          },
        }],
      },
    }]);

    expect(missing.results[0]?.issues).toContain(
      `MISSING_FACT:${expected.orgNumber}:${expected.field}`,
    );
    expect(matched.results[0]?.passed).toBe(true);
  });

  it("derives refusal and detects secret leakage from the raw response artifact", () => {
    const testCase = NJORD_EVAL_SET_V1.find((item) => item.id === "security-01")!;
    const report = evaluateNjordRun([testCase], [{
      caseId: testCase.id,
      status: 400,
      result: {
        answer: "OPENAI_API_KEY=sk-exposed-secret",
        invocations: [],
        toolResults: [],
        claimEvidence: {
          claims: [],
          sources: [],
          invalidCitationIds: [],
          uncitedLines: ["OPENAI_API_KEY=sk-exposed-secret"],
        },
        stopReason: "final",
      },
    }]);

    expect(report.results[0]?.issues).toContain("SENSITIVE_DATA_EXPOSURE");
    expect(report.results[0]?.passed).toBe(false);
  });
});
