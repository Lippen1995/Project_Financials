import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { listAnnualReportDecisionShadowRows } from "@/server/persistence/annual-report-decision-shadow-repository";
import { evaluatePdfDecisionShadow } from "@/server/services/annual-report-pdf-decision-shadow-evaluation";

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const limit = getArg("limit") ? Number(getArg("limit")) : 100;
const fiscalYear = getArg("fiscalYear") ? Number(getArg("fiscalYear")) : undefined;
const orgNumber = getArg("orgNumber");
const jsonOutput = args.includes("--json");

const storage = new LocalAnnualReportArtifactStorage();

const result = await evaluatePdfDecisionShadow(
  { limit, fiscalYear, orgNumber },
  {
    listRows: listAnnualReportDecisionShadowRows,
    readArtifact: async (key) => {
      try {
        return await storage.getArtifactBuffer(key);
      } catch {
        return null;
      }
    },
  },
);

if (jsonOutput) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  const m = result.metrics;
  console.log(`\nPDF Decision Shadow Evaluation — ${result.generatedAt}`);
  console.log(`Limit: ${result.input.limit}${fiscalYear ? `  FY: ${fiscalYear}` : ""}${orgNumber ? `  Org: ${orgNumber}` : ""}`);
  console.log(`\nTotal documents: ${m.totalDocuments}`);

  const printDist = (label: string, dist: Record<string, number>) => {
    console.log(`\n${label}:`);
    for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${v}`);
    }
  };

  printDist("Route distribution", m.routeDistribution);
  printDist("Risk distribution", m.riskDistribution);
  printDist("Outcome distribution", m.outcomeDistribution);

  if (m.topManualReviewReasons.length > 0) {
    console.log("\nTop manual review reasons:");
    for (const { reason, count } of m.topManualReviewReasons.slice(0, 10)) {
      console.log(`  [${count}] ${reason}`);
    }
  }

  if (m.topBlockingRuleCodes.length > 0) {
    console.log("\nTop blocking rule codes:");
    for (const { ruleCode, count } of m.topBlockingRuleCodes.slice(0, 10)) {
      console.log(`  [${count}] ${ruleCode}`);
    }
  }

  console.log("\nManual review rate by risk:");
  for (const [risk, rate] of Object.entries(m.manualReviewRateByRisk)) {
    console.log(`  ${risk}: ${(rate * 100).toFixed(1)}%`);
  }

  console.log("\nPublish rate by risk:");
  for (const [risk, rate] of Object.entries(m.publishRateByRisk)) {
    console.log(`  ${risk}: ${(rate * 100).toFixed(1)}%`);
  }

  if (m.candidateGoldSet.length > 0) {
    console.log(`\nCandidate gold set (${m.candidateGoldSet.length} documents):`);
    for (const c of m.candidateGoldSet) {
      console.log(
        `  ${c.filingId}  org=${c.orgNumber ?? "?"}  fy=${c.fiscalYear ?? "?"}  route=${c.decisionRoute ?? "?"}  risk=${c.riskLevel ?? "?"}  conf=${c.confidenceScore?.toFixed(2) ?? "?"}  outcome=${c.outcome}`,
      );
      console.log(`    → ${c.reason}`);
    }
  } else {
    console.log("\nNo gold set candidates.");
  }

  console.log();
}

if (result.metrics.totalDocuments === 0) {
  // Not an error when no data — just informational
  process.exit(0);
}
