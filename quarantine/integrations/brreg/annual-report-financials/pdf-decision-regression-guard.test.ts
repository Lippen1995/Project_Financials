import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PdfDecisionEvaluationFixture } from "./pdf-decision-evaluation";
import { runPdfDecisionFixtureRegressionGuard } from "./pdf-decision-regression-guard";

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

describe("pdf decision regression guard", () => {
  it("passes all valid fixtures", () => {
    const result = runPdfDecisionFixtureRegressionGuard(loadFixtures());

    expect(result.version).toBe("pdf-decision-regression-guard-v1");
    expect(result.passed).toBe(true);
    expect(result.fixtureSummary.fixtureCount).toBe(6);
    expect(result.fixtureSummary.failedCount).toBe(0);
    expect(result.failures).toEqual([]);
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it("fails for an intentionally broken fixture", () => {
    const sourceFixture = loadFixtures().find(
      (fixture) => fixture.expected.route !== "MANUAL_REVIEW",
    );
    expect(sourceFixture).toBeDefined();
    const brokenFixture: PdfDecisionEvaluationFixture = {
      ...sourceFixture!,
      name: "broken fixture",
      expected: {
        ...sourceFixture!.expected,
        route: "MANUAL_REVIEW",
      },
    };

    const result = runPdfDecisionFixtureRegressionGuard([brokenFixture]);

    expect(result.passed).toBe(false);
    expect(result.fixtureSummary).toMatchObject({
      fixtureCount: 1,
      passedCount: 0,
      failedCount: 1,
    });
    expect(result.failures[0]).toMatchObject({
      source: "FIXTURE",
      name: "broken fixture",
      severity: "ERROR",
    });
    expect(result.failures[0].failures[0]).toContain("route expected MANUAL_REVIEW");
  });
});
