import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  runPdfDecisionFixtureRegressionGuard,
  type PdfDecisionRegressionGuardResult,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-regression-guard";
import type { PdfDecisionEvaluationFixture } from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function loadFixtures(): PdfDecisionEvaluationFixture[] {
  const fixtureDir = join(
    process.cwd(),
    "test",
    "fixtures",
    "annual-reports",
    "pdf-decision-engine",
  );
  return readdirSync(fixtureDir)
    .filter((filename) => filename.endsWith(".json"))
    .sort()
    .map((filename) =>
      JSON.parse(readFileSync(join(fixtureDir, filename), "utf8")),
    ) as PdfDecisionEvaluationFixture[];
}

function printSummary(result: PdfDecisionRegressionGuardResult) {
  console.log("PDF Decision regression guard");
  console.log(
    `Fixtures: ${result.fixtureSummary.passedCount}/${result.fixtureSummary.fixtureCount} passed`,
  );
  if (result.goldSetSummary) {
    console.log(
      `Gold set: ${result.goldSetSummary.matchCount}/${result.goldSetSummary.totalItems} matched, ${result.goldSetSummary.errorCount} errors`,
    );
  }
  for (const failure of result.failures) {
    console.log(`[${failure.severity}] ${failure.source} ${failure.name}`);
    for (const message of failure.failures) {
      console.log(`  - ${message}`);
    }
  }
}

async function main() {
  const json = hasFlag("--json");
  const includeGoldSet = hasFlag("--gold-set");
  const strict = hasFlag("--strict");

  const fixtureGuard = runPdfDecisionFixtureRegressionGuard(loadFixtures());
  let result: PdfDecisionRegressionGuardResult = fixtureGuard;

  if (includeGoldSet) {
    if (!process.env.DATABASE_URL) {
      console.error("--gold-set requires DATABASE_URL.");
      process.exitCode = 1;
      return;
    }
    const { runPdfDecisionGoldSetRegressionGuard } = await import(
      "@/server/services/pdf-decision-gold-set-regression-guard-service"
    );
    const goldSetGuard = await runPdfDecisionGoldSetRegressionGuard({ strict });
    result = {
      ...fixtureGuard,
      passed: fixtureGuard.passed && goldSetGuard.passed,
      goldSetSummary: goldSetGuard.goldSetSummary,
      failures: [...fixtureGuard.failures, ...goldSetGuard.failures],
    };
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }
  if (!result.passed) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
