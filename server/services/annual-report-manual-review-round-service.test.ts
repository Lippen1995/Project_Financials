import path from "node:path";

import { AnnualReportArtifactType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import type { UnifiedConfidenceFilingDrilldown } from "@/server/services/annual-report-unified-confidence-drilldown-service";
import {
  buildAnnualReportManualReviewRound,
  renderAnnualReportManualReviewRoundMarkdown,
  saveAnnualReportManualReviewDecision,
  type AnnualReportManualReviewRoundServiceDeps,
} from "@/server/services/annual-report-manual-review-round-service";

const SHADOW_RUN_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-gold-set-shadow-runs",
);

function makeRun(): AnnualReportGoldSetShadowRun {
  return {
    version: "annual-report-gold-set-shadow-run-v1",
    runId: "gold-set-2026-05-10",
    generatedAt: "2026-05-10T12:00:00.000Z",
    gitCommitSha: "abc123",
    environment: {
      nodeEnv: "test",
      opendataloaderMode: "local",
      opendataloaderEnabled: "true",
    },
    manifest: {
      name: "manual-review-gold-set",
      version: "annual-report-go-live-gold-set-v1",
      hash: "manifest-hash",
      validation: {
        productionReady: true,
        errors: [],
        warnings: [],
        valid: true,
        coverageByTag: {},
        evidenceQualitySummary: {
          live_local: 0,
          persisted_artifact: 1,
          fixture_only: 0,
          unavailable: 0,
        },
      },
    },
    routeConfiguration: {
      mode: "PERSIST_ARTIFACTS",
      persistShadowArtifacts: true,
      persistConfidenceGateArtifacts: true,
    },
    parserRuntimeDiagnostics: {
      opendataloaderMode: "local",
      opendataloaderEnabled: "true",
    },
    batch: {
      version: "annual-report-unified-confidence-batch-v1",
      generatedAt: "2026-05-10T12:00:00.000Z",
      manifest: {
        name: "batch-manifest",
        entries: [],
      },
      config: {
        mode: "PERSIST_ARTIFACTS",
        persistShadowArtifacts: true,
        persistConfidenceGateArtifacts: true,
        limit: null,
      },
      candidateCounts: {
        real_legacy_candidate: 1,
        fixture_candidate: 0,
        unavailable_candidate: 0,
        malformed_candidate: 0,
      },
      cases: [
        {
          caseId: "case-1",
          filingId: "filing-1",
          orgNumber: "123456789",
          companyName: "Eksempel AS",
          fiscalYear: 2024,
          label: "Eksempel AS 2024",
          tagHints: ["manual_review_expected", "unit_scale_sensitive"],
          status: "completed",
          errors: [],
          warnings: [],
          durationMs: 1000,
          legacyCandidateSet: {
            classification: "real_legacy_candidate",
            candidateCount: 3,
            provenance: {
              orgNumber: "123456789",
              filingId: "filing-1",
              fiscalYear: 2024,
              filingReportId: "report-1",
              sourceDocumentReference: "source.pdf",
              sourceArtifactReference: "legacy.json",
              extractionRoute: "legacy",
              evidenceType: "persisted_artifact",
              extractionTimestamp: "2026-05-09T12:00:00.000Z",
              artifactTimestamp: "2026-05-09T12:00:00.000Z",
              sourceRunId: "run-1",
              source: "published_snapshot",
              lookupDiagnostics: [],
            },
            diagnostics: [],
            preview: [],
          },
          shadow: {
            mode: "PERSIST_ARTIFACTS",
            skipped: false,
            totalDurationMs: 900,
            canUseForProductionRouting: false,
            steps: {
              document: { ok: true, durationMs: 100, error: null },
              financial: { ok: true, durationMs: 200, error: null },
              narrative: { ok: true, durationMs: 150, error: null },
              comparison: { ok: true, durationMs: 120, error: null },
            },
            summary: {
              documentPageCount: 20,
              documentSectionCount: 8,
              financialStatementCount: 2,
              financialLineItemCount: 30,
              narrativeSectionCount: 2,
              comparisonFactCount: 7,
              comparisonExactMatchCount: 4,
              comparisonMismatchCount: 2,
              comparisonMatchRate: 0.6,
            },
            artifacts: {},
          },
          gate: null,
          gateSummary: {
            overallVerdict: "FAIL",
            passCount: 1,
            warnCount: 1,
            failCount: 2,
            insufficientDataCount: 0,
            blockingCheckCodes: ["UNIT_SCALE_RESOLVED"],
            warningCheckCodes: [],
          },
          safety: {
            canUseForProductionRouting: false,
            productionRoutingChanged: false,
            productionFactsMutated: false,
            publishAffected: false,
          },
        },
      ],
      summary: {
        totalCases: 1,
        completedCases: 1,
        skippedCases: 0,
        errorCases: 0,
        verdictCounts: {
          PASS: 0,
          WARN: 0,
          FAIL: 1,
          INSUFFICIENT_DATA: 0,
        },
        mostCommonFailingChecks: [],
        mostCommonWarningChecks: [],
        averageFinancialLineItemCount: 30,
        averageNarrativeSectionCount: 2,
        averageComparisonMatchRate: 0.6,
        totalDurationMs: 1000,
        safetyInvariantViolations: [],
      },
    },
    summary: {
      passCount: 0,
      warnCount: 0,
      failCount: 1,
      skipCount: 0,
      parityCount: 0,
      divergenceCount: 1,
      manualReviewCandidates: ["filing-1"],
      evidenceQualityByTag: {
        manual_review_expected: { real_legacy_candidate: 1 },
      },
    },
  };
}

function makeDrilldown(): UnifiedConfidenceFilingDrilldown {
  return {
    detail: {
      filingId: "filing-1",
      orgNumber: "123456789",
      companyName: "Eksempel AS",
      fiscalYear: 2024,
      status: "completed",
      gateVerdict: "FAIL",
      passCount: 1,
      warnCount: 1,
      failCount: 2,
      insufficientDataCount: 0,
      blockingCheckCodes: ["UNIT_SCALE_RESOLVED"],
      warningCheckCodes: [],
      financialLineItemCount: 30,
      narrativeSectionCount: 2,
      comparisonMatchRate: 0.6,
      durationMs: null,
      generatedAt: "2026-05-10T12:00:00.000Z",
      artifactId: "gate-1",
      artifactStatus: "CREATED",
      artifactCreatedAt: "2026-05-10T12:00:00.000Z",
      artifactUpdatedAt: "2026-05-10T12:00:00.000Z",
      artifactSourceCommand: "test",
      artifactSourceCommitSha: "abc123",
      errors: [],
      warnings: [],
      companyId: "company-1",
      artifactKind: "UNIFIED_EXTRACTION_CONFIDENCE_GATE",
      fullChecks: [
        {
          checkCode: "UNIT_SCALE_RESOLVED",
          verdict: "FAIL",
          message: "Unknown unit scale.",
          value: 1,
          threshold: 0,
        },
      ],
      safety: {
        canUseForProductionRouting: false,
        productionRoutingChanged: false,
        productionFactsMutated: false,
        publishAffected: false,
      },
      shadowSummary: {
        documentPageCount: 20,
        financialStatementCount: 2,
        financialLineItemCount: 30,
        narrativeSectionCount: 2,
        comparisonFactCount: 7,
        comparisonExactMatchCount: 4,
        comparisonMismatchCount: 2,
        comparisonMatchRate: 0.6,
      },
      artifactPayload: {},
      artifactSummary: {},
    },
    artifacts: {
      availability: [],
      parserDocument: {
        kind: "UNIFIED_PARSER_DOCUMENT",
        status: "available",
        artifactId: "parser-1",
        createdAt: "2026-05-10T12:00:00.000Z",
        summary: {},
        data: {
          summary: {},
          pageSummaries: [],
          sectionSummaries: [],
          tableSummaries: [],
          warnings: [],
          errors: [],
        },
        issues: [],
      },
      financialExtraction: {
        kind: "UNIFIED_FINANCIAL_EXTRACTION",
        status: "available",
        artifactId: "financial-1",
        createdAt: "2026-05-10T12:00:00.000Z",
        summary: {},
        data: {
          statements: [],
          lineItems: [],
          warnings: [],
          errors: [],
        },
        issues: [],
      },
      narrativeExtraction: {
        kind: "UNIFIED_NARRATIVE_EXTRACTION",
        status: "available",
        artifactId: "narrative-1",
        createdAt: "2026-05-10T12:00:00.000Z",
        summary: {},
        data: {
          sections: [],
          warnings: [],
        },
        issues: [],
      },
      comparison: {
        kind: "LEGACY_VS_UNIFIED_EXTRACTION_COMPARISON",
        status: "available",
        artifactId: "comparison-1",
        createdAt: "2026-05-10T12:00:00.000Z",
        summary: {},
        data: {
          summary: {
            financialTotalCompared: 7,
            financialExactMatchCount: 4,
          },
          financialComparisons: [
            {
              canonicalKey: "revenue",
              fiscalYear: 2024,
              legacyValueNok: "1000000",
              unifiedValueNok: "800000",
              deltaNok: "-200000",
              match: "CONFLICTING_VALUES",
              relativeDeviation: 0.2,
              legacyLabel: "Sum driftsinntekter",
              unifiedLabel: "Sum driftsinntekter",
              legacyUnitScale: 1,
              unifiedUnitScale: "ONES",
            },
            {
              canonicalKey: "net_income",
              fiscalYear: 2024,
              legacyValueNok: "200000",
              unifiedValueNok: null,
              deltaNok: null,
              match: "MISSING_IN_UNIFIED",
              relativeDeviation: null,
              legacyLabel: "Årsresultat",
              unifiedLabel: null,
              legacyUnitScale: 1,
              unifiedUnitScale: null,
            },
          ],
          mismatches: [
            {
              canonicalKey: "revenue",
              fiscalYear: 2024,
              legacyValueNok: "1000000",
              unifiedValueNok: "800000",
              deltaNok: "-200000",
              match: "CONFLICTING_VALUES",
              relativeDeviation: 0.2,
              legacyLabel: "Sum driftsinntekter",
              unifiedLabel: "Sum driftsinntekter",
              legacyUnitScale: 1,
              unifiedUnitScale: "ONES",
              severity: "MINOR",
            },
          ],
          narrativeComparisons: [
            {
              kind: "AUDITOR_REPORT",
              legacyFound: true,
              unifiedFound: false,
              unifiedSectionKind: null,
              textSimilarity: 0.4,
            },
          ],
          warnings: [],
        },
        issues: [],
      },
      confidenceGate: {
        kind: "UNIFIED_EXTRACTION_CONFIDENCE_GATE",
        status: "available",
        artifactId: "gate-1",
        createdAt: "2026-05-10T12:00:00.000Z",
        summary: {},
        data: { checks: [] },
        issues: [],
      },
    },
    gateCheckContext: [],
    safety: {
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      productionFactsMutated: false,
      publishAffected: false,
    },
  };
}

function makeFiling() {
  return {
    id: "filing-1",
    fiscalYear: 2024,
    sourceIdempotencyKey: "report-1",
    sourceUrl: "https://example.test/report.pdf",
    company: {
      id: "company-1",
      orgNumber: "123456789",
      name: "Eksempel AS",
    },
    artifacts: [
      {
        id: "artifact-pdf",
        filingId: "filing-1",
        artifactType: AnnualReportArtifactType.PDF,
        storageKey: "source.pdf",
        checksum: "abc",
        mimeType: "application/pdf",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "artifact-legacy",
        filingId: "filing-1",
        artifactType: AnnualReportArtifactType.EXTRACTION_JSON,
        storageKey: "legacy.json",
        checksum: "def",
        mimeType: "application/json",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    extractionRuns: [
      {
        documentEngine: "legacy",
      },
    ],
    reviews: [],
  };
}

function createMemoryDeps(run: AnnualReportGoldSetShadowRun) {
  const files = new Map<string, string>();
  files.set(path.join(SHADOW_RUN_DIR, "latest.json"), JSON.stringify(run));
  files.set(path.join(SHADOW_RUN_DIR, `${run.runId}.json`), JSON.stringify(run));

  return {
    files,
    deps: ({
      readDir: vi.fn(async (dir: string) => {
        const names = new Set<string>();
        for (const filePath of files.keys()) {
          if (path.dirname(filePath) === dir) {
            names.add(path.basename(filePath));
          }
        }
        return Array.from(names);
      }),
      readFile: vi.fn(async (filePath: string) => {
        const value = files.get(filePath);
        if (value === undefined) {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          throw error;
        }
        return value;
      }),
      writeFile: vi.fn(async (filePath: string, value: string | Buffer) => {
        files.set(filePath, String(value));
      }),
      mkdir: vi.fn(async () => undefined),
      getDrilldown: vi.fn(async () => makeDrilldown()),
      getFiling: vi.fn(async () => makeFiling() as never),
      now: () => new Date("2026-05-10T12:30:00.000Z"),
    } as unknown) as AnnualReportManualReviewRoundServiceDeps,
  };
}

describe("annual-report-manual-review-round-service", () => {
  it("selects review candidates deterministically from a persisted gold-set shadow run", async () => {
    const { deps } = createMemoryDeps(makeRun());

    const first = await buildAnnualReportManualReviewRound({}, deps);
    const second = await buildAnnualReportManualReviewRound({}, deps);

    expect(first?.candidates).toHaveLength(1);
    expect(first?.candidates[0]?.candidateId).toBe(second?.candidates[0]?.candidateId);
    expect(first?.candidates[0]?.severity).toBe("HIGH");
    expect(first?.candidates[0]?.issueClasses).toContain("confidence_gate_fail");
    expect(first?.candidates[0]?.issueClasses).toContain("unit_scale_ambiguity");
    expect(first?.candidates[0]?.comparisonResult.narrativeMismatchCount).toBe(1);
  });

  it("marks missing artifacts and aggregates summary counts", async () => {
    const run = makeRun();
    const { deps } = createMemoryDeps(run);
    const getFilingMock =
      deps.getFiling as NonNullable<AnnualReportManualReviewRoundServiceDeps["getFiling"]>;
    vi.mocked(getFilingMock).mockResolvedValueOnce({
      ...makeFiling(),
      artifacts: [],
      sourceUrl: null,
    } as never);

    const round = await buildAnnualReportManualReviewRound({}, deps);

    expect(round?.summary.missingArtifactCounts.source_pdf).toBe(1);
    expect(round?.summary.missingArtifactCounts.structured_document_json).toBe(1);
    expect(round?.summary.pendingCount).toBe(1);
    expect(round?.summary.topFailingCanonicalFinancialKeys).toEqual(
      expect.arrayContaining([
        {
          canonicalKey: "revenue",
          count: 1,
        },
      ]),
    );
  });

  it("persists reviewer decisions and updates latest round outputs", async () => {
    const { deps, files } = createMemoryDeps(makeRun());
    const initial = await buildAnnualReportManualReviewRound({}, deps);
    const candidateId = initial?.candidates[0]?.candidateId;
    expect(candidateId).toBeTruthy();

    const saved = await saveAnnualReportManualReviewDecision(
      {
        runId: "gold-set-2026-05-10",
        candidateId: candidateId!,
        decision: "NEEDS_EXTRACTION_FIX",
        issueClasses: ["confidence_gate_fail", "unit_scale_ambiguity"],
        reviewerNotes: "Unified skala må avklares.",
        reviewedBy: "user-1",
        reviewedByRole: "ADMIN",
        severityOverride: "HIGH",
      },
      deps,
    );

    expect(saved.round.candidates[0]?.status).toBe("REVIEWED");
    expect(saved.round.decisions[0]?.decision).toBe("NEEDS_EXTRACTION_FIX");
    expect(
      files.has(
        path.join(
          process.cwd(),
          "output",
          "benchmarks",
          "annual-report-manual-review-rounds",
          "latest.json",
        ),
      ),
    ).toBe(true);
  });

  it("renders markdown with review-round summary and next actions", async () => {
    const { deps } = createMemoryDeps(makeRun());
    const round = await buildAnnualReportManualReviewRound({}, deps);
    const markdown = renderAnnualReportManualReviewRoundMarkdown(round!);

    expect(markdown).toContain("# Manual review round");
    expect(markdown).toContain("PR77 calibration");
    expect(markdown).toContain("Representative candidates");
  });
});
