import { runOpenDataLoaderSmokeTest } from "@/server/document-understanding/opendataloader-smoke";

function hasDiagnostics(error: unknown): error is Error & { diagnostics: unknown } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "diagnostics" in error &&
      (error as { diagnostics?: unknown }).diagnostics,
  );
}

async function main() {
  const summary = await runOpenDataLoaderSmokeTest();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  if (hasDiagnostics(error)) {
    console.error(JSON.stringify({
      error: error.message,
      diagnostics: error.diagnostics,
    }, null, 2));
  } else {
    console.error(
      error instanceof Error
        ? error.message
        : "Kunne ikke kjore OpenDataLoader smoke test.",
    );
  }
  process.exitCode = 1;
});
