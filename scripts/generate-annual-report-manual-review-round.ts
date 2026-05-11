import {
  buildAnnualReportManualReviewRound,
  persistAnnualReportManualReviewRoundArtifacts,
  renderAnnualReportManualReviewRoundMarkdown,
} from "@/server/services/annual-report-manual-review-round-service";
import { readFlag } from "@/scripts/financial-script-utils";

async function main() {
  const runId = readFlag("run-id") ?? undefined;
  const round = await buildAnnualReportManualReviewRound({ runId });

  if (!round) {
    throw new Error("No persisted gold-set shadow run found to build a manual review round from.");
  }

  await persistAnnualReportManualReviewRoundArtifacts(round);
  console.log(renderAnnualReportManualReviewRoundMarkdown(round));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

