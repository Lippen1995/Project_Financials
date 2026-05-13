import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/annual-report-review-service", () => ({
  listReviewQueue: vi.fn(async () => [
    {
      id: "review-1",
      status: "PENDING_REVIEW",
      fiscalYear: 2024,
      updatedAt: "2026-05-10T12:00:00.000Z",
      company: {
        name: "Eksempelselskap AS",
        orgNumber: "123456789",
        slug: "eksempelselskap-as",
      },
      filing: {
        fiscalYear: 2024,
        status: "MANUAL_REVIEW",
        parserVersionLastTried: "legacy",
      },
      extractionRun: {
        confidenceScore: 0.74,
        documentEngine: "legacy",
      },
      blockingRuleCodes: ["BS_TOTAL_BALANCES"],
    },
  ]),
}));

vi.mock("@/server/services/annual-report-manual-review-round-service", () => ({
  listAnnualReportManualReviewCandidates: vi.fn(async () => ({
    round: {
      reviewRoundId: "gold-set-2026-05-10",
      sourceRun: { runId: "gold-set-2026-05-10" },
      generatedAt: "2026-05-10T12:00:00.000Z",
      summary: {
        reviewCandidateCount: 1,
        pendingCount: 1,
        reviewedCount: 0,
        severityCounts: { HIGH: 1, MEDIUM: 0, LOW: 0 },
        issueClassCounts: { confidence_gate_fail: 1 },
      },
    },
    items: [
      {
        candidateId: "candidate-1",
        companyName: "Eksempelselskap AS",
        orgNumber: "123456789",
        accountingYear: 2024,
        status: "PENDING",
        severity: "HIGH",
        reviewReasons: ["Confidence gate vurderte rapporten som FAIL."],
        tags: ["manual_review_expected"],
        firstDivergenceStage: "confidence_gate",
        parserOrEvidence: "legacy",
        updatedAt: null,
        runId: "gold-set-2026-05-10",
      },
    ],
  })),
}));

describe("app/admin/annual-report-reviews/page", () => {
  it("renders gold-set review candidates and the existing review queue", async () => {
    const pageModule = await import("@/app/(app)/admin/annual-report-reviews/page");
    const element = await pageModule.default({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Review-kÃ¸ for Ã¥rsrapporter");
    expect(html).toContain("Gold-set manual review round");
    expect(html).toContain("Confidence gate vurderte rapporten som FAIL.");
    expect(html).toContain("Eksisterende produksjons-review-kÃ¸");
    expect(html).toContain("Eksempelselskap AS");
    expect(html).toContain("Venter");
  });

  it("renders an explicit empty state when no manual review candidates exist", async () => {
    const { listAnnualReportManualReviewCandidates } = await import(
      "@/server/services/annual-report-manual-review-round-service"
    );
    vi.mocked(listAnnualReportManualReviewCandidates).mockResolvedValueOnce({
      round: {
        reviewRoundId: "gold-set-2026-05-10",
        sourceRun: { runId: "gold-set-2026-05-10" },
        generatedAt: "2026-05-10T12:00:00.000Z",
        summary: {
          reviewCandidateCount: 0,
          pendingCount: 0,
          reviewedCount: 0,
          severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
          issueClassCounts: {},
        },
      },
      items: [],
    } as never);

    const pageModule = await import("@/app/(app)/admin/annual-report-reviews/page");
    const element = await pageModule.default({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No manual review candidates found for the selected run.");
  });
});

