import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluatePdfDecisionFixture,
  evaluatePdfDecisionFixtures,
  type PdfDecisionEvaluationFixture,
} from "./pdf-decision-evaluation";

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

describe("pdf decision evaluation harness", () => {
  it("loads at least 6 fixtures", () => {
    const fixtures = loadFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  it("runs all fixtures and passes expected routing checks", () => {
    const fixtures = loadFixtures();
    const summary = evaluatePdfDecisionFixtures(fixtures);

    expect(summary.fixtureCount).toBe(6);
    expect(summary.failedCount, JSON.stringify(summary.results, null, 2)).toBe(0);
    expect(summary.passedCount).toBe(summary.fixtureCount);
  });

  it("summary has correct shape including version field", () => {
    const summary = evaluatePdfDecisionFixtures(loadFixtures());

    expect(summary.version).toBe("pdf-decision-evaluation-v1");
    expect(typeof summary.fixtureCount).toBe("number");
    expect(typeof summary.passedCount).toBe("number");
    expect(typeof summary.failedCount).toBe("number");
    expect(Array.isArray(summary.results)).toBe(true);
  });

  it("result entries have full shape including new fields", () => {
    const summary = evaluatePdfDecisionFixtures(loadFixtures());
    const result = summary.results[0];

    expect(typeof result.name).toBe("string");
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.failures)).toBe(true);
    expect(typeof result.route).toBe("string");
    expect(typeof result.riskLevel).toBe("string");
    expect(typeof result.confidenceScore).toBe("number");
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(Array.isArray(result.manualReviewReasons)).toBe(true);
    expect(result.enabledExtractors).toMatchObject({
      financialFacts: expect.any(Boolean),
      boardReport: expect.any(Boolean),
      auditorReport: expect.any(Boolean),
      notes: expect.any(Boolean),
    });
    expect(result.pageHints).toMatchObject({
      hasReliableHints: expect.any(Boolean),
      includePages: expect.any(Array),
    });
  });

  it("returns readable failure output for intentionally wrong expected route", () => {
    const sourceFixture = loadFixtures().find(
      (fixture) => fixture.expected.route !== "MANUAL_REVIEW",
    );
    expect(sourceFixture).toBeDefined();
    const fixture: PdfDecisionEvaluationFixture = {
      ...sourceFixture!,
      expected: {
        ...sourceFixture!.expected,
        route: "MANUAL_REVIEW",
      },
    };

    const result = evaluatePdfDecisionFixture(fixture);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("route expected MANUAL_REVIEW");
  });

  it("detects confidence score range failures", () => {
    const sourceFixture = loadFixtures()[0];
    const fixture: PdfDecisionEvaluationFixture = {
      ...sourceFixture,
      expected: { ...sourceFixture.expected, minConfidenceScore: 0.9999 },
    };

    const result = evaluatePdfDecisionFixture(fixture);

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("confidenceScore expected >="))).toBe(true);
  });

  it("detects missing reasonIncludes fragment", () => {
    const sourceFixture = loadFixtures()[0];
    const fixture: PdfDecisionEvaluationFixture = {
      ...sourceFixture,
      expected: { ...sourceFixture.expected, reasonIncludes: ["this text will never appear xyz"] },
    };

    const result = evaluatePdfDecisionFixture(fixture);

    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("reasons missing"))).toBe(true);
  });

  it("summary is JSON-safe", () => {
    const summary = evaluatePdfDecisionFixtures(loadFixtures());
    expect(() => JSON.stringify(summary)).not.toThrow();
  });
});
