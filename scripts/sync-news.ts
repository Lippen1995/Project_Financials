import { syncAndScoreNewsFeeds } from "@/server/services/news-aggregator-service";

async function main() {
  console.log("Synkroniserer og scorer nyhetsfeeder...");
  const result = await syncAndScoreNewsFeeds("manual");
  console.log(`Feeds behandlet: ${result.feedsProcessed}`);
  console.log(`Nye artikler:    ${result.articlesNew}`);
  console.log(`Duplikater:      ${result.articlesDuplicate}`);
  console.log(`Selskapslinker:  ${result.companyLinks}`);
  console.log(`Kandidatpar:     ${result.candidatePairs}`);
  console.log(`Relevansscoret:  ${result.relevanceScored}`);
  if (result.scoringRunId) {
    console.log(`Scoring run:     ${result.scoringRunId}`);
  }
  if (result.errors.length > 0) {
    console.warn("Feil:", result.errors.join("\n  "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
