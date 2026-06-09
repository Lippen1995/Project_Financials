import { syncCompanyEventIntelligence } from "@/server/news/company-event-intelligence-sync";

function parseSourceIds(argv: string[]) {
  const sourceArg = argv.find((arg) => arg.startsWith("--source="));
  if (!sourceArg) return undefined;
  return sourceArg
    .slice("--source=".length)
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

function parseLimit(argv: string[]) {
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  if (!limitArg) return undefined;
  const parsed = Number(limitArg.slice("--limit=".length));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  console.log("Synkroniserer Company Event intelligence...");
  const result = await syncCompanyEventIntelligence({
    sourceIds: parseSourceIds(argv),
    limit: parseLimit(argv),
    fullReprocess: argv.includes("--full"),
    onProgress: (stage, detail) => {
      console.log(`${stage}: ${JSON.stringify(detail)}`);
    },
  });

  console.log(`Kilder behandlet:     ${result.ingestion.sourcesProcessed}`);
  console.log(`Kilder feilet:        ${result.ingestion.sourcesFailed}`);
  console.log(`Dokumenter hentet:    ${result.ingestion.documentsFetched}`);
  console.log(`Dokumenter opprettet: ${result.ingestion.documentsCreated}`);
  console.log(`Dokumenter oppdatert: ${result.ingestion.documentsUpdated}`);
  console.log(`Duplikater dempet:    ${result.ingestion.documentsDuplicate}`);
  console.log(`Dokumenter resolvert: ${result.entityResolution.documentsProcessed}`);
  console.log(`Signaler laget:       ${result.entityResolution.signalsCreated}`);
  console.log(`Feilevidens fjernet:  ${result.reconciliation.evidenceRemoved}`);
  console.log(`Eventer deaktivert:   ${result.reconciliation.eventsDeactivated}`);
  console.log(`Eventer oppdatert:    ${result.extraction.eventsUpserted}`);
  console.log(`Evidens koblet:       ${result.extraction.evidenceAttached}`);
  console.log(`Read-across events:   ${result.readAcross.eventsProcessed}`);
  console.log(`Eksponeringer laget:  ${result.readAcross.exposuresCreated}`);
  console.log(`Eksponeringer fjernet: ${result.readAcross.exposuresRemoved}`);

  if (result.ingestion.errors.length > 0) {
    console.log("Feil:");
    for (const error of result.ingestion.errors) {
      console.log(`  ${error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
