import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks (vi.mock factories are hoisted, so variables must be too)
// ---------------------------------------------------------------------------

const { prismaMock } = vi.hoisted(() => {
  const dbReview = {
    id: "review-1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    companyId: "company-1",
    fiscalYear: 2023,
    status: "PENDING_REVIEW",
    blockingRuleCodes: ["REV_001"],
    qualityScore: 0.85,
    reviewPayload: {
      selectedFacts: [
        { metricKey: "revenue", fiscalYear: 2023, value: "5000000000", unitScale: 1000, sourcePage: 4 },
      ],
    },
    extractionRun: {
      documentEngine: "docling",
      parserVersion: "v1.2.3",
      validationScore: 0.9,
      confidenceScore: 0.88,
    },
  };

  const labelsMock = vi.fn(async () => ({ count: 0 }));

  const prismaMock = {
    _dbReview: dbReview,
    annualReportReview: {
      findUnique: vi.fn(async () => dbReview as typeof dbReview | null),
      update: vi.fn(async () => ({ ...dbReview, status: "ACCEPTED" })),
    },
    annualReportReviewDecision: {
      create: vi.fn(async (args: unknown) => ({ id: "decision-1", ...(args as Record<string, unknown>) })),
    },
    annualReportFiling: {
      update: vi.fn(async (args: unknown) => args),
    },
    pdfTrainingLabel: {
      createMany: labelsMock,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
  };

  return { prismaMock };
});

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/server/persistence/annual-report-review-repository", () => ({
  listAdminReviewQueue: vi.fn(),
  getAdminReviewDetail: vi.fn(),
  createReviewDecision: vi.fn(),
  createTrainingLabel: vi.fn(),
  createTrainingLabels: vi.fn(),
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
  ReviewConflictError,
} from "./annual-report-review-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  vi.clearAllMocks();
  prismaMock.annualReportReview.findUnique.mockResolvedValue(prismaMock._dbReview);
  prismaMock.annualReportReview.update.mockResolvedValue({ ...prismaMock._dbReview, status: "ACCEPTED" });
  prismaMock.annualReportReviewDecision.create.mockResolvedValue({ id: "decision-1" });
  prismaMock.pdfTrainingLabel.createMany.mockResolvedValue({ count: 0 });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
}

function makeResolvedReview(status: string) {
  return { ...prismaMock._dbReview, status };
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

  it("creates training labels for facts inside transaction", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            labelType: "FACT_VALUE",
            reviewerUserId: "user-reviewer-1",
            targetRef: expect.objectContaining({ metricKey: "revenue" }),
          }),
        ]),
      }),
    );
  });

  it("preserves BigInt string value without floating-point loss", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            acceptedValue: expect.objectContaining({ value: "5000000000" }),
          }),
        ]),
      }),
    );
  });

  it("enriches sourcePayload with extractionRun metadata", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            sourcePayload: expect.objectContaining({
              documentEngine: "docling",
              parserVersion: "v1.2.3",
              blockingRuleCodes: ["REV_001"],
            }),
          }),
        ]),
      }),
    );
  });

  it("throws when review not found", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(null);

    await expect(
      acceptAnnualReportReview("nonexistent", "user-reviewer-1"),
    ).rejects.toThrow("Review nonexistent ikke funnet.");
  });

  it("throws ReviewConflictError when review already resolved", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(makeResolvedReview("ACCEPTED"));

    await expect(
      acceptAnnualReportReview("review-1", "user-reviewer-1"),
    ).rejects.toBeInstanceOf(ReviewConflictError);
  });
});

describe("correctAnnualReportReview", () => {
  beforeEach(resetMocks);

  it("creates CORRECTED decision with beforePayload and afterPayload", async () => {
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: "4500000" }],
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
      facts: [{ metricKey: "net_income", fiscalYear: 2023, value: "200000" }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            labelType: "FACT_VALUE",
            targetRef: expect.objectContaining({ metricKey: "net_income" }),
            acceptedValue: expect.objectContaining({ value: "200000" }),
          }),
        ]),
      }),
    );
  });

  it("creates AUDITOR_OPINION training label when auditorOpinion provided", async () => {
    const corrections = {
      auditorOpinion: { opinionType: "QUALIFIED" as const },
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            labelType: "AUDITOR_OPINION",
            acceptedValue: expect.objectContaining({ opinionType: "QUALIFIED" }),
          }),
        ]),
      }),
    );
  });

  it("creates BOARD_REPORT_TEXT label for board report section", async () => {
    const corrections = {
      sections: [{ sectionType: "BOARD_REPORT", text: "Styret vurderer utsiktene som gode." }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            labelType: "BOARD_REPORT_TEXT",
            acceptedValue: expect.objectContaining({ sectionType: "BOARD_REPORT" }),
          }),
        ]),
      }),
    );
  });

  it("creates AUDITOR_REPORT_TEXT label for auditor report section", async () => {
    const corrections = {
      sections: [{ sectionType: "AUDITOR_REPORT", text: "Etter vår oppfatning gir årsregnskapet..." }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            labelType: "AUDITOR_REPORT_TEXT",
            acceptedValue: expect.objectContaining({ sectionType: "AUDITOR_REPORT" }),
          }),
        ]),
      }),
    );
  });

  it("throws ReviewConflictError when review already resolved", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(makeResolvedReview("REJECTED"));

    await expect(
      correctAnnualReportReview("review-1", "user-reviewer-1", {}),
    ).rejects.toBeInstanceOf(ReviewConflictError);
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

  it("creates FAILURE_REASON training label inside transaction", async () => {
    await rejectAnnualReportReview("review-1", "user-reviewer-1", "Mangler data");

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            labelType: "FAILURE_REASON",
            sourcePayload: expect.objectContaining({ decisionType: "REJECTED" }),
          }),
        ]),
      }),
    );
  });

  it("throws ReviewConflictError when review already resolved", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(makeResolvedReview("ACCEPTED"));

    await expect(
      rejectAnnualReportReview("review-1", "user-reviewer-1", "Grunn"),
    ).rejects.toBeInstanceOf(ReviewConflictError);
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

  it("throws ReviewConflictError when review already resolved", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(makeResolvedReview("ACCEPTED"));

    await expect(
      reprocessAnnualReportReview("review-1", "user-reviewer-1", "Grunn"),
    ).rejects.toBeInstanceOf(ReviewConflictError);
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

  it("creates FAILURE_REASON training label inside transaction", async () => {
    await markAnnualReportReviewUnreadable("review-1", "user-reviewer-1", "Uleselig");

    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            labelType: "FAILURE_REASON",
            sourcePayload: expect.objectContaining({ decisionType: "UNREADABLE" }),
          }),
        ]),
      }),
    );
  });

  it("throws ReviewConflictError when review already resolved", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(makeResolvedReview("REJECTED"));

    await expect(
      markAnnualReportReviewUnreadable("review-1", "user-reviewer-1", "Grunn"),
    ).rejects.toBeInstanceOf(ReviewConflictError);
  });
});

describe("atomicity", () => {
  beforeEach(resetMocks);

  it("all writes happen inside a single $transaction call", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    // The transaction mock was called once
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // And all sub-writes were called on the same tx (prismaMock in mock setup)
    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.annualReportReview.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledTimes(1);
  });

  it("labels are not written if transaction throws", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("DB error"));

    await expect(
      acceptAnnualReportReview("review-1", "user-reviewer-1"),
    ).rejects.toThrow("DB error");

    // createMany should never have been called outside of the transaction
    expect(prismaMock.pdfTrainingLabel.createMany).not.toHaveBeenCalled();
  });
});
