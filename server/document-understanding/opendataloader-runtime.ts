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
  executablePath: string | null;
  pathCandidates: string[];
  javaHomePath: string | null;
  discoveredCandidates: Array<{
    path: string;
    rawVersion: string | null;
    majorVersion: number | null;
    compatible: boolean;
    source: "PATH" | "JAVA_HOME" | "WINDOWS_SCAN";
  }>;
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
      reason: "Java runtime was not detected on the active shell PATH. Local OpenDataLoader requires Java 11+.",
    };
  }

  if (!input.java.majorVersion || input.java.majorVersion < 11) {
    const compatibleCandidate = input.java.discoveredCandidates.find(
      (candidate) => candidate.compatible && candidate.path !== input.java.executablePath,
    );

    return {
      ready: false,
      reason: compatibleCandidate
        ? `Active shell Java is ${input.java.rawVersion ?? "unknown"} at ${input.java.executablePath ?? "unknown path"}, but OpenDataLoader requires Java 11+. A compatible candidate was found at ${compatibleCandidate.path} (${compatibleCandidate.rawVersion ?? "unknown version"}).`
        : `Active shell Java is ${input.java.rawVersion ?? "unknown"} at ${input.java.executablePath ?? "unknown path"}, but local OpenDataLoader requires Java 11+.`,
    };
  }

  return {
    ready: true,
    reason: `Active shell Java ${input.java.rawVersion} at ${input.java.executablePath ?? "unknown path"} is compatible with local OpenDataLoader execution.`,
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

async function execJavaVersion(command: string, args: string[] = ["-version"]) {
  const { stdout, stderr } = await execFileAsync(command, args);
  const rawOutput = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
  const parsed = parseJavaMajorVersion(rawOutput);
  return {
    rawVersion: parsed.rawVersion,
    majorVersion: parsed.majorVersion,
    rawOutput,
  };
}

async function listJavaPathCandidates() {
  try {
    const locator = process.platform === "win32" ? "where" : "which";
    const args = process.platform === "win32" ? ["java"] : ["-a", "java"];
    const { stdout } = await execFileAsync(locator, args);
    return stdout
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function inspectJavaCandidate(pathValue: string, source: "PATH" | "JAVA_HOME" | "WINDOWS_SCAN") {
  try {
    const version = await execJavaVersion(pathValue, ["-version"]);
    return {
      path: pathValue,
      rawVersion: version.rawVersion,
      majorVersion: version.majorVersion,
      compatible: Boolean(version.majorVersion && version.majorVersion >= 11),
      source,
    };
  } catch {
    return {
      path: pathValue,
      rawVersion: null,
      majorVersion: null,
      compatible: false,
      source,
    };
  }
}

async function findWindowsJavaCandidates() {
  if (process.platform !== "win32") {
    return [];
  }

  const roots = [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java.exe") : null,
    "C:\\Program Files\\Java",
    "C:\\Program Files\\Eclipse Adoptium",
    "C:\\Program Files\\Microsoft",
  ].filter(Boolean) as string[];

  const candidates = new Set<string>();
  for (const root of roots) {
    if (root.toLowerCase().endsWith("java.exe")) {
      candidates.add(root);
      continue;
    }

    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const candidate = path.join(root, entry.name, "bin", "java.exe");
        try {
          await fs.access(candidate);
          candidates.add(candidate);
        } catch {}
      }
    } catch {}
  }

  return Array.from(candidates);
}

export async function inspectJavaRuntime(): Promise<JavaRuntimeSummary> {
  const pathCandidates = await listJavaPathCandidates();
  const executablePath = pathCandidates[0] ?? null;
  const javaHomePath = process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
    : null;

  try {
    const activeVersion = await execJavaVersion("java", ["-version"]);
    const discoveredPaths = new Map<
      string,
      "PATH" | "JAVA_HOME" | "WINDOWS_SCAN"
    >();
    for (const candidate of pathCandidates) {
      discoveredPaths.set(candidate, "PATH");
    }
    if (javaHomePath) {
      discoveredPaths.set(javaHomePath, discoveredPaths.get(javaHomePath) ?? "JAVA_HOME");
    }
    for (const candidate of await findWindowsJavaCandidates()) {
      discoveredPaths.set(candidate, discoveredPaths.get(candidate) ?? "WINDOWS_SCAN");
    }

    const discoveredCandidates = (
      await Promise.all(
        Array.from(discoveredPaths.entries()).map(([candidatePath, source]) =>
          inspectJavaCandidate(candidatePath, source),
        ),
      )
    ).sort((left, right) => {
      const rank = { PATH: 0, JAVA_HOME: 1, WINDOWS_SCAN: 2 } as const;
      return (
        rank[left.source] - rank[right.source] ||
        (right.majorVersion ?? 0) - (left.majorVersion ?? 0) ||
        left.path.localeCompare(right.path)
      );
    });

    return {
      rawVersion: activeVersion.rawVersion,
      majorVersion: activeVersion.majorVersion,
      available: activeVersion.majorVersion !== null,
      executablePath,
      pathCandidates,
      javaHomePath,
      discoveredCandidates,
    };
  } catch {
    return {
      rawVersion: null,
      majorVersion: null,
      available: false,
      executablePath,
      pathCandidates,
      javaHomePath,
      discoveredCandidates: (
        await Promise.all(
          [
            ...(javaHomePath ? [[javaHomePath, "JAVA_HOME" as const]] : []),
            ...(await findWindowsJavaCandidates()).map(
              (candidate) => [candidate, "WINDOWS_SCAN" as const] as const,
            ),
          ].map(([candidatePath, source]) =>
            inspectJavaCandidate(candidatePath, source),
          ),
        )
      ).sort((left, right) => (right.majorVersion ?? 0) - (left.majorVersion ?? 0)),
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
