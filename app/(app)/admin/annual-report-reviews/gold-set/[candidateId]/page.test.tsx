import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/annual-report-manual-review-round-service", () => ({
  getAnnualReportManualReviewCandidate: vi.fn(async () => ({
    round: {
      reviewRoundId: "gold-set-2026-05-10",
    },
    candidate: {
      candidateId: "candidate-1",
      companyName: "Eksempelselskap AS",
      orgNumber: "123456789",
      accountingYear: 2024,
      filingId: "filing-1",
      status: "PENDING",
      severity: "HIGH",
      confidenceGateResult: "FAIL",
      firstDivergenceStage: "confidence_gate",
      tags: ["manual_review_expected"],
      evidenceType: "persisted_artifact",
      evidenceQuality: "real_legacy_candidate",
      reviewReasons: ["Confidence gate vurderte rapporten som FAIL."],
      issueClasses: ["confidence_gate_fail", "unit_scale_ambiguity"],
      artifactRefs: [
        {
          key: "source_pdf",
          label: "Source PDF",
          status: "available",
          artifactId: "artifact-pdf",
          storageKey: "source.pdf",
          artifactType: "PDF",
          kind: null,
          href: "https://example.test/report.pdf",
          note: null,
        },
      ],
      financialComparisons: [
        {
          canonicalKey: "revenue",
          fiscalYear: 2024,
          legacyLabel: "Sum driftsinntekter",
          unifiedLabel: "Sum driftsinntekter",
          legacyValueNok: "1000000",
          unifiedValueNok: "800000",
          deltaNok: "-200000",
          relativeDeviation: 0.2,
          match: "CONFLICTING_VALUES",
          legacyUnitScale: 1,
          unifiedUnitScale: "ONES",
          reviewRequired: true,
        },
      ],
      comparisonResult: {
        mismatchCount: 1,
        narrativeMismatchCount: 1,
        exactMatchCount: 4,
        matchRate: 0.6,
      },
      narrativeComparisons: [
        {
          kind: "AUDITOR_REPORT",
          legacyFound: true,
          unifiedFound: false,
          unifiedSectionKind: null,
          textSimilarity: 0.4,
        },
      ],
      confidenceGateDiagnostics: [
        {
          checkCode: "UNIT_SCALE_RESOLVED",
          verdict: "FAIL",
          message: "Unknown unit scale.",
        },
      ],
      parserOrEvidence: "legacy",
      updatedAt: null,
      latestDecision: null,
    },
  })),
}));

vi.mock("@/app/(app)/admin/annual-report-reviews/gold-set/[candidateId]/actions", () => ({
  saveGoldSetManualReviewDecisionAction: async () => undefined,
}));

describe("app/admin/annual-report-reviews/gold-set/[candidateId]/page", () => {
  it("renders comparison data and reviewer form", async () => {
    const pageModule = await import(
      "@/app/(app)/admin/annual-report-reviews/gold-set/[candidateId]/page"
    );
    const element = await pageModule.default({
      params: Promise.resolve({ candidateId: "candidate-1" }),
      searchParams: Promise.resolve({ runId: "gold-set-2026-05-10" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Financial comparison table");
    expect(html).toContain("Narrative comparison table");
    expect(html).toContain("Reviewer decision");
    expect(html).toContain("Sum driftsinntekter");
    expect(html).toContain("LEGACY_CORRECT");
  });
});

