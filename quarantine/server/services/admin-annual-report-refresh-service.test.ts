import { describe, expect, it, vi } from "vitest";
import { AnnualReportReviewStatus } from "@prisma/client";

import {
  listAffectedAnnualReportFilingsForRefresh,
  refreshAffectedAnnualReportFilingsFromAdmin,
} from "@/server/services/admin-annual-report-refresh-service";

describe("admin-annual-report-refresh-service", () => {
  it("deduplicates affected filings across review queue and unified confidence", async () => {
    const result = await listAffectedAnnualReportFilingsForRefresh({
      listReviews: vi.fn(async () => [
        {
          id: "review-1",
          filingId: "filing-a",
          fiscalYear: 2024,
          status: AnnualReportReviewStatus.PENDING_REVIEW,
          company: {
            orgNumber: "123",
            name: "Alpha AS",
            slug: "alpha-as",
          },
          filing: { status: "MANUAL_REVIEW" },
          extractionRun: null,
        },
      ] as never[]),
      listUnifiedConfidence: vi.fn(async () => ({
        items: [
          {
            filingId: "filing-a",
            orgNumber: "123",
            companyName: "Alpha AS",
            fiscalYear: 2024,
            status: "completed" as const,
            gateVerdict: "FAIL" as const,
            passCount: 0,
            warnCount: 0,
            failCount: 2,
            insufficientDataCount: 0,
            blockingCheckCodes: ["FINANCIAL_EXTRACTION_PRESENT"],
            warningCheckCodes: [],
            financialLineItemCount: 0,
            narrativeSectionCount: 0,
            comparisonMatchRate: 0,
            durationMs: null,
            generatedAt: "2026-05-18T10:00:00.000Z",
            artifactId: "artifact-1",
            artifactStatus: "CREATED" as const,
            artifactCreatedAt: "2026-05-18T10:01:00.000Z",
            artifactUpdatedAt: "2026-05-18T10:01:00.000Z",
            artifactSourceCommand: null,
            artifactSourceCommitSha: null,
            errors: [],
            warnings: [],
          },
        ],
        total: 1,
        limit: 1000,
        offset: 0,
        summary: {
          total: 1,
          PASS: 0,
          WARN: 0,
          FAIL: 1,
          INSUFFICIENT_DATA: 0,
        },
      }) as any),
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.filingId).toBe("filing-a");
    expect(result[0]?.sources).toEqual(
      expect.arrayContaining(["review_queue", "unified_confidence"]),
    );
    expect(result[0]?.reasons.join(" ")).toContain("Unified verdict er FAIL.");
  });

  it("uses only the latest unified result per filing", async () => {
    const result = await listAffectedAnnualReportFilingsForRefresh({
      listReviews: vi.fn(async () => []),
      listUnifiedConfidence: vi.fn(async () => ({
        items: [
          {
            filingId: "filing-a",
            orgNumber: "123",
            companyName: "Alpha AS",
            fiscalYear: 2024,
            status: "completed" as const,
            gateVerdict: "FAIL" as const,
            passCount: 0,
            warnCount: 0,
            failCount: 2,
            insufficientDataCount: 0,
            blockingCheckCodes: [],
            warningCheckCodes: [],
            financialLineItemCount: 4,
            narrativeSectionCount: 2,
            comparisonMatchRate: 0.8,
            durationMs: null,
            generatedAt: "2026-05-18T09:00:00.000Z",
            artifactId: "artifact-old",
            artifactStatus: "CREATED" as const,
            artifactCreatedAt: "2026-05-18T09:00:00.000Z",
            artifactUpdatedAt: "2026-05-18T09:00:00.000Z",
            artifactSourceCommand: null,
            artifactSourceCommitSha: null,
            errors: [],
            warnings: [],
          },
          {
            filingId: "filing-a",
            orgNumber: "123",
            companyName: "Alpha AS",
            fiscalYear: 2024,
            status: "completed" as const,
            gateVerdict: "PASS" as const,
            passCount: 4,
            warnCount: 0,
            failCount: 0,
            insufficientDataCount: 0,
            blockingCheckCodes: [],
            warningCheckCodes: [],
            financialLineItemCount: 12,
            narrativeSectionCount: 5,
            comparisonMatchRate: 1,
            durationMs: null,
            generatedAt: "2026-05-18T10:00:00.000Z",
            artifactId: "artifact-new",
            artifactStatus: "CREATED" as const,
            artifactCreatedAt: "2026-05-18T10:00:00.000Z",
            artifactUpdatedAt: "2026-05-18T10:00:00.000Z",
            artifactSourceCommand: null,
            artifactSourceCommitSha: null,
            errors: [],
            warnings: [],
          },
        ],
        total: 2,
        limit: 1000,
        offset: 0,
        summary: {
          total: 2,
          PASS: 1,
          WARN: 0,
          FAIL: 1,
          INSUFFICIENT_DATA: 0,
        },
      }) as any),
    });

    expect(result).toHaveLength(0);
  });

  it("refreshes only deduplicated affected filings", async () => {
    const reprocessByCriteria = vi.fn(async () => ({
      matchedFilings: [
        {
          filingId: "filing-a",
          orgNumber: "123",
          fiscalYear: 2024,
          latestParserVersion: "annual-report-pipeline-v4-opendataloader",
          latestConfidenceScore: 0,
        },
      ],
      results: [{ filingId: "filing-a", fiscalYear: 2024, published: false }],
    }) as any);

    const result = await refreshAffectedAnnualReportFilingsFromAdmin({
      listReviews: vi.fn(async () => [
        {
          id: "review-1",
          filingId: "filing-a",
          fiscalYear: 2024,
          status: AnnualReportReviewStatus.PENDING_REVIEW,
          company: {
            orgNumber: "123",
            name: "Alpha AS",
            slug: "alpha-as",
          },
          filing: { status: "MANUAL_REVIEW" },
          extractionRun: null,
        },
      ] as never[]),
      listUnifiedConfidence: vi.fn(async () => ({
        items: [
          {
            filingId: "filing-a",
            orgNumber: "123",
            companyName: "Alpha AS",
            fiscalYear: 2024,
            status: "completed" as const,
            gateVerdict: "INSUFFICIENT_DATA" as const,
            passCount: 0,
            warnCount: 0,
            failCount: 0,
            insufficientDataCount: 2,
            blockingCheckCodes: [],
            warningCheckCodes: [],
            financialLineItemCount: 0,
            narrativeSectionCount: 0,
            comparisonMatchRate: 0,
            durationMs: null,
            generatedAt: "2026-05-18T10:00:00.000Z",
            artifactId: "artifact-1",
            artifactStatus: "CREATED" as const,
            artifactCreatedAt: "2026-05-18T10:00:00.000Z",
            artifactUpdatedAt: "2026-05-18T10:00:00.000Z",
            artifactSourceCommand: null,
            artifactSourceCommitSha: null,
            errors: [],
            warnings: [],
          },
        ],
        total: 1,
        limit: 1000,
        offset: 0,
        summary: {
          total: 1,
          PASS: 0,
          WARN: 0,
          FAIL: 0,
          INSUFFICIENT_DATA: 1,
        },
      }) as any),
      reprocessByCriteria,
    });

    expect(reprocessByCriteria).toHaveBeenCalledWith(
      expect.objectContaining({
        filingIds: ["filing-a"],
        limit: 1,
      }),
    );
    expect(result.affectedFilings).toHaveLength(1);
  });
});
