import { backfillLegacyNewsArticlesToCompanyEvents } from "@/server/news/legacy-news-backfill";

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const limitArg = argValue("limit");
  const dryRun = process.argv.includes("--dry-run");
  const limit = limitArg ? Number(limitArg) : undefined;

  const result = await backfillLegacyNewsArticlesToCompanyEvents({
    limit: Number.isFinite(limit) ? limit : undefined,
    dryRun,
  });

  console.log("Legacy NewsArticle -> CompanyEvent backfill");
  console.log(`Mode:              ${dryRun ? "dry-run" : "write"}`);
  console.log(`Articles scanned:  ${result.articlesScanned}`);
  console.log(`Documents:         ${result.sourceDocumentsUpserted}`);
  console.log(`Signals created:   ${result.signalsCreated}`);
  console.log(`Signals existing:  ${result.signalsExisting}`);
  console.log(`Events upserted:   ${result.eventsUpserted}`);
  console.log(`Evidence attached: ${result.evidenceAttached}`);
  console.log(`Exposures:         ${result.exposuresUpserted}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
