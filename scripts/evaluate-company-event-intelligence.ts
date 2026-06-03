import { writeFile } from "node:fs/promises";

import { evaluateCompanyEventIntelligence } from "@/server/news/company-event-quality-evaluation";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const limitArg = argValue("limit");
  const output = argValue("output");
  const asJson = process.argv.includes("--json") || Boolean(output);
  const limit = limitArg ? Number(limitArg) : undefined;

  const report = await evaluateCompanyEventIntelligence({
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  if (output) {
    await writeFile(output, JSON.stringify(report, null, 2), "utf8");
    console.log(`Company Event Intelligence evaluation written to ${output}`);
    return;
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Company Event Intelligence evaluation");
  console.log(`Generated: ${report.generatedAt}`);
  console.log("");
  console.log(`Source documents: ${report.totals.sourceDocuments}`);
  console.log(`Company events:    ${report.totals.companyEvents}`);
  console.log(`Feedback rows:     ${report.totals.feedback}`);
  console.log(`Average score:     ${report.scoreStats.averageInvestorValueScore}`);
  console.log(`High-value events: ${report.scoreStats.highValueEvents}`);
  console.log(`Low-signal events: ${report.scoreStats.lowSignalEvents}`);
  console.log(
    `Curated gold set: ${report.curatedGoldSet.matchedCases}/${report.curatedGoldSet.totalCases} matched, ${
      report.curatedGoldSet.passedCases
    } passed${report.curatedGoldSet.passRate === null ? "" : ` (${(report.curatedGoldSet.passRate * 100).toFixed(1)}%)`}`,
  );
  console.log("");
  console.log("Top event types:");
  for (const [eventType, count] of Object.entries(report.eventsByType).slice(0, 10)) {
    console.log(`- ${eventType}: ${count}`);
  }
  console.log("");
  console.log("Exposure types:");
  for (const [exposureType, count] of Object.entries(report.exposuresByType).slice(0, 10)) {
    console.log(`- ${exposureType}: ${count}`);
  }
  console.log("");
  console.log(
    `False-positive candidates: ${
      report.falsePositiveCandidates.lowEntityConfidenceHighScore.length +
      report.falsePositiveCandidates.highScoreWeakEvidence.length +
      report.falsePositiveCandidates.commonNameMatches.length
    }`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
