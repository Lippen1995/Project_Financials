import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  OpenDataLoaderResolvedConfig,
  OpenDataLoaderRouteDecision,
} from "@/server/document-understanding/opendataloader-types";

const execFileAsync = promisify(execFile);

type JavaRuntimeSummary = {
  rawVersion: string | null;
  majorVersion: number | null;
  available: boolean;
};

type RuntimeCapability = {
  ready: boolean;
  reason: string;
};

export type OpenDataLoaderRuntimeSummary = {
  packageInstalled: boolean;
  packageVersion: string | null;
  java: JavaRuntimeSummary;
  localModeReady: boolean;
  hybridConfigured: boolean;
  localModeReason: string;
  hybridModeReason: string;
  liveLocalBenchmarkReady: boolean;
  liveLocalBenchmarkReason: string;
  liveHybridBenchmarkReady: boolean;
  liveHybridBenchmarkReason: string;
};

function assessLocalRuntimeCapability(input: {
  packageVersion: string | null;
  java: JavaRuntimeSummary;
}): RuntimeCapability {
  if (!input.packageVersion) {
    return {
      ready: false,
      reason: "@opendataloader/pdf is not installed.",
    };
  }

  if (!input.java.available) {
    return {
      ready: false,
      reason: "Java runtime was not detected. Local OpenDataLoader requires Java 11+.",
    };
  }

  if (!input.java.majorVersion || input.java.majorVersion < 11) {
    return {
      ready: false,
      reason: `Detected Java ${input.java.rawVersion ?? "unknown"}, but local OpenDataLoader requires Java 11+.`,
    };
  }

  return {
    ready: true,
    reason: `Java ${input.java.rawVersion} is compatible with local OpenDataLoader execution.`,
  };
}

function assessHybridRuntimeCapability(input: {
  packageVersion: string | null;
  hybridUrl: string | null | undefined;
}) {
  if (!input.packageVersion) {
    return {
      ready: false,
      reason: "@opendataloader/pdf is not installed.",
    };
  }

  if (!input.hybridUrl) {
    return {
      ready: false,
      reason: "OPENDATALOADER_HYBRID_URL is not configured.",
    };
  }

  return {
    ready: true,
    reason: `Hybrid backend is configured at ${input.hybridUrl}.`,
  };
}

export async function readOpenDataLoaderPackageVersion() {
  try {
    const packageJsonPath = path.join(
      process.cwd(),
      "node_modules",
      "@opendataloader",
      "pdf",
      "package.json",
    );
    const parsed = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { version?: string };
    return parsed.version ?? null;
  } catch {
    return null;
  }
}

function parseJavaMajorVersion(output: string) {
  const match = output.match(/version "(?<version>[^"]+)"/);
  const version = match?.groups?.version ?? null;
  if (!version) {
    return { rawVersion: null, majorVersion: null };
  }

  if (version.startsWith("1.")) {
    const legacyMajor = Number(version.split(".")[1]);
    return {
      rawVersion: version,
      majorVersion: Number.isFinite(legacyMajor) ? legacyMajor : null,
    };
  }

  const major = Number(version.split(".")[0]);
  return {
    rawVersion: version,
    majorVersion: Number.isFinite(major) ? major : null,
  };
}

export async function inspectJavaRuntime(): Promise<JavaRuntimeSummary> {
  try {
    const { stdout, stderr } = await execFileAsync("java", ["-version"]);
    const rawOutput = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
    const parsed = parseJavaMajorVersion(rawOutput);
    return {
      rawVersion: parsed.rawVersion,
      majorVersion: parsed.majorVersion,
      available: parsed.majorVersion !== null,
    };
  } catch {
    return {
      rawVersion: null,
      majorVersion: null,
      available: false,
    };
  }
}

export async function inspectOpenDataLoaderRuntime(
  config?: OpenDataLoaderResolvedConfig,
) {
  const [packageVersion, java] = await Promise.all([
    readOpenDataLoaderPackageVersion(),
    inspectJavaRuntime(),
  ]);
  const localCapability = assessLocalRuntimeCapability({
    packageVersion,
    java,
  });
  const hybridCapability = assessHybridRuntimeCapability({
    packageVersion,
    hybridUrl: config?.hybridUrl,
  });

  return {
    packageInstalled: packageVersion !== null,
    packageVersion,
    java,
    localModeReady: localCapability.ready,
    hybridConfigured: hybridCapability.ready,
    localModeReason: localCapability.reason,
    hybridModeReason: hybridCapability.reason,
    liveLocalBenchmarkReady: localCapability.ready,
    liveLocalBenchmarkReason: localCapability.ready
      ? "Environment is ready for live local OpenDataLoader benchmark cases."
      : localCapability.reason,
    liveHybridBenchmarkReady: hybridCapability.ready,
    liveHybridBenchmarkReason: hybridCapability.ready
      ? "Environment is ready for live hybrid OpenDataLoader benchmark cases."
      : hybridCapability.reason,
  } satisfies OpenDataLoaderRuntimeSummary;
}

export async function assertOpenDataLoaderRuntimeReady(input: {
  config: OpenDataLoaderResolvedConfig;
  route: OpenDataLoaderRouteDecision;
}) {
  const runtime = await inspectOpenDataLoaderRuntime(input.config);

  if (!runtime.packageInstalled) {
    throw new Error(
      "OpenDataLoader runtime is not ready: @opendataloader/pdf is not installed.",
    );
  }

  if (input.route.executionMode === "local" && !runtime.localModeReady) {
    throw new Error(
      `OpenDataLoader local mode requires Java 11+; detected ${runtime.java.rawVersion ?? "no Java runtime"}.`,
    );
  }

  if (input.route.executionMode === "hybrid" && !runtime.hybridConfigured) {
    throw new Error(
      "OpenDataLoader hybrid mode was selected, but OPENDATALOADER_HYBRID_URL is not configured.",
    );
  }

  return runtime;
}
