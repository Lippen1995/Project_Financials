import { syncNewsSources } from "@/server/news/company-event-ingestion-service";

function parseSourceIds(argv: string[]) {
  const sourceArg = argv.find((arg) => arg.startsWith("--source="));
  if (!sourceArg) return undefined;
  return sourceArg
    .slice("--source=".length)
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

async function main() {
  console.log("Synkroniserer Company Event source documents...");
  const metrics = await syncNewsSources({
    sourceIds: parseSourceIds(process.argv.slice(2)),
  });

  console.log(`Kilder behandlet:     ${metrics.sourcesProcessed}`);
  console.log(`Kilder feilet:        ${metrics.sourcesFailed}`);
  console.log(`Dokumenter hentet:    ${metrics.documentsFetched}`);
  console.log(`Dokumenter opprettet: ${metrics.documentsCreated}`);
  console.log(`Dokumenter oppdatert: ${metrics.documentsUpdated}`);
  console.log(`Duplikater dempet:    ${metrics.documentsDuplicate}`);

  if (metrics.errors.length > 0) {
    console.log("Feil:");
    for (const error of metrics.errors) {
      console.log(`  ${error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
