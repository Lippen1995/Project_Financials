import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PdfDecisionEvaluationFixture } from "./pdf-decision-evaluation";
import {
  evaluatePdfDecisionRuleTuningCandidates,
  type PdfDecisionRuleTuningCandidate,
} from "./pdf-decision-rule-tuning";

const fixtureDir = join(
  process.cwd(),
  "test",
  "fixtures",
  "annual-reports",
  "pdf-decision-engine",
);

function loadFixtures(): PdfDecisionEvaluationFixture[] {
  return readdirSync(fixtureDir)
    .filter((filename) => filename.endsWith(".json"))
    .sort()
    .map((filename) =>
      JSON.parse(readFileSync(join(fixtureDir, filename), "utf8")),
    ) as PdfDecisionEvaluationFixture[];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("evaluatePdfDecisionRuleTuningCandidates", () => {
  it("handles empty candidates", () => {
    const report = evaluatePdfDecisionRuleTuningCandidates({
      fixtures: loadFixtures(),
      candidates: [],
    });

    expect(report.version).toBe("pdf-decision-rule-tuning-v1");
    expect(report.candidates).toEqual([]);
    expect(report.recommendation.reason).toContain("No tuning candidates");
  });

  it("reports confidence-only candidate changes", () => {
    const report = evaluatePdfDecisionRuleTuningCandidates({
      fixtures: loadFixtures(),
      candidates: [
        {
          id: "confidence-only",
          ruleConfigOverride: {
            confidence: { bonuses: { reliablePageHints: 0.15 } },
          },
        },
      ],
    });

    expect(report.candidates[0].changedDecisions.some(
      (change) => change.changeType === "CONFIDENCE_CHANGED",
    )).toBe(true);
  });

  it("marks a regressing candidate", () => {
    const fixture = loadFixtures().find((item) =>
      item.name.includes("reliable text with income and balance"),
    );
    expect(fixture).toBeDefined();
    const confidenceSensitiveFixture: PdfDecisionEvaluationFixture = {
      ...deepClone(fixture!),
      expected: {
        ...fixture!.expected,
        minConfidenceScore: 0.8,
      },
    };

    const report = evaluatePdfDecisionRuleTuningCandidates({
      fixtures: [confidenceSensitiveFixture],
      candidates: [
        {
          id: "regressing",
          ruleConfigOverride: {
            confidence: { bonuses: { reliablePageHints: -0.3 } },
          },
        },
      ],
    });

    expect(report.candidates[0].candidateFailedCount).toBeGreaterThan(0);
    expect(report.candidates[0].changedDecisions.some(
      (change) => change.changeType === "REGRESSED",
    )).toBe(true);
  });

  it("marks an improving candidate", () => {
    const fixture = loadFixtures().find((item) =>
      item.name.includes("reliable text with income and balance"),
    );
    expect(fixture).toBeDefined();
    const strictFixture: PdfDecisionEvaluationFixture = {
      ...deepClone(fixture!),
      expected: {
        ...fixture!.expected,
        minConfidenceScore: 0.98,
      },
    };
    const candidate: PdfDecisionRuleTuningCandidate = {
      id: "improves-confidence",
      ruleConfigOverride: {
        confidence: { bonuses: { reliablePageHints: 0.2 } },
      },
    };

    const report = evaluatePdfDecisionRuleTuningCandidates({
      fixtures: [strictFixture],
      candidates: [candidate],
    });

    expect(report.candidates[0].defaultFailedCount).toBe(1);
    expect(report.candidates[0].candidateFailedCount).toBe(0);
    expect(report.candidates[0].changedDecisions[0].changeType).toBe("IMPROVED");
  });

  it("does not mutate fixtures", () => {
    const fixtures = loadFixtures();
    const before = deepClone(fixtures);

    evaluatePdfDecisionRuleTuningCandidates({
      fixtures,
      candidates: [
        {
          id: "confidence-only",
          ruleConfigOverride: {
            confidence: { bonuses: { reliablePageHints: 0.15 } },
          },
        },
      ],
    });

    expect(fixtures).toEqual(before);
  });
});
