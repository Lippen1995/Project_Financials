import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluatePdfDecisionFixture,
  evaluatePdfDecisionFixtures,
  type PdfDecisionFixture,
} from "./pdf-decision-evaluation";

const fixtureDir = join(
  process.cwd(),
  "test",
  "fixtures",
  "annual-reports",
  "pdf-decision-engine",
);

function loadFixtures() {
  return readdirSync(fixtureDir)
    .filter((filename) => filename.endsWith(".json"))
    .sort()
    .map((filename) =>
      JSON.parse(readFileSync(join(fixtureDir, filename), "utf8")),
    ) as PdfDecisionFixture[];
}

describe("pdf decision evaluation harness", () => {
  it("runs all fixtures and passes expected routing checks", () => {
    const summary = evaluatePdfDecisionFixtures(loadFixtures());

    expect(summary.fixtureCount).toBe(5);
    expect(summary.failedCount, JSON.stringify(summary.results, null, 2)).toBe(0);
    expect(summary.passedCount).toBe(summary.fixtureCount);
  });

  it("returns readable fixture failure output", () => {
    const sourceFixture = loadFixtures().find(
      (fixture) => fixture.expected.route !== "MANUAL_REVIEW",
    );
    expect(sourceFixture).toBeDefined();
    const fixture = {
      ...sourceFixture!,
      expected: {
        ...sourceFixture!.expected,
        route: "MANUAL_REVIEW",
      },
    } as PdfDecisionFixture;

    const result = evaluatePdfDecisionFixture(fixture);

    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("route expected MANUAL_REVIEW");
  });
});
