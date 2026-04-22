import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";

async function main() {
  const config = resolveOpenDataLoaderConfig();
  const runtime = await inspectOpenDataLoaderRuntime(config);

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
