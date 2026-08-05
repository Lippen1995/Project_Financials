import {
  clusterPdfParserFailures,
  serializePdfParserFailureClusteringResult,
  writePdfParserFailureClusteringResult,
} from "@/server/services/pdf-parser-failure-clustering-service";

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

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("cluster:pdf-parser-failures requires DATABASE_URL.");
  }
  const result = await clusterPdfParserFailures({
    limit: readNumberOption("--limit="),
    fiscalYear: readNumberOption("--fiscalYear="),
    orgNumber: readOption("--orgNumber="),
    maxExamplesPerCluster: readNumberOption("--maxExamples="),
  });
  const out = readOption("--out=");
  if (out) {
    writePdfParserFailureClusteringResult(result, out);
    console.log(`Wrote PDF parser failure clusters to ${out}`);
    return;
  }
  if (hasFlag("--json")) {
    console.log(serializePdfParserFailureClusteringResult(result));
    return;
  }

  console.log("PDF parser failure clusters");
  console.log(`Documents: ${result.totalDocuments}`);
  console.log(`Clusters: ${result.clusterCount}`);
  for (const cluster of result.clusters.slice(0, 10)) {
    console.log(
      `[${cluster.severity}] ${cluster.clusterId} docs=${cluster.documentCount} action=${cluster.suggestedNextAction}`,
    );
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
