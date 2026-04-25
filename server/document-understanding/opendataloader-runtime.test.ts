import { afterEach, describe, expect, it, vi } from "vitest";

describe("opendataloader-runtime", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.doUnmock("node:fs/promises");
    vi.doUnmock("node:child_process");
    vi.doUnmock("node:util");
  });

  it("reports local runtime readiness when the package is installed and Java 17 is available", async () => {
    const readFileMock = vi.fn().mockResolvedValue(JSON.stringify({ version: "2.2.1" }));
    const execFileMock = vi
      .fn()
      .mockImplementation(async (command: string, args: string[]) => {
        if (command === "where" && args[0] === "java") {
          return {
            stdout:
              "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe\r\nC:\\Program Files\\Java\\jre1.8.0_241\\bin\\java.exe\r\n",
            stderr: "",
          };
        }
        if (command.includes("jdk-17")) {
          return { stdout: "", stderr: 'openjdk version "17.0.9"\n' };
        }
        return { stdout: "", stderr: 'openjdk version "17.0.9"\n' };
      });

    vi.doMock("node:fs/promises", () => ({
      default: { readFile: readFileMock },
      readFile: readFileMock,
    }));
    vi.doMock("node:child_process", () => ({
      execFile: execFileMock,
    }));
    vi.doMock("node:util", () => ({
      promisify: (value: unknown) => value,
    }));

    const runtimeModule = await import("@/server/document-understanding/opendataloader-runtime");
    const summary = await runtimeModule.inspectOpenDataLoaderRuntime({
      enabled: true,
      mode: "local",
      hybridBackend: "docling-fast",
      hybridUrl: null,
      forceOcr: false,
      useStructTree: false,
      timeoutMs: 120_000,
      dualRun: false,
      storeAnnotatedPdf: true,
      fallbackToLegacy: true,
    });

    expect(summary.packageInstalled).toBe(true);
    expect(summary.packageVersion).toBe("2.2.1");
    expect(summary.java.majorVersion).toBe(17);
    expect(summary.java.executablePath).toContain("jdk-17");
    expect(summary.java.pathCandidates).toHaveLength(2);
    expect(summary.java.discoveredCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
          rawVersion: "17.0.9",
          compatible: true,
        }),
      ]),
    );
    expect(summary.localModeReady).toBe(true);
    expect(summary.liveLocalBenchmarkReady).toBe(true);
    expect(summary.localModeReason).toContain("Java 17.0.9");
  });

  it("reports when active PATH Java is too old even though a compatible Java exists elsewhere", async () => {
    const readFileMock = vi.fn().mockResolvedValue(JSON.stringify({ version: "2.2.1" }));
    const execFileMock = vi.fn().mockImplementation(async (command: string, args: string[]) => {
      if (command === "where" && args[0] === "java") {
        return {
          stdout:
            "C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath\\java.exe\r\n",
          stderr: "",
        };
      }
      if (command === "java") {
        return { stdout: "", stderr: 'java version "1.8.0_241"\n' };
      }
      if (command.includes("javapath")) {
        return { stdout: "", stderr: 'java version "1.8.0_241"\n' };
      }
      if (command.includes("jdk-17")) {
        return { stdout: "", stderr: 'openjdk version "17.0.13"\n' };
      }
      throw new Error("unexpected command");
    });
    const readdirMock = vi.fn(async (target: string) => {
      if (target === "C:\\Program Files\\Java") {
        return [
          {
            name: "jdk-17",
            isDirectory: () => true,
          },
        ];
      }
      return [];
    });
    const accessMock = vi.fn(async () => undefined);

    vi.doMock("node:fs/promises", () => ({
      default: { readFile: readFileMock, readdir: readdirMock, access: accessMock },
      readFile: readFileMock,
      readdir: readdirMock,
      access: accessMock,
    }));
    vi.doMock("node:child_process", () => ({
      execFile: execFileMock,
    }));
    vi.doMock("node:util", () => ({
      promisify: (value: unknown) => value,
    }));

    vi.stubEnv("JAVA_HOME", "");
    const runtimeModule = await import("@/server/document-understanding/opendataloader-runtime");
    const summary = await runtimeModule.inspectOpenDataLoaderRuntime({
      enabled: true,
      mode: "hybrid",
      hybridBackend: "docling-fast",
      hybridUrl: "http://localhost:5002",
      forceOcr: false,
      useStructTree: false,
      timeoutMs: 120_000,
      dualRun: false,
      storeAnnotatedPdf: true,
      fallbackToLegacy: true,
    });

    expect(summary.localModeReady).toBe(false);
    expect(summary.java.executablePath).toContain("javapath");
    expect(summary.localModeReason).toContain("compatible candidate was found");
    expect(summary.java.discoveredCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
          rawVersion: "17.0.13",
          compatible: true,
          source: "WINDOWS_SCAN",
        }),
      ]),
    );
  });

  it("fails clearly when local mode is selected but Java is below the required version", async () => {
    const runtimeModule = await import("@/server/document-understanding/opendataloader-runtime");
    vi.spyOn(runtimeModule, "inspectOpenDataLoaderRuntime").mockResolvedValue({
      packageInstalled: true,
      packageVersion: "2.2.1",
      java: {
        rawVersion: "1.8.0_241",
        majorVersion: 8,
        available: true,
        executablePath: "C:\\Java\\jre8\\bin\\java.exe",
        pathCandidates: ["C:\\Java\\jre8\\bin\\java.exe"],
        javaHomePath: null,
        discoveredCandidates: [],
      },
      localModeReady: false,
      hybridConfigured: false,
      localModeReason: "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
      hybridModeReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      liveLocalBenchmarkReady: false,
      liveLocalBenchmarkReason:
        "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
      liveHybridBenchmarkReady: false,
      liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
    });

    await expect(
      runtimeModule.assertOpenDataLoaderRuntimeReady({
        config: {
          enabled: true,
          mode: "local",
          hybridBackend: "docling-fast",
          hybridUrl: null,
          forceOcr: false,
          useStructTree: false,
          timeoutMs: 120_000,
          dualRun: false,
          storeAnnotatedPdf: true,
          fallbackToLegacy: true,
        },
        route: {
          enabled: true,
          executionMode: "local",
          hybridMode: null,
          useStructTree: false,
          requiresOcr: false,
          reasonCode: "FORCED_LOCAL",
          reason: "Forced local mode for test.",
        },
      }),
    ).rejects.toThrow("Java 11+");
  });

  it("fails clearly when hybrid mode is selected without a configured backend URL", async () => {
    const runtimeModule = await import("@/server/document-understanding/opendataloader-runtime");
    vi.spyOn(runtimeModule, "inspectOpenDataLoaderRuntime").mockResolvedValue({
      packageInstalled: true,
      packageVersion: "2.2.1",
      java: {
        rawVersion: "17.0.9",
        majorVersion: 17,
        available: true,
        executablePath: "C:\\Java\\jdk17\\bin\\java.exe",
        pathCandidates: ["C:\\Java\\jdk17\\bin\\java.exe"],
        javaHomePath: null,
        discoveredCandidates: [],
      },
      localModeReady: true,
      hybridConfigured: false,
      localModeReason: "Java 17.0.9 is compatible with local OpenDataLoader execution.",
      hybridModeReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      liveLocalBenchmarkReady: true,
      liveLocalBenchmarkReason:
        "Environment is ready for live local OpenDataLoader benchmark cases.",
      liveHybridBenchmarkReady: false,
      liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
    });

    await expect(
      runtimeModule.assertOpenDataLoaderRuntimeReady({
        config: {
          enabled: true,
          mode: "hybrid",
          hybridBackend: "docling-fast",
          hybridUrl: null,
          forceOcr: true,
          useStructTree: false,
          timeoutMs: 120_000,
          dualRun: false,
          storeAnnotatedPdf: true,
          fallbackToLegacy: true,
        },
        route: {
          enabled: true,
          executionMode: "hybrid",
          hybridMode: "full",
          useStructTree: false,
          requiresOcr: true,
          reasonCode: "FORCED_HYBRID",
          reason: "Forced hybrid mode for test.",
        },
      }),
    ).rejects.toThrow("OPENDATALOADER_HYBRID_URL");
  });
});
