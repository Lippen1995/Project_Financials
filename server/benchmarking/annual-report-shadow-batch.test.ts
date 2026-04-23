import { afterEach, describe, expect, it, vi } from "vitest";

describe("annual-report-shadow-batch", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("parses a shadow-batch manifest", async () => {
    const module = await import("@/server/benchmarking/annual-report-shadow-batch");
    const manifest = module.parseAnnualReportShadowBatchManifest({
      name: "batch-a",
      entries: [
        {
          filingId: "filing-1",
          orgNumber: "123456789",
          fiscalYear: 2024,
          tagHints: ["scan_or_ocr"],
        },
      ],
    });

    expect(manifest.name).toBe("batch-a");
    expect(manifest.entries[0].tagHints).toEqual(["scan_or_ocr"]);
  });

  it("builds a selection manifest with tag hints from stored filing metadata", async () => {
    vi.doMock("@/server/persistence/annual-report-ingestion-repository", () => ({
      listAnnualReportFilingsForShadowSelection: vi.fn(async () => [
        {
          id: "filing-1",
          fiscalYear: 2024,
          lastError: null,
          company: {
            orgNumber: "123456789",
            name: "Example AS",
          },
          extractionRuns: [
            {
              documentEngineMode: "hybrid",
              ocrEngine: "TESSERACT",
              rawSummary: {
                classifications: [
                  { type: "STATUTORY_BALANCE_CONTINUATION", unitScale: 1 },
                  { type: "NOTE", unitScale: 1000 },
                ],
                issues: [{ ruleCode: "UNIT_SCALE_UNCERTAIN" }],
              },
            },
          ],
          reviews: [
            {
              status: "PENDING_REVIEW",
              latestActionNote: "Needs operator check",
              blockingRuleCodes: ["SUSPICIOUS_COLUMN_SWAP"],
            },
          ],
        },
      ]),
      getAnnualReportFilingWithArtifacts: vi.fn(),
    }));

    const module = await import("@/server/benchmarking/annual-report-shadow-batch");
    const manifest = await module.selectAnnualReportShadowBatchManifest({
      desiredTags: ["scan_or_ocr"],
      limit: 5,
    });

    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0].tagHints).toEqual(
      expect.arrayContaining([
        "scan_or_ocr",
        "ocr_token_noise",
        "continuation_complex",
        "multi_page_balance",
        "unit_scale_sensitive",
        "manual_review_expected",
        "column_swap",
        "degraded_ambiguous",
      ]),
    );
  });

  it("summarizes shadow outcomes by class and evidence quality", async () => {
    const module = await import("@/server/benchmarking/annual-report-shadow-batch");
    const manifest = module.parseAnnualReportShadowBatchManifest({
      name: "shadow-batch",
      entries: [
        { filingId: "f1", orgNumber: "123456789", fiscalYear: 2024, tagHints: ["scan_or_ocr"] },
        { filingId: "f2", orgNumber: "987654321", fiscalYear: 2024, tagHints: ["digital_simple"] },
      ],
    });

    const summary = module.summarizeShadowBatch(
      manifest,
      {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "17.0.18",
        javaMajorVersion: 17,
        localOpenDataLoaderReady: true,
        localOpenDataLoaderReason: "ready",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason: "ready",
        liveHybridBenchmarkReady: false,
        liveHybridBenchmarkReason: "missing hybrid backend",
      },
      [
        {
          caseId: "f1",
          filingId: "f1",
          orgNumber: "123456789",
          companyName: "Scan AS",
          fiscalYear: 2024,
          name: "Scan AS 2024",
          documentTags: ["scan_or_ocr", "ocr_token_noise"],
          tagHints: ["scan_or_ocr"],
          status: "skipped",
          evidenceKind: "legacy-only",
          evidenceQuality: "runtime-unavailable",
          errors: ["Hybrid runtime unavailable"],
          knownEvidenceLimitations: ["No live hybrid backend"],
          legacy: {
            engine: "LEGACY",
            executionSource: "ocr_fixture",
            mode: "legacy",
            runtimeMs: 10,
            confidenceScore: 0.7,
            validationScore: 0.8,
            shouldPublish: false,
            artifactGeneration: {
              attempted: false,
              success: null,
              artifactKinds: [],
              detail: "ocr",
            },
            classifications: [{ pageNumber: 2, type: "STATUTORY_INCOME", unitScale: 1 }],
            classificationDiagnostics: [],
            selectedFacts: [],
            blockingRuleCodes: ["STATEMENT_TABLE_LAYOUT_WEAK"],
            issueCodes: ["STATEMENT_TABLE_LAYOUT_WEAK"],
            issueCount: 1,
            validationPasses: false,
            evidenceKind: "legacy-only",
            snapshot: {
              engine: "LEGACY",
              mode: "legacy",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: ["STATEMENT_TABLE_LAYOUT_WEAK"],
              shouldPublish: false,
              confidenceScore: 0.7,
              durationMs: 10,
            },
          },
        },
        {
          caseId: "f2",
          filingId: "f2",
          orgNumber: "987654321",
          companyName: "Digital AS",
          fiscalYear: 2024,
          name: "Digital AS 2024",
          documentTags: ["digital_simple", "live_local"],
          tagHints: ["digital_simple"],
          status: "completed",
          evidenceKind: "live-local-odl",
          evidenceQuality: "real-filing-live-local",
          errors: [],
          knownEvidenceLimitations: [],
          legacy: {
            engine: "LEGACY",
            executionSource: "document_fixture",
            mode: "legacy",
            runtimeMs: 8,
            confidenceScore: 0.95,
            validationScore: 1,
            shouldPublish: true,
            artifactGeneration: { attempted: false, success: null, artifactKinds: [], detail: "digital" },
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
              confidenceScore: 0.95,
              durationMs: 8,
            },
          },
          openDataLoader: {
            engine: "OPENDATALOADER",
            executionSource: "live_pdf",
            mode: "local",
            runtimeMs: 100,
            confidenceScore: 0.94,
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
              confidenceScore: 0.94,
              durationMs: 100,
            },
            routeReason: "Reliable text layer detected",
            usablePageStructure: true,
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
            durationMs: { primary: 8, shadow: 100 },
            materialDisagreement: false,
          },
          comparisonAssessment: {
            classification: "no_material_disagreement",
            summary: "No material disagreement.",
          },
          divergenceSummary: null,
        },
      ],
    );

    expect(summary.evidenceQualityCounts["runtime-unavailable"]).toBe(1);
    expect(summary.evidenceQualityCounts["real-filing-live-local"]).toBe(1);
    expect(summary.classesWithZeroLiveEvidence).toContain("scan_or_ocr");
    expect(summary.liveOcrOrScannedCoverage.totalCases).toBe(1);
    expect(summary.liveOcrOrScannedCoverage.runtimeUnavailableCases).toBe(1);
    expect(summary.shadowCoverageByDocumentTag.digital_simple.status).toBe(
      "live_parity_insufficient_sample",
    );
  });
});
