import { runOpenDataLoaderSmokeTest } from "@/server/document-understanding/opendataloader-smoke";

async function main() {
  const summary = await runOpenDataLoaderSmokeTest();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke kjore OpenDataLoader smoke test.",
  );
  process.exitCode = 1;
});
