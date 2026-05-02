import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.mock factories are hoisted, so variables must be too)
// ---------------------------------------------------------------------------

const { prismaMock, repoMock } = vi.hoisted(() => {
  const dbReview = {
    id: "review-1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    companyId: "company-1",
    fiscalYear: 2023,
    status: "PENDING_REVIEW",
    reviewPayload: {
      selectedFacts: [
        { metricKey: "revenue", fiscalYear: 2023, value: 5000000, unitScale: 1000, sourcePage: 4 },
      ],
    },
  };

  const prismaMock = {
    _dbReview: dbReview,
    annualReportReview: {
      findUnique: vi.fn(async () => dbReview),
      update: vi.fn(async () => ({ ...dbReview, status: "ACCEPTED" })),
    },
    annualReportReviewDecision: {
      create: vi.fn(async (args: unknown) => ({ id: "decision-1", ...(args as Record<string, unknown>) })),
    },
    annualReportFiling: {
      update: vi.fn(async (args: unknown) => args),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };

  const repoMock = {
    createTrainingLabels: vi.fn(async () => ({ count: 0 })),
  };

  return { prismaMock, repoMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/persistence/annual-report-review-repository", () => ({
  listAdminReviewQueue: vi.fn(),
  getAdminReviewDetail: vi.fn(),
  createReviewDecision: vi.fn(),
  createTrainingLabel: vi.fn(),
  createTrainingLabels: (...args: unknown[]) => repoMock.createTrainingLabels(...args),
  setReviewStatus: vi.fn(),
  setFilingStatus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import service under test (after mocks are set up)
// ---------------------------------------------------------------------------

import {
  acceptAnnualReportReview,
  correctAnnualReportReview,
  rejectAnnualReportReview,
  reprocessAnnualReportReview,
  markAnnualReportReviewUnreadable,
} from "./annual-report-review-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  vi.clearAllMocks();
  prismaMock.annualReportReview.findUnique.mockResolvedValue(prismaMock._dbReview);
  prismaMock.annualReportReview.update.mockResolvedValue({ ...prismaMock._dbReview, status: "ACCEPTED" });
  prismaMock.annualReportReviewDecision.create.mockResolvedValue({ id: "decision-1" });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
  repoMock.createTrainingLabels.mockResolvedValue({ count: 0 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("acceptAnnualReportReview", () => {
  beforeEach(resetMocks);

  it("creates ACCEPTED decision", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1", "Ser bra ut");

    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewId: "review-1",
          reviewerUserId: "user-reviewer-1",
          decisionType: "ACCEPTED",
          correctionNotes: "Ser bra ut",
        }),
      }),
    );
  });

  it("updates review status to ACCEPTED", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.annualReportReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "review-1" },
        data: expect.objectContaining({ status: "ACCEPTED" }),
      }),
    );
  });

  it("creates training labels for facts", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(repoMock.createTrainingLabels).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          labelType: "FACT_VALUE",
          reviewerUserId: "user-reviewer-1",
          targetRef: expect.objectContaining({ metricKey: "revenue" }),
        }),
      ]),
    );
  });

  it("throws when review not found", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(null);

    await expect(
      acceptAnnualReportReview("nonexistent", "user-reviewer-1"),
    ).rejects.toThrow("Review nonexistent ikke funnet.");
  });
});

describe("correctAnnualReportReview", () => {
  beforeEach(resetMocks);

  it("creates CORRECTED decision with beforePayload and afterPayload", async () => {
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: 4500000 }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections, "Korrigert tall");

    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionType: "CORRECTED",
          correctionNotes: "Korrigert tall",
          afterPayload: corrections,
        }),
      }),
    );
  });

  it("creates FACT_VALUE training labels for corrected facts", async () => {
    const corrections = {
      facts: [{ metricKey: "net_income", fiscalYear: 2023, value: 200000 }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    expect(repoMock.createTrainingLabels).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          labelType: "FACT_VALUE",
          targetRef: expect.objectContaining({ metricKey: "net_income" }),
          acceptedValue: expect.objectContaining({ value: 200000 }),
        }),
      ]),
    );
  });

  it("creates AUDITOR_OPINION training label when auditorOpinion provided", async () => {
    const corrections = {
      auditorOpinion: { opinionType: "QUALIFIED" as const },
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    expect(repoMock.createTrainingLabels).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          labelType: "AUDITOR_OPINION",
          acceptedValue: expect.objectContaining({ opinionType: "QUALIFIED" }),
        }),
      ]),
    );
  });
});

describe("rejectAnnualReportReview", () => {
  beforeEach(resetMocks);

  it("creates REJECTED decision and updates status", async () => {
    await rejectAnnualReportReview("review-1", "user-reviewer-1", "Feil data");

    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionType: "REJECTED",
          correctionNotes: "Feil data",
          validationPassed: false,
        }),
      }),
    );

    expect(prismaMock.annualReportReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED" }),
      }),
    );
  });

  it("creates FAILURE_REASON training label", async () => {
    await rejectAnnualReportReview("review-1", "user-reviewer-1", "Mangler data");

    expect(repoMock.createTrainingLabels).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          labelType: "FAILURE_REASON",
          sourcePayload: expect.objectContaining({ decisionType: "REJECTED" }),
        }),
      ]),
    );
  });
});

describe("reprocessAnnualReportReview", () => {
  beforeEach(resetMocks);

  it("creates REPROCESS_REQUESTED decision", async () => {
    await reprocessAnnualReportReview("review-1", "user-reviewer-1", "Prøv igjen");

    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionType: "REPROCESS_REQUESTED",
          correctionNotes: "Prøv igjen",
        }),
      }),
    );
  });

  it("sets review status to REPROCESS_REQUESTED and filing to PREFLIGHTED", async () => {
    await reprocessAnnualReportReview("review-1", "user-reviewer-1", "Prøv igjen");

    expect(prismaMock.annualReportReview.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REPROCESS_REQUESTED" }),
      }),
    );
    expect(prismaMock.annualReportFiling.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PREFLIGHTED" }),
      }),
    );
  });
});

describe("markAnnualReportReviewUnreadable", () => {
  beforeEach(resetMocks);

  it("creates UNREADABLE decision", async () => {
    await markAnnualReportReviewUnreadable("review-1", "user-reviewer-1", "PDF er ødelagt");

    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionType: "UNREADABLE",
          correctionNotes: "PDF er ødelagt",
        }),
      }),
    );
  });

  it("sets filing status to FAILED", async () => {
    await markAnnualReportReviewUnreadable("review-1", "user-reviewer-1", "PDF er ødelagt");

    expect(prismaMock.annualReportFiling.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("creates FAILURE_REASON training label", async () => {
    await markAnnualReportReviewUnreadable("review-1", "user-reviewer-1", "Uleselig");

    expect(repoMock.createTrainingLabels).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          labelType: "FAILURE_REASON",
          sourcePayload: expect.objectContaining({ decisionType: "UNREADABLE" }),
        }),
      ]),
    );
  });
});
