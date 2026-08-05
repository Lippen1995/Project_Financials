import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import { inspectOpenDataLoaderHybridHealth } from "@/server/document-understanding/opendataloader-hybrid-health";

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
          dualRun: config.dualRun,
          useStructTree: config.useStructTree,
          hybridUrlConfigured: Boolean(config.hybridUrl),
        },
        runtime,
        benchmarkReadiness: {
          liveLocalReady: runtime.liveLocalBenchmarkReady,
          liveLocalReason: runtime.liveLocalBenchmarkReason,
          liveHybridReady: hybridHealth.liveHybridBenchmarkReady,
          liveHybridReason: hybridHealth.reason,
        },
        hybridHealth,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke hente OpenDataLoader runtime-diagnostikk.",
  );
  process.exitCode = 1;
});
