import { describe, expect, it, vi } from "vitest";

import { runAnnualReportGoldSetShadowBatch } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import * as confidenceBatchModule from "@/server/benchmarking/annual-report-unified-confidence-batch";

describe("annual-report-gold-set-shadow-run", () => {
  it("persists comparable metadata and summary from the unified confidence batch", async () => {
    const spy = vi
      .spyOn(confidenceBatchModule, "runAnnualReportUnifiedConfidenceBatch")
      .mockResolvedValue({
        version: "annual-report-unified-confidence-batch-v1",
        generatedAt: "2026-05-10T00:00:00.000Z",
        manifest: {
          name: "gold-set",
          entries: [{ filingId: "filing-1", tagHints: ["digital_simple"] }],
        } as never,
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
            filingId: "filing-1",
            tagHints: ["digital_simple"],
            gateSummary: { overallVerdict: "PASS" },
            legacyCandidateSet: { classification: "real_legacy_candidate" },
            shadow: { summary: { comparisonMismatchCount: 0, comparisonMatchRate: 1 } },
          },
        ],
        summary: {
          totalCases: 1,
          completedCases: 1,
          skippedCases: 0,
          errorCases: 0,
          verdictCounts: { PASS: 1, WARN: 0, FAIL: 0, INSUFFICIENT_DATA: 0 },
          mostCommonFailingChecks: [],
          mostCommonWarningChecks: [],
          averageFinancialLineItemCount: 1,
          averageNarrativeSectionCount: 1,
          averageComparisonMatchRate: 1,
          totalDurationMs: 1,
          safetyInvariantViolations: [],
        },
      } as never);

    const run = await runAnnualReportGoldSetShadowBatch({
      manifest: {
        version: "annual-report-go-live-gold-set-v1",
        name: "gold-set",
        generatedAt: "2026-05-10T00:00:00.000Z",
        entries: [
          {
            orgNumber: "123456789",
            companyName: "Example AS",
            accountingYear: 2024,
            filingId: "filing-1",
            artifactDocumentReference: "filing-1.pdf",
            expectedTags: ["digital_simple"],
            evidenceType: "persisted_artifact",
            reasonForInclusion: "Representative case.",
            knownRisks: [],
            allowDuplicateOrgYear: false,
          },
        ],
      },
      gitCommitSha: "abc123",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(run.gitCommitSha).toBe("abc123");
    expect(run.manifest.hash).toHaveLength(64);
    expect(run.summary.parityCount).toBe(1);
    expect(run.summary.divergenceCount).toBe(0);
  });
});
