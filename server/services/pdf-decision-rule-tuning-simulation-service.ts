import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { PdfDecisionEvaluationFixture } from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";
import {
  evaluatePdfDecisionRuleTuningCandidates,
  type PdfDecisionRuleTuningReport,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-tuning";
import {
  getPdfDecisionRuleCandidateById,
  listPdfDecisionRuleCandidates,
  type PdfDecisionRuleCandidateFamily,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-candidates";

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

export function runDefaultPdfDecisionRuleTuningSimulation(input?: {
  family?: PdfDecisionRuleCandidateFamily;
  candidateId?: string;
}): PdfDecisionRuleTuningReport {
  const candidate = input?.candidateId
    ? getPdfDecisionRuleCandidateById(input.candidateId)
    : undefined;
  const candidates = input?.candidateId
    ? candidate
      ? [candidate]
      : []
    : listPdfDecisionRuleCandidates({ family: input?.family });
  return evaluatePdfDecisionRuleTuningCandidates({
    fixtures: loadPdfDecisionFixtureFiles(),
    candidates,
  });
}
