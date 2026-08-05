import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";

async function main() {
  const runtime = await inspectOpenDataLoaderRuntime(resolveOpenDataLoaderConfig());
  console.log(
    JSON.stringify(
      {
        java: runtime.java,
        localModeReady: runtime.localModeReady,
        localModeReason: runtime.localModeReason,
      },
      null,
      2,
    ),
  );

  if (!runtime.localModeReady) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke hente Java-diagnostikk for OpenDataLoader.",
  );
  process.exitCode = 1;
});
