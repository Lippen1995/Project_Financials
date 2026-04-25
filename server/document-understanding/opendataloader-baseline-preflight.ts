import { inspectOpenDataLoaderHybridHealth } from "@/server/document-understanding/opendataloader-hybrid-health";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { OpenDataLoaderResolvedConfig } from "@/server/document-understanding/opendataloader-types";

export type OpenDataLoaderBaselinePreflight = {
  ready: boolean;
  config: {
    enabled: boolean;
    mode: string;
    hybridBackend: string;
    hybridUrl: string | null;
    dualRun: boolean;
  };
  runtime: Awaited<ReturnType<typeof inspectOpenDataLoaderRuntime>>;
  hybridHealth: Awaited<ReturnType<typeof inspectOpenDataLoaderHybridHealth>>;
  checks: {
    hybridUrlConfigured: boolean;
    hybridBackendReachable: boolean;
    activeShellJavaCompatible: boolean;
    repoClientCompatible: boolean;
  };
  guidance: string[];
};

function buildJavaGuidance(
  runtime: Awaited<ReturnType<typeof inspectOpenDataLoaderRuntime>>,
) {
  const guidance: string[] = [];
  const compatibleCandidate = runtime.java.discoveredCandidates.find(
    (candidate) => candidate.compatible,
  );

  if (!runtime.java.available) {
    guidance.push(
      "Ingen aktiv Java ble funnet pa PATH. Installer eller aktiver Java 11+ i samme shell for ODL-kjoring.",
    );
  } else if (!runtime.localModeReady) {
    guidance.push(
      `Aktiv shell bruker ${runtime.java.rawVersion ?? "ukjent Java"} fra ${runtime.java.executablePath ?? "ukjent path"}, men ODL-klienten krever Java 11+.`,
    );
    if (
      compatibleCandidate &&
      compatibleCandidate.path !== runtime.java.executablePath
    ) {
      guidance.push(
        `Kompatibel Java ble funnet pa ${compatibleCandidate.path} (${compatibleCandidate.rawVersion ?? "ukjent versjon"}). Sett JAVA_HOME/PATH til denne for du rerunner baseline-batchen.`,
      );
    } else if (runtime.javaHomePath) {
      guidance.push(
        `Kontroller JAVA_HOME=${runtime.javaHomePath} og at denne faktisk ligger foran eldre Java pa PATH.`,
      );
    }
  }

  return guidance;
}

export async function inspectOpenDataLoaderBaselinePreflight(input?: {
  config?: OpenDataLoaderResolvedConfig;
}) {
  const config = input?.config ?? resolveOpenDataLoaderConfig();
  const [runtime, hybridHealth] = await Promise.all([
    inspectOpenDataLoaderRuntime(config),
    inspectOpenDataLoaderHybridHealth({ config }),
  ]);

  const checks = {
    hybridUrlConfigured: Boolean(config.hybridUrl),
    hybridBackendReachable: hybridHealth.httpProbe.ok,
    activeShellJavaCompatible: runtime.localModeReady,
    repoClientCompatible: hybridHealth.liveHybridBenchmarkReady,
  };

  const guidance = [
    ...(checks.hybridUrlConfigured
      ? []
      : [
          "Sett OPENDATALOADER_HYBRID_URL, for eksempel http://localhost:5002, før baseline OCR shadow-kjoring.",
        ]),
    ...(checks.hybridBackendReachable
      ? []
      : [
          `Hybrid-backend er ikke bekreftet reachable pa ${config.hybridUrl ?? "manglende URL"}. Start backend med \`npm run opendataloader:hybrid-up\` og rerun healthcheck.`,
        ]),
    ...buildJavaGuidance(runtime),
    ...(checks.repoClientCompatible
      ? []
      : [
          hybridHealth.compatibilityProbe.failureStage === "opendataloader-invocation"
            ? "Repoets ODL-klientsti er fortsatt inkompatibel i denne shellen. Korriger aktiv Java og rerun `npm run opendataloader:hybrid-healthcheck` før baseline-batch."
            : "Hybrid-backend er oppe, men kompatibilitetsproben fullforte ikke. Se `hybridHealth.compatibilityProbe` for eksakt failureStage/reason.",
        ]),
  ];

  return {
    ready:
      checks.hybridUrlConfigured &&
      checks.hybridBackendReachable &&
      checks.activeShellJavaCompatible &&
      checks.repoClientCompatible,
    config: {
      enabled: config.enabled,
      mode: config.mode,
      hybridBackend: config.hybridBackend,
      hybridUrl: config.hybridUrl,
      dualRun: config.dualRun,
    },
    runtime,
    hybridHealth,
    checks,
    guidance,
  } satisfies OpenDataLoaderBaselinePreflight;
}
