import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { PdfDecisionEvaluationFixture } from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";
import {
  DEFAULT_PDF_DECISION_RULE_TUNING_CANDIDATES,
  type PdfDecisionRuleTuningReport,
  evaluatePdfDecisionRuleTuningCandidates,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-tuning";
import type { PdfDecisionRegressionGuardResult } from "@/integrations/brreg/annual-report-financials/pdf-decision-regression-guard";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readNumberOption(prefix: string): number | undefined {
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
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

const report = evaluatePdfDecisionRuleTuningCandidates({
  fixtures: loadFixtures(),
  candidates: DEFAULT_PDF_DECISION_RULE_TUNING_CANDIDATES,
});

function printTuningSummary(tuningReport: PdfDecisionRuleTuningReport) {
  console.log("PDF Decision rule tuning simulation");
  console.log(`Fixtures: ${tuningReport.fixtureCount}`);
  for (const candidate of tuningReport.candidates) {
    console.log(
      `${candidate.candidateId}: deltaFailed=${candidate.deltaFailedCount}, changed=${candidate.changedDecisions.length}`,
    );
  }
  console.log(`Recommendation: ${tuningReport.recommendation.bestCandidateId ?? "none"}`);
  console.log(tuningReport.recommendation.reason);
}

function printGoldSetSummary(result: PdfDecisionRegressionGuardResult) {
  if (!result.goldSetSummary) return;
  console.log("Gold-set regression guard");
  console.log(
    `Gold set: ${result.goldSetSummary.matchCount}/${result.goldSetSummary.totalItems} matched, ${result.goldSetSummary.errorCount} errors`,
  );
  for (const failure of result.failures) {
    console.log(`[${failure.severity}] ${failure.source} ${failure.name}`);
    for (const message of failure.failures) {
      console.log(`  - ${message}`);
    }
  }
}

async function runGoldSetGuard(): Promise<PdfDecisionRegressionGuardResult | undefined> {
  if (!hasFlag("--gold-set")) return undefined;
  if (!process.env.DATABASE_URL) {
    throw new Error("--gold-set requires DATABASE_URL.");
  }
  const { runPdfDecisionGoldSetRegressionGuard } = await import(
    "@/server/services/pdf-decision-gold-set-regression-guard-service"
  );
  return runPdfDecisionGoldSetRegressionGuard({
    strict: hasFlag("--strict"),
    limit: readNumberOption("--limit="),
  });
}

async function main() {
  const goldSetGuard = await runGoldSetGuard();
  if (hasFlag("--json")) {
    console.log(
      JSON.stringify(
        {
          tuningReport: report,
          goldSetGuard,
        },
        null,
        2,
      ),
    );
  } else {
    printTuningSummary(report);
    if (goldSetGuard) printGoldSetSummary(goldSetGuard);
  }
  if (goldSetGuard && !goldSetGuard.passed) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
