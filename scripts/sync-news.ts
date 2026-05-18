import { syncNewsFeeds } from "@/server/services/news-aggregator-service";

async function main() {
  console.log("Synkroniserer nyhetsfeeder...");
  const result = await syncNewsFeeds();
  console.log(`Feeds behandlet: ${result.feedsProcessed}`);
  console.log(`Nye artikler:    ${result.articlesNew}`);
  console.log(`Duplikater:      ${result.articlesDuplicate}`);
  console.log(`Selskapslinker:  ${result.companyLinks}`);
  if (result.errors.length > 0) {
    console.warn("Feil:", result.errors.join("\n  "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
