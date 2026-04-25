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

  it("builds a named baseline OCR manifest for the persisted filing family", async () => {
    vi.doMock("@/server/persistence/annual-report-ingestion-repository", () => ({
      listAnnualReportFilingsForShadowSelection: vi.fn(async () => [
        {
          id: "filing-2024",
          fiscalYear: 2024,
          lastError: null,
          company: {
            orgNumber: "918298037",
            name: "Baseline AS",
          },
          extractionRuns: [],
          reviews: [],
        },
        {
          id: "filing-2023",
          fiscalYear: 2023,
          lastError: null,
          company: {
            orgNumber: "918298037",
            name: "Baseline AS",
          },
          extractionRuns: [],
          reviews: [],
        },
      ]),
      getAnnualReportFilingWithArtifacts: vi.fn(),
    }));

    const module = await import("@/server/benchmarking/annual-report-shadow-batch");
    const manifest = await module.buildBaselineAnnualReportShadowBatchManifest({
      fiscalYears: [2024, 2023],
    });

    expect(manifest.name).toContain("baseline-shadow-batch-918298037-2023-2024");
    expect(manifest.selection).toMatchObject({
      baselineOrgNumber: "918298037",
      baselineFiscalYears: [2024, 2023],
      baselineClass: "scan_or_ocr",
    });
    expect(manifest.entries.map((entry) => entry.fiscalYear)).toEqual([2024, 2023]);
    expect(manifest.entries[0].tagHints).toEqual(
      expect.arrayContaining(["scan_or_ocr", "manual_review_expected"]),
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
          routeDecision: {
            executionMode: "hybrid",
            requiresOcr: true,
            reasonCode: "SCANNED_PDF",
            reason: "Weak text layer requires hybrid OCR.",
          },
          legacyOcrDiagnostics: {
            minWidthPx: 64,
            minHeightPx: 64,
            minAreaPx: 8192,
            pageCount: 2,
            imageRegionCount: 2,
            tinyCropSkippedCount: 1,
            invalidCropCount: 0,
            ocrAttemptCount: 1,
            ocrFailureCount: 0,
            usableOcrRegionCount: 1,
            pageLevelOcrFallbackCount: 2,
            manualReviewDueToOcrQualityCount: 0,
            suppressedFailureMessages: [],
            regionFailures: [],
          },
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

  it("renders route decisions and OCR diagnostics in markdown summaries", async () => {
    const module = await import("@/server/benchmarking/annual-report-shadow-batch");
    const markdown = module.renderAnnualReportShadowBatchMarkdown({
      generatedAt: "2026-04-24T12:00:00.000Z",
      manifest: module.parseAnnualReportShadowBatchManifest({
        name: "baseline-shadow-batch",
        entries: [{ filingId: "f1", orgNumber: "918298037", fiscalYear: 2024 }],
      }),
      runtimeEnvironment: {
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
      cases: [
        {
          caseId: "f1",
          filingId: "f1",
          orgNumber: "918298037",
          companyName: "Baseline AS",
          fiscalYear: 2024,
          name: "Baseline AS 2024",
          documentTags: ["scan_or_ocr"],
          tagHints: ["scan_or_ocr"],
          status: "skipped",
          evidenceKind: "legacy-only",
          evidenceQuality: "runtime-unavailable",
          routeDecision: {
            executionMode: "hybrid",
            requiresOcr: true,
            reasonCode: "SCANNED_PDF",
            reason: "Preflight detected weak text extraction.",
          },
          legacyOcrDiagnostics: {
            minWidthPx: 64,
            minHeightPx: 64,
            minAreaPx: 8192,
            pageCount: 2,
            imageRegionCount: 2,
            tinyCropSkippedCount: 1,
            invalidCropCount: 0,
            ocrAttemptCount: 1,
            ocrFailureCount: 0,
            usableOcrRegionCount: 1,
            pageLevelOcrFallbackCount: 2,
            manualReviewDueToOcrQualityCount: 0,
            suppressedFailureMessages: [
              { message: "Image too small to scale", count: 3 },
            ],
            regionFailures: [],
          },
          errors: ["Hybrid runtime unavailable"],
          knownEvidenceLimitations: ["No live hybrid backend"],
        },
      ],
      summary: {
        ...module.summarizeShadowBatch(
          module.parseAnnualReportShadowBatchManifest({
            name: "baseline-shadow-batch",
            entries: [{ filingId: "f1", orgNumber: "918298037", fiscalYear: 2024 }],
          }),
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
              orgNumber: "918298037",
              companyName: "Baseline AS",
              fiscalYear: 2024,
              name: "Baseline AS 2024",
              documentTags: ["scan_or_ocr"],
              tagHints: ["scan_or_ocr"],
              status: "skipped",
              evidenceKind: "legacy-only",
              evidenceQuality: "runtime-unavailable",
              routeDecision: {
                executionMode: "hybrid",
                requiresOcr: true,
                reasonCode: "SCANNED_PDF",
                reason: "Preflight detected weak text extraction.",
              },
              legacyOcrDiagnostics: {
                minWidthPx: 64,
                minHeightPx: 64,
                minAreaPx: 8192,
                pageCount: 2,
                imageRegionCount: 2,
                tinyCropSkippedCount: 1,
                invalidCropCount: 0,
                ocrAttemptCount: 1,
                ocrFailureCount: 0,
                usableOcrRegionCount: 1,
                pageLevelOcrFallbackCount: 2,
                manualReviewDueToOcrQualityCount: 0,
                suppressedFailureMessages: [
                  { message: "Image too small to scale", count: 3 },
                ],
                regionFailures: [],
              },
              errors: ["Hybrid runtime unavailable"],
              knownEvidenceLimitations: ["No live hybrid backend"],
            },
          ],
        ),
      },
    });

    expect(markdown).toContain("Default baseline org: 918298037");
    expect(markdown).toContain("Route decision: hybrid (SCANNED_PDF), requires OCR");
    expect(markdown).toContain(
      "OCR diagnostics: attempts=1, usable=1, tinySkipped=1, invalid=0, failures=0, pageFallbacks=2, manualReviewDueToOcrQuality=0",
    );
    expect(markdown).toContain("OCR suppressed failures: Image too small to scale (3)");
  });

  it("renders explicit ODL structure diagnostics for a live hybrid baseline case", async () => {
    const module = await import("@/server/benchmarking/annual-report-shadow-batch");
    const manifest = module.parseAnnualReportShadowBatchManifest({
      name: "baseline-shadow-batch",
      entries: [{ filingId: "f1", orgNumber: "918298037", fiscalYear: 2024 }],
    });

    const markdown = module.renderAnnualReportShadowBatchMarkdown({
      generatedAt: "2026-04-25T12:00:00.000Z",
      manifest,
      runtimeEnvironment: {
        opendataloaderPackageVersion: "2.2.1",
        javaVersion: "17.0.18",
        javaMajorVersion: 17,
        localOpenDataLoaderReady: true,
        localOpenDataLoaderReason: "ready",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason: "ready",
        liveHybridBenchmarkReady: true,
        liveHybridBenchmarkReason: "ready",
      },
      cases: [
        {
          caseId: "f1",
          filingId: "f1",
          orgNumber: "918298037",
          companyName: "Baseline AS",
          fiscalYear: 2024,
          name: "Baseline AS 2024",
          documentTags: ["scan_or_ocr", "live_hybrid"],
          tagHints: ["scan_or_ocr"],
          status: "completed",
          evidenceKind: "live-hybrid-odl",
          evidenceQuality: "real-filing-live-hybrid",
          routeDecision: {
            executionMode: "hybrid",
            hybridMode: "full",
            requiresOcr: true,
            reasonCode: "FORCED_HYBRID",
            reason: "Hybrid mode selected explicitly by configuration.",
          },
          errors: [],
          knownEvidenceLimitations: [],
          legacy: {
            engine: "LEGACY",
            executionSource: "ocr_fixture",
            mode: "legacy",
            runtimeMs: 5,
            confidenceScore: 0.2,
            validationScore: 1,
            shouldPublish: false,
            artifactGeneration: {
              attempted: false,
              success: null,
              artifactKinds: [],
              detail: "ocr",
            },
            classifications: [],
            classificationDiagnostics: [],
            selectedFacts: [],
            blockingRuleCodes: ["PRIMARY_INCOME_PAGE_MISSING"],
            issueCodes: ["PRIMARY_INCOME_PAGE_MISSING"],
            issueCount: 1,
            validationPasses: false,
            evidenceKind: "legacy-only",
            snapshot: {
              engine: "LEGACY",
              mode: "legacy",
              classifications: [],
              selectedFacts: [],
              blockingRuleCodes: ["PRIMARY_INCOME_PAGE_MISSING"],
              shouldPublish: false,
              confidenceScore: 0.2,
              durationMs: 5,
            },
          },
          openDataLoader: {
            engine: "OPENDATALOADER",
            executionSource: "live_pdf",
            mode: "hybrid",
            runtimeMs: 100,
            confidenceScore: 0.195,
            validationScore: 1,
            shouldPublish: false,
            artifactGeneration: {
              attempted: true,
              success: true,
              artifactKinds: ["DOCUMENT_JSON"],
              detail: "live",
            },
            classifications: [{ pageNumber: 1, type: "COVER", unitScale: null }],
            classificationDiagnostics: [
              {
                pageNumber: 1,
                type: "COVER",
                confidence: 0.15,
                unitScale: null,
                unitScaleConfidence: 0,
                hasConflictingUnitSignals: false,
                declaredYears: [],
                yearHeaderYears: [],
                heading: null,
                numericRowCount: 0,
                tableLike: false,
                reasons: ["No strong page classification signals"],
              },
            ],
            selectedFacts: [],
            blockingRuleCodes: [
              "PRIMARY_INCOME_PAGE_MISSING",
              "PRIMARY_BALANCE_PAGE_MISSING",
            ],
            issueCodes: [
              "PRIMARY_INCOME_PAGE_MISSING",
              "PRIMARY_BALANCE_PAGE_MISSING",
            ],
            issueCount: 2,
            validationPasses: false,
            evidenceKind: "live-hybrid-odl",
            snapshot: {
              engine: "OPENDATALOADER",
              mode: "hybrid",
              classifications: [{ pageNumber: 1, type: "COVER", unitScale: null }],
              selectedFacts: [],
              blockingRuleCodes: [
                "PRIMARY_INCOME_PAGE_MISSING",
                "PRIMARY_BALANCE_PAGE_MISSING",
              ],
              shouldPublish: false,
              confidenceScore: 0.195,
              durationMs: 100,
            },
            routeReason: "Hybrid mode selected explicitly by configuration.",
            usablePageStructure: false,
          },
          openDataLoaderDiagnostics: {
            rawOutput: {
              topLevelType: "object",
              topLevelKeys: ["kids", "number of pages"],
              elementCount: 25,
              pageCount: 25,
              tableCount: 0,
              textElementCount: 0,
              elementTypeCounts: {
                image: 25,
              },
              elementContainerPaths: ["$.kids"],
              pageNumbers: [1, 2, 3],
              sampleElementKeys: ["bounding box", "id", "page number", "type"],
              sampleElementTypes: ["image"],
              topLevelContainerDiagnostics: [],
            },
            normalizedOutput: {
              pageCount: 25,
              blockCount: 25,
              tableCount: 0,
              blockKindCounts: {
                picture: 25,
              },
              rawTypeCounts: {
                image: 25,
              },
              pages: [
                {
                  pageNumber: 1,
                  blockCount: 1,
                  tableCount: 0,
                  textLength: 0,
                  blockKindCounts: {
                    picture: 1,
                  },
                  rawTypeCounts: {
                    image: 1,
                  },
                },
              ],
            },
            annualReportPages: {
              pageCount: 25,
              totalLines: 0,
              totalTables: 0,
              pages: [
                {
                  pageNumber: 1,
                  lineCount: 0,
                  tableCount: 0,
                  textLength: 0,
                  blockKindCounts: {
                    picture: 1,
                  },
                },
              ],
            },
            firstFailingStage: "hybrid_output",
            rootCauseClassification: "hybrid_output_weakness",
            firstFailingReason:
              "Hybrid returned only image blocks without text or table structure, so downstream statement detection had no usable signals.",
            statementLikeSignalsPresent: false,
            imageOnlyRawOutput: true,
          },
        },
      ],
      summary: {
        ...module.summarizeShadowBatch(manifest, {
          opendataloaderPackageVersion: "2.2.1",
          javaVersion: "17.0.18",
          javaMajorVersion: 17,
          localOpenDataLoaderReady: true,
          localOpenDataLoaderReason: "ready",
          liveLocalBenchmarkReady: true,
          liveLocalBenchmarkReason: "ready",
          liveHybridBenchmarkReady: true,
          liveHybridBenchmarkReason: "ready",
        }, [
          {
            caseId: "f1",
            filingId: "f1",
            orgNumber: "918298037",
            companyName: "Baseline AS",
            fiscalYear: 2024,
            name: "Baseline AS 2024",
            documentTags: ["scan_or_ocr", "live_hybrid"],
            tagHints: ["scan_or_ocr"],
            status: "completed",
            evidenceKind: "live-hybrid-odl",
            evidenceQuality: "real-filing-live-hybrid",
            routeDecision: {
              executionMode: "hybrid",
              hybridMode: "full",
              requiresOcr: true,
              reasonCode: "FORCED_HYBRID",
              reason: "Hybrid mode selected explicitly by configuration.",
            },
            errors: [],
            knownEvidenceLimitations: [],
            openDataLoaderDiagnostics: {
              rawOutput: {
                topLevelType: "object",
                topLevelKeys: ["kids", "number of pages"],
                elementCount: 25,
                pageCount: 25,
                tableCount: 0,
                textElementCount: 0,
                elementTypeCounts: { image: 25 },
                elementContainerPaths: ["$.kids"],
                pageNumbers: [1],
                sampleElementKeys: ["type"],
                sampleElementTypes: ["image"],
                topLevelContainerDiagnostics: [],
              },
              normalizedOutput: {
                pageCount: 25,
                blockCount: 25,
                tableCount: 0,
                blockKindCounts: { picture: 25 },
                rawTypeCounts: { image: 25 },
                pages: [],
              },
              annualReportPages: {
                pageCount: 25,
                totalLines: 0,
                totalTables: 0,
                pages: [],
              },
              firstFailingStage: "hybrid_output",
              rootCauseClassification: "hybrid_output_weakness",
              firstFailingReason: "image only",
              statementLikeSignalsPresent: false,
              imageOnlyRawOutput: true,
            },
          },
        ]),
      },
    });

    expect(markdown).toContain("Route decision: hybrid/full (FORCED_HYBRID), requires OCR");
    expect(markdown).toContain(
      "ODL first failing stage: hybrid_output (hybrid_output_weakness)",
    );
    expect(markdown).toContain(
      "ODL raw output: elements=25, textElements=0, tables=0, pages=25, types=image:25",
    );
    expect(markdown).toContain(
      "ODL annual-report pages: pages=25, lines=0, tables=0, statementSignalsPresent=false, imageOnlyRawOutput=true",
    );
  });

  it("uses hybrid health readiness in runtime messaging for baseline OCR cases", async () => {
    vi.doMock("@/server/persistence/annual-report-ingestion-repository", () => ({
      listAnnualReportFilingsForShadowSelection: vi.fn(),
      getAnnualReportFilingWithArtifacts: vi.fn(async () => ({
        id: "filing-1",
        fiscalYear: 2024,
        lastError: null,
        company: {
          orgNumber: "918298037",
          name: "Baseline AS",
        },
        artifacts: [
          {
            artifactType: "PDF",
            storageKey: "baseline.pdf",
          },
        ],
      })),
    }));
    vi.doMock("@/server/financials/artifact-storage", () => ({
      LocalAnnualReportArtifactStorage: class {
        async getArtifactBuffer() {
          return Buffer.from("%PDF-1.4");
        }
      },
    }));
    vi.doMock("@/integrations/brreg/annual-report-financials/preflight", () => ({
      preflightAnnualReportDocument: vi.fn(async () => ({
        pageCount: 2,
        hasTextLayer: false,
        hasReliableTextLayer: false,
        parsedPages: [],
      })),
    }));
    vi.doMock("@/integrations/brreg/annual-report-financials/ocr", () => ({
      extractOcrPagesWithDiagnostics: vi.fn(async () => ({
        pages: [],
        diagnostics: {
          minWidthPx: 64,
          minHeightPx: 64,
          minAreaPx: 8192,
          pageCount: 2,
          imageRegionCount: 2,
          tinyCropSkippedCount: 0,
          invalidCropCount: 0,
          ocrAttemptCount: 2,
          ocrFailureCount: 0,
          usableOcrRegionCount: 0,
          pageLevelOcrFallbackCount: 2,
          manualReviewDueToOcrQualityCount: 1,
          suppressedFailureMessages: [],
          regionFailures: [],
        },
      })),
    }));
    vi.doMock("@/server/document-understanding/opendataloader-runtime", () => ({
      inspectOpenDataLoaderRuntime: vi.fn(async () => ({
        packageInstalled: true,
        packageVersion: "2.2.1",
        java: {
          rawVersion: "17.0.18",
          majorVersion: 17,
          available: true,
        },
        localModeReady: true,
        hybridConfigured: true,
        localModeReason: "ready",
        hybridModeReason: "configured",
        liveLocalBenchmarkReady: true,
        liveLocalBenchmarkReason: "ready",
        liveHybridBenchmarkReady: true,
        liveHybridBenchmarkReason: "configured",
      })),
      assertOpenDataLoaderRuntimeReady: vi.fn(async () => {
        throw new Error("Hybrid backend is unreachable");
      }),
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
        errorType: "unreachable",
        reason: "Hybrid backend healthcheck could not reach http://localhost:5002.",
        httpProbe: {
          attempted: true,
          endpoint: "http://localhost:5002/health",
          ok: false,
          reachable: false,
          status: null,
          contentType: null,
          bodyPreview: null,
          latencyMs: 20,
          reason: "fetch failed",
        },
        compatibilityProbe: {
          attempted: false,
          success: false,
          latencyMs: null,
          annualReportPageCount: null,
          blockCount: null,
          failureStage: null,
          reason: "probe skipped",
        },
      })),
    }));

    const module = await import("@/server/benchmarking/annual-report-shadow-batch");
    const run = await module.runAnnualReportShadowBatch(
      module.parseAnnualReportShadowBatchManifest({
        name: "baseline-shadow-batch",
        entries: [{ filingId: "filing-1", orgNumber: "918298037", fiscalYear: 2024 }],
      }),
    );

    expect(run.runtimeEnvironment.liveHybridBenchmarkReady).toBe(false);
    expect(run.runtimeEnvironment.liveHybridBenchmarkReason).toBe(
      "Hybrid backend healthcheck could not reach http://localhost:5002.",
    );
    expect(run.cases[0]?.evidenceQuality).toBe("runtime-unavailable");
  });
});
