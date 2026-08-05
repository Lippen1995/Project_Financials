import { inspectOpenDataLoaderHybridHealth } from "@/server/document-understanding/opendataloader-hybrid-health";
import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";

async function main() {
  const config = resolveOpenDataLoaderConfig();
  const [runtime, hybridHealth] = await Promise.all([
    inspectOpenDataLoaderRuntime(config),
    inspectOpenDataLoaderHybridHealth({ config }),
  ]);

  console.log(
    JSON.stringify(
      {
        opendataloader: {
          enabled: config.enabled,
          mode: config.mode,
          hybridBackend: config.hybridBackend,
          hybridUrl: config.hybridUrl,
          dualRun: config.dualRun,
          fallbackToLegacy: config.fallbackToLegacy,
        },
        runtime,
        hybridHealth,
      },
      null,
      2,
    ),
  );

  if (!hybridHealth.liveHybridBenchmarkReady) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke kjore OpenDataLoader hybrid healthcheck.",
  );
  process.exitCode = 1;
});
