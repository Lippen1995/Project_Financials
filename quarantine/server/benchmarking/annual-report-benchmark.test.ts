import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import pairedCase from "@/benchmarks/annual-report-golden/cases/paired-digital-happy-path.json";
import {
  AnnualReportBenchmarkCase,
  loadAnnualReportBenchmarkCases,
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
          documentTags: ["digital_simple"],
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
        localOpenDataLoaderReason: "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        liveLocalBenchmarkReady: false,
        liveLocalBenchmarkReason:
          "Detected Java 1.8.0_241, but local OpenDataLoader requires Java 11+.",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      },
      cases: [],
      summary,
    });

    expect(summary.recommendation).toContain("shadow-only");
    expect(markdown).toContain("Annual-report benchmark");
    expect(markdown).toContain("Evidence");
    expect(markdown).toContain("Document Classes");
    expect(markdown).toContain("Shadow Evidence By Class");
    expect(summary.documentTagCounts.digital_simple).toBe(1);
    expect(summary.comparisonAssessmentCounts.no_material_disagreement).toBe(1);
    expect(summary.divergenceStageCounts.none).toBe(1);
    expect(summary.shadowCoverageByDocumentTag.digital_simple.status).toBe("fixture_only");
    expect(markdown).toContain("shadow-only");
  });

  it("loads the added OCR/degraded shadow benchmark cases with expected tags", async () => {
    const cases = await loadAnnualReportBenchmarkCases(
      path.join(process.cwd(), "benchmarks", "annual-report-golden", "cases"),
      { includeLiveCases: false },
    );

    const scanShadow = cases.find(
      (benchmarkCase) => benchmarkCase.id === "scan-like-duplicate-sections-shadow",
    );
    const formattingShadow = cases.find(
      (benchmarkCase) => benchmarkCase.id === "formatting-edge-manual-review-shadow",
    );

    expect(scanShadow?.openDataLoaderSource).toMatchObject({
      kind: "ocr_regression_fixture",
      name: "scan-like-duplicate-sections",
    });
    expect(scanShadow?.documentTags).toContain("scan_or_ocr");
    expect(scanShadow?.documentTags).toContain("continuation_complex");

    expect(formattingShadow?.openDataLoaderSource).toMatchObject({
      kind: "ocr_regression_fixture",
      name: "formatting-edge-manual-review",
    });
    expect(formattingShadow?.documentTags).toContain("formatting_edge");
    expect(formattingShadow?.documentTags).toContain("degraded_ambiguous");
  });

  it("summarizes shadow coverage by class across fixture-only and live evidence", () => {
    const summary = summarizeAnnualReportBenchmarkRun({
      runtimeEnvironment: {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "17.0.18",
        javaMajorVersion: 17,
        localOpenDataLoaderReady: true,
        localOpenDataLoaderReason:
          "Java 17.0.18 is compatible with local OpenDataLoader execution.",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason:
          "Environment is ready for live local OpenDataLoader benchmark cases.",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      },
      cases: [
        {
          caseId: "fixture-scan",
          name: "Fixture scan",
          fiscalYear: 2024,
          documentTags: ["scan_or_ocr", "ocr_token_noise"],
          mode: "expected_and_differential",
          status: "completed",
          errors: [],
          evidenceKind: "captured-fixture",
          knownEvidenceLimitations: ["fixture only"],
          legacy: {
            engine: "LEGACY",
            executionSource: "ocr_fixture",
            mode: "legacy",
            runtimeMs: 5,
            confidenceScore: 0.8,
            validationScore: 1,
            shouldPublish: true,
            artifactGeneration: { attempted: false, success: null, artifactKinds: [], detail: "fixture" },
            classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 }],
            classificationDiagnostics: [],
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
              confidenceScore: 0.8,
              durationMs: 5,
            },
          },
          openDataLoader: {
            engine: "OPENDATALOADER",
            executionSource: "ocr_fixture",
            mode: "hybrid",
            runtimeMs: 7,
            confidenceScore: 0.8,
            validationScore: 1,
            shouldPublish: true,
            artifactGeneration: {
              attempted: false,
              success: null,
              artifactKinds: ["OCR_TEXT"],
              detail: "fixture",
            },
            classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 }],
            classificationDiagnostics: [],
            selectedFacts: [],
            blockingRuleCodes: [],
            issueCodes: [],
            issueCount: 0,
            validationPasses: true,
            evidenceKind: "captured-fixture",
            snapshot: {
              engine: "OPENDATALOADER",
              mode: "hybrid",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: [],
              shouldPublish: true,
              confidenceScore: 0.8,
              durationMs: 7,
            },
            routeReason: "ocr-regression-fixture",
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
            blockingRuleDifferences: { onlyInPrimary: [], onlyInShadow: [] },
            durationMs: { primary: 5, shadow: 7 },
            materialDisagreement: false,
          },
          comparisonAssessment: {
            classification: "no_material_disagreement",
            summary: "No material disagreement was detected between legacy and OpenDataLoader for this case.",
          },
          divergenceSummary: null,
        },
        {
          caseId: "live-digital",
          name: "Live digital",
          fiscalYear: 2024,
          documentTags: ["digital_simple"],
          mode: "expected_and_differential",
          status: "completed",
          errors: [],
          evidenceKind: "live-local-odl",
          knownEvidenceLimitations: [],
          legacy: {
            engine: "LEGACY",
            executionSource: "document_fixture",
            mode: "legacy",
            runtimeMs: 6,
            confidenceScore: 0.9,
            validationScore: 1,
            shouldPublish: true,
            artifactGeneration: { attempted: false, success: null, artifactKinds: [], detail: "fixture" },
            classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 }],
            classificationDiagnostics: [],
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
              durationMs: 6,
            },
          },
          openDataLoader: {
            engine: "OPENDATALOADER",
            executionSource: "live_pdf",
            mode: "local",
            runtimeMs: 1000,
            confidenceScore: 0.9,
            validationScore: 1,
            shouldPublish: true,
            artifactGeneration: {
              attempted: true,
              success: true,
              artifactKinds: ["DOCUMENT_JSON"],
              detail: "live",
            },
            classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 }],
            classificationDiagnostics: [],
            selectedFacts: [],
            blockingRuleCodes: [],
            issueCodes: [],
            issueCount: 0,
            validationPasses: true,
            evidenceKind: "live-local-odl",
            snapshot: {
              engine: "OPENDATALOADER",
              mode: "local",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: [],
              shouldPublish: true,
              confidenceScore: 0.9,
              durationMs: 1000,
            },
            routeReason: "live-generated-from-legacy",
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
            blockingRuleDifferences: { onlyInPrimary: [], onlyInShadow: [] },
            durationMs: { primary: 6, shadow: 1000 },
            materialDisagreement: false,
          },
          comparisonAssessment: {
            classification: "no_material_disagreement",
            summary: "No material disagreement was detected between legacy and OpenDataLoader for this case.",
          },
          divergenceSummary: null,
        },
      ],
    });

    expect(summary.shadowCoverageByDocumentTag.scan_or_ocr.status).toBe("fixture_only");
    expect(summary.shadowCoverageByDocumentTag.scan_or_ocr.evidenceCounts["captured-fixture"]).toBe(1);
    expect(summary.shadowCoverageByDocumentTag.scan_or_ocr.usablePageStructureCases).toBe(1);
    expect(summary.shadowCoverageByDocumentTag.digital_simple.status).toBe(
      "live_parity_insufficient_sample",
    );
    expect(summary.shadowCoverageByDocumentTag.digital_simple.liveCases).toBe(1);
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

  it("keeps OpenDataLoader shadow-only even when the small live benchmark is clean", () => {
    const summary = summarizeAnnualReportBenchmarkRun({
      runtimeEnvironment: {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "17.0.18",
        javaMajorVersion: 17,
        localOpenDataLoaderReady: true,
        localOpenDataLoaderReason:
          "Java 17.0.18 is compatible with local OpenDataLoader execution.",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason:
          "Environment is ready for live local OpenDataLoader benchmark cases.",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "OPENDATALOADER_HYBRID_URL is not configured.",
      },
      cases: [
        {
          caseId: "live-clean",
          name: "Live clean",
          fiscalYear: 2024,
          documentTags: ["digital_simple", "live_local"],
          mode: "expected_and_differential",
          status: "completed",
          errors: [],
          evidenceKind: "live-local-odl",
          knownEvidenceLimitations: [],
          legacy: {
            engine: "LEGACY",
            executionSource: "document_fixture",
            mode: "legacy",
            runtimeMs: 20,
            confidenceScore: 0.95,
            validationScore: 1,
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
              confidenceScore: 0.95,
              durationMs: 20,
            },
          },
          openDataLoader: {
            engine: "OPENDATALOADER",
            executionSource: "live_pdf",
            mode: "local",
            runtimeMs: 1000,
            confidenceScore: 0.95,
            validationScore: 1,
            shouldPublish: true,
            artifactGeneration: {
              attempted: true,
              success: true,
              artifactKinds: ["DOCUMENT_JSON", "DOCUMENT_MARKDOWN"],
              detail: "live",
            },
            classifications: [],
            selectedFacts: [],
            blockingRuleCodes: [],
            issueCodes: [],
            issueCount: 0,
            validationPasses: true,
            evidenceKind: "live-local-odl",
            snapshot: {
              engine: "OPENDATALOADER",
              mode: "local",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: [],
              shouldPublish: true,
              confidenceScore: 0.95,
              durationMs: 1000,
            },
            routeReason: "live-generated-from-legacy",
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
              shadow: 1000,
            },
            materialDisagreement: false,
          },
          comparisonAssessment: {
            classification: "no_material_disagreement",
            summary:
              "No material disagreement was detected between legacy and OpenDataLoader for this case.",
          },
        },
      ],
    });

    expect(summary.recommendation).toContain("shadow-only");
    expect(summary.recommendationReason).toContain("forblir shadow-only");
    expect(summary.documentTagMetrics.digital_simple.publishParityRate).toBe(1);
    expect(summary.runtimeByEvidenceKind["live-local-odl"].caseCount).toBe(1);
  });
});
