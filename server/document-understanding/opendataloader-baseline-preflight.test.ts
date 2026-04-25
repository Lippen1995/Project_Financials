import { afterEach, describe, expect, it, vi } from "vitest";

describe("opendataloader-baseline-preflight", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("fails baseline preflight early when active shell Java is too old", async () => {
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "1.8.0_241",
          majorVersion: 8,
          available: true,
          executablePath:
            "C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath\\java.exe",
          pathCandidates: [
            "C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath\\java.exe",
          ],
          javaHomePath: null,
          discoveredCandidates: [
            {
              path: "C:\\Program Files\\Java\\jdk-17\\bin\\java.exe",
              rawVersion: "17.0.13",
              majorVersion: 17,
              compatible: true,
              source: "WINDOWS_SCAN",
            },
          ],
        },
        localModeReady: false,
        hybridConfigured: true,
        localModeReason:
          "Active shell Java is 1.8.0_241 at C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath\\java.exe, but OpenDataLoader requires Java 11+. A compatible candidate was found at C:\\Program Files\\Java\\jdk-17\\bin\\java.exe (17.0.13).",
        hybridModeReason: "Hybrid backend is configured at http://localhost:5002.",
        liveLocalBenchmarkReady: false,
        liveLocalBenchmarkReason: "Java too old",
        liveHybridBenchmarkReady: true,
        liveHybridBenchmarkReason: "configured",
      })),
    }));
    vi.doMock("@/server/document-understanding/opendataloader-hybrid-health", () => ({
      inspectOpenDataLoaderHybridHealth: vi.fn(async () => ({
        configured: true,
        url: "http://localhost:5002",
        backend: "docling-fast",
        timeoutMs: 10000,
        runtimeReady: true,
        runtimeReason: "configured",
        liveHybridBenchmarkReady: false,
        errorType: "compatibility_probe_failed",
        reason: "CLI still uses Java 8 on PATH.",
        httpProbe: {
          attempted: true,
          endpoint: "http://localhost:5002/health",
          ok: true,
          reachable: true,
          status: 200,
          contentType: "application/json",
          bodyPreview: "{\"status\":\"ok\"}",
          latencyMs: 40,
          reason: "ok",
        },
        compatibilityProbe: {
          attempted: true,
          success: false,
          latencyMs: 500,
          annualReportPageCount: null,
          blockCount: null,
          failureStage: "opendataloader-invocation",
          reason: "UnsupportedClassVersionError",
        },
      })),
    }));

    const module = await import("@/server/document-understanding/opendataloader-baseline-preflight");
    const summary = await module.inspectOpenDataLoaderBaselinePreflight({
      config: {
        enabled: true,
        mode: "hybrid",
        hybridBackend: "docling-fast",
        hybridUrl: "http://localhost:5002",
        forceOcr: false,
        useStructTree: false,
        timeoutMs: 120000,
        dualRun: true,
        storeAnnotatedPdf: false,
        fallbackToLegacy: true,
      },
    });

    expect(summary.ready).toBe(false);
    expect(summary.checks.hybridBackendReachable).toBe(true);
    expect(summary.checks.activeShellJavaCompatible).toBe(false);
    expect(summary.guidance.join(" | ")).toContain("Program Files\\Java\\jdk-17\\bin\\java.exe");
    expect(summary.guidance.join(" | ")).toContain("Korriger aktiv Java");
  });
});
