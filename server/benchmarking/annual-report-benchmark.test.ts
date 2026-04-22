import { afterEach, describe, expect, it, vi } from "vitest";

import pairedCase from "@/benchmarks/annual-report-golden/cases/paired-digital-happy-path.json";
import {
  AnnualReportBenchmarkCase,
  renderAnnualReportBenchmarkMarkdown,
  runAnnualReportBenchmarkCase,
  summarizeAnnualReportBenchmarkRun,
} from "@/server/benchmarking/annual-report-benchmark";

describe("annual-report-benchmark", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("runs a paired benchmark case and produces a differential summary", async () => {
    const result = await runAnnualReportBenchmarkCase(
      pairedCase as AnnualReportBenchmarkCase,
    );

    expect(result.status).toBe("completed");
    expect(result.legacy?.shouldPublish).toBe(true);
    expect(result.openDataLoader?.shouldPublish).toBe(true);
    expect(result.evidenceKind).toBe("captured-fixture");
    expect(result.comparison).toBeTruthy();
    expect(result.comparison?.materialDisagreement).toBe(true);
    expect(result.comparison?.publishDecisionMismatch).toBe(false);
    expect(result.comparisonAssessment?.classification).toBe("known_evidence_gap");
  });

  it("renders a readable markdown summary from benchmark results", () => {
    const summary = summarizeAnnualReportBenchmarkRun({
      runtimeEnvironment: {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "1.8.0_241",
        javaMajorVersion: 8,
        localOpenDataLoaderReady: false,
        localOpenDataLoaderReason: "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        liveLocalBenchmarkReady: false,
        liveLocalBenchmarkReason:
          "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      },
      cases: [
        {
          caseId: "case-1",
          name: "Case 1",
          fiscalYear: 2024,
          mode: "expected_and_differential",
          status: "completed",
          errors: [],
          evidenceKind: "captured-fixture",
          knownEvidenceLimitations: [],
          legacy: {
            engine: "LEGACY",
            executionSource: "document_fixture",
            mode: "legacy",
            runtimeMs: 20,
            confidenceScore: 0.9,
            validationScore: 0.95,
            shouldPublish: true,
            artifactGeneration: {
              attempted: false,
              success: null,
              artifactKinds: [],
              detail: "fixture",
            },
            classifications: [],
            selectedFacts: [],
            blockingRuleCodes: [],
            issueCodes: [],
            issueCount: 0,
            validationPasses: true,
            evidenceKind: "legacy-only",
            snapshot: {
              engine: "LEGACY",
              mode: "legacy",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: [],
              shouldPublish: true,
              confidenceScore: 0.9,
              durationMs: 20,
            },
            expectedEvaluation: {
              statementPageAccuracy: 1,
              unitScaleAccuracy: 1,
              factAccuracy: 1,
              publishOutcomeMatch: true,
              matchedIssueCodes: [],
              missingIssueCodes: [],
              mismatches: [],
            },
          },
          openDataLoader: {
            engine: "OPENDATALOADER",
            executionSource: "captured_normalized_json",
            mode: "local",
            runtimeMs: 10,
            confidenceScore: 0.9,
            validationScore: 0.95,
            shouldPublish: true,
            artifactGeneration: {
              attempted: false,
              success: null,
              artifactKinds: ["DOCUMENT_JSON"],
              detail: "captured",
            },
            classifications: [],
            selectedFacts: [],
            blockingRuleCodes: [],
            issueCodes: [],
            issueCount: 0,
            validationPasses: true,
            evidenceKind: "captured-fixture",
            snapshot: {
              engine: "OPENDATALOADER",
              mode: "local",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: [],
              shouldPublish: true,
              confidenceScore: 0.9,
              durationMs: 10,
            },
            expectedEvaluation: {
              statementPageAccuracy: 1,
              unitScaleAccuracy: 1,
              factAccuracy: 1,
              publishOutcomeMatch: true,
              matchedIssueCodes: [],
              missingIssueCodes: [],
              mismatches: [],
            },
            routeReason: "captured-normalized-json",
          },
          comparisonAssessment: {
            classification: "no_material_disagreement",
            summary:
              "No material disagreement was detected between legacy and OpenDataLoader for this case.",
          },
          comparison: {
            primaryEngine: "LEGACY",
            shadowEngine: "OPENDATALOADER",
            primaryShouldPublish: true,
            shadowShouldPublish: true,
            publishDecisionMismatch: false,
            classificationDifferences: [],
            unitScaleDifferences: [],
            factDifferences: [],
            blockingRuleDifferences: {
              onlyInPrimary: [],
              onlyInShadow: [],
            },
            durationMs: {
              primary: 20,
              shadow: 10,
            },
            materialDisagreement: false,
          },
        },
      ],
    });

    const markdown = renderAnnualReportBenchmarkMarkdown({
      generatedAt: "2026-04-19T00:00:00.000Z",
      runtimeEnvironment: {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "1.8.0_241",
        javaMajorVersion: 8,
        localOpenDataLoaderReady: false,
      },
      cases: [],
      summary,
    });

    expect(summary.recommendation).toContain("shadow-only");
    expect(markdown).toContain("Annual-report benchmark");
    expect(markdown).toContain("Evidence");
    expect(markdown).toContain("shadow-only");
  });

  it("skips live benchmark cases cleanly when local runtime is not ready", async () => {
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "1.8.0_241",
          majorVersion: 8,
          available: true,
        },
        localModeReady: false,
        hybridConfigured: false,
        localModeReason:
          "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        hybridModeReason: "OPENDATALOADER_HYBRID_URL is not configured.",
        liveLocalBenchmarkReady: false,
        liveLocalBenchmarkReason:
          "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      })),
    }));

    const benchmarkModule = await import("@/server/benchmarking/annual-report-benchmark");
    const result = await benchmarkModule.runAnnualReportBenchmarkCase({
      id: "live-case",
      name: "Live case",
      fiscalYear: 2024,
      mode: "expected_and_differential",
      legacySource: {
        kind: "inline_document_pages",
        pages: [["Arsregnskap 2024"], ["Resultatregnskap", "Belop i: NOK"]],
      },
      openDataLoaderSource: {
        kind: "live_generated_pdf_from_legacy",
        executionMode: "local",
      },
    });

    expect(result.status).toBe("skipped");
    expect(result.errors[0]).toContain("Live local benchmark is not ready");
    expect(result.evidenceKind).toBe("legacy-only");
  });
});
