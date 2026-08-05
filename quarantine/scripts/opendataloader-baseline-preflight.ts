import { inspectOpenDataLoaderBaselinePreflight } from "@/server/document-understanding/opendataloader-baseline-preflight";

async function main() {
  const summary = await inspectOpenDataLoaderBaselinePreflight();
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ready) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke kjore baseline ODL-preflight.",
  );
  process.exitCode = 1;
});
