import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { PdfDecisionEvaluationFixture } from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";
import {
  DEFAULT_PDF_DECISION_RULE_TUNING_CANDIDATES,
  evaluatePdfDecisionRuleTuningCandidates,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-tuning";

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

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("PDF Decision rule tuning simulation");
  console.log(`Fixtures: ${report.fixtureCount}`);
  for (const candidate of report.candidates) {
    console.log(
      `${candidate.candidateId}: deltaFailed=${candidate.deltaFailedCount}, changed=${candidate.changedDecisions.length}`,
    );
  }
  console.log(`Recommendation: ${report.recommendation.bestCandidateId ?? "none"}`);
  console.log(report.recommendation.reason);
}
