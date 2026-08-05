import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { PdfDecisionEvaluationFixture } from "@/integrations/brreg/annual-report-financials/pdf-decision-evaluation";
import {
  evaluatePdfDecisionRuleTuningCandidates,
  type PdfDecisionRuleTuningCandidate,
  type PdfDecisionRuleTuningReport,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-tuning";
import {
  evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot,
  type PdfDecisionGoldSetRuleTuningReport,
  type PdfDecisionGoldSetSnapshot,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-gold-set-rule-tuning";
import type { PdfDecisionRegressionGuardResult } from "@/integrations/brreg/annual-report-financials/pdf-decision-regression-guard";
import {
  getPdfDecisionRuleCandidateById,
  listPdfDecisionRuleCandidates,
  type PdfDecisionRuleCandidateFamily,
} from "@/integrations/brreg/annual-report-financials/pdf-decision-rule-candidates";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readNumberOption(prefix: string): number | undefined {
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
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

function loadGoldSetSnapshot(): PdfDecisionGoldSetSnapshot | null {
  const snapshotPath = readOption("--gold-set-snapshot=");
  if (!snapshotPath) return null;
  const raw = readFileSync(snapshotPath, "utf8");
  return JSON.parse(raw) as PdfDecisionGoldSetSnapshot;
}

function selectCandidates(): PdfDecisionRuleTuningCandidate[] {
  const candidateId = readOption("--candidate=");
  if (candidateId) {
    const candidate = getPdfDecisionRuleCandidateById(candidateId);
    if (!candidate) throw new Error(`Unknown PDF Decision rule candidate: ${candidateId}`);
    return [candidate];
  }
  const family = readOption("--family=");
  return listPdfDecisionRuleCandidates({
    family: family ? (family as PdfDecisionRuleCandidateFamily) : undefined,
  });
}

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

function printGoldSetSnapshotSummary(report: PdfDecisionGoldSetRuleTuningReport) {
  console.log("Gold-set snapshot tuning");
  console.log(`Snapshot items: ${report.candidates[0]?.snapshotItemCount ?? 0}`);
  for (const candidate of report.candidates) {
    console.log(
      `${candidate.candidateId}: matched=${candidate.matchedCount}, changed=${candidate.changedItems.length}`,
    );
    for (const item of candidate.changedItems) {
      const note = item.notes[0] ?? "";
      console.log(`  [${item.changeType}] ${item.filingId}: ${note}`);
    }
  }
  console.log(`Recommendation: ${report.recommendation.bestCandidateId ?? "none"}`);
  console.log(report.recommendation.reason);
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
  const candidates = selectCandidates();
  const report = evaluatePdfDecisionRuleTuningCandidates({
    fixtures: loadFixtures(),
    candidates,
  });

  const snapshot = loadGoldSetSnapshot();
  const snapshotReport = snapshot
    ? evaluatePdfDecisionRuleTuningAgainstGoldSetSnapshot({ snapshot, candidates })
    : null;

  const goldSetGuard = await runGoldSetGuard();

  if (hasFlag("--json")) {
    console.log(
      JSON.stringify(
        {
          tuningReport: report,
          goldSetSnapshotReport: snapshotReport,
          goldSetGuard,
        },
        null,
        2,
      ),
    );
  } else {
    printTuningSummary(report);
    if (snapshotReport) printGoldSetSnapshotSummary(snapshotReport);
    if (goldSetGuard) printGoldSetSummary(goldSetGuard);
  }

  if (goldSetGuard && !goldSetGuard.passed) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
