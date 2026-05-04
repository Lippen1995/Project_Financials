import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { PdfDecisionEvaluationFixture } from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";
import {
  DEFAULT_PDF_DECISION_RULE_TUNING_CANDIDATES,
  evaluatePdfDecisionRuleTuningCandidates,
  type PdfDecisionRuleTuningReport,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-tuning";

function loadPdfDecisionFixtureFiles(): PdfDecisionEvaluationFixture[] {
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

export function runDefaultPdfDecisionRuleTuningSimulation(): PdfDecisionRuleTuningReport {
  return evaluatePdfDecisionRuleTuningCandidates({
    fixtures: loadPdfDecisionFixtureFiles(),
    candidates: DEFAULT_PDF_DECISION_RULE_TUNING_CANDIDATES,
  });
}
