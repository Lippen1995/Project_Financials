import {
  evaluatePdfOcrOdlRouteCandidates,
  serializePdfOcrOdlRouteEvaluationResult,
  writePdfOcrOdlRouteEvaluationResult,
} from "@/server/services/pdf-ocr-odl-route-evaluation-service";

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function readOption(prefix: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readNumberOption(prefix: string): number | undefined {
  const value = readOption(prefix);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function printTopRecord(title: string, record: Record<string, number>) {
  console.log(title);
  for (const [key, count] of Object.entries(record)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)) {
    console.log(`  ${key}: ${count}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("evaluate:pdf-ocr-odl-routes requires DATABASE_URL.");
  }
  const result = await evaluatePdfOcrOdlRouteCandidates({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    includeLowPriority: hasFlag("--includeLowPriority"),
  });
  const out = readOption("--out=");
  if (out) {
    writePdfOcrOdlRouteEvaluationResult(result, out);
    console.log(`Wrote PDF OCR/ODL route evaluation to ${out}`);
    return;
  }
  if (hasFlag("--json")) {
    console.log(serializePdfOcrOdlRouteEvaluationResult(result));
    return;
  }

  console.log("PDF OCR/OpenDataLoader route evaluation");
  console.log(`Documents: ${result.summary.totalDocuments}`);
  console.log(`Sample candidates: ${result.summary.sampleCandidateCount}`);
  printTopRecord("Recommended routes:", result.summary.recommendedRouteDistribution);
  printTopRecord("Top signals:", result.summary.signalDistribution);
  console.log("Top sample candidates:");
  for (const item of result.items.filter((i) => i.shouldSampleForOcrOdl).slice(0, 10)) {
    console.log(
      `${item.filingId} route=${item.recommendedRoute} strength=${item.recommendationStrength} priority=${item.samplePriority}`,
    );
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
