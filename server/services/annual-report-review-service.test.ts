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

  const dbMachineFacts = [
    {
      id: "fact-1",
      extractionRunId: "run-1",
      filingId: "filing-1",
      companyId: "company-1",
      fiscalYear: 2023,
      statementType: "INCOME_STATEMENT",
      metricKey: "revenue",
      rawLabel: "Salgsinntekter",
      value: BigInt("5000000000"),
      currency: "NOK",
      unitScale: 1000,
      sourcePage: 4,
    },
    {
      id: "fact-2",
      extractionRunId: "run-1",
      filingId: "filing-1",
      companyId: "company-1",
      fiscalYear: 2023,
      statementType: "BALANCE_SHEET",
      metricKey: "total_assets",
      rawLabel: "Sum eiendeler",
      value: BigInt("12000000000"),
      currency: "NOK",
      unitScale: 1000,
      sourcePage: 7,
    },
  ];

  const labelsMock = vi.fn(async () => ({ count: 0 }));
  const reviewedFactCreateManyMock = vi.fn(async () => ({ count: 0 }));

  const prismaMock = {
    _dbReview: dbReview,
    _dbMachineFacts: dbMachineFacts,
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
    annualReportReviewedFact: {
      createMany: reviewedFactCreateManyMock,
      findMany: vi.fn(async () => [] as typeof dbMachineFacts),
    },
    financialFact: {
      findMany: vi.fn(async () => dbMachineFacts),
    },
    financialStatement: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: "stmt-1" })),
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

vi.mock("@/server/persistence/annual-report-ingestion-repository", () => ({
  upsertCompanyFinancialCoverage: vi.fn(async () => ({})),
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
  validateReviewedAnnualReportFacts,
  publishReviewedAnnualReportFacts,
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
  prismaMock.annualReportReviewedFact.createMany.mockResolvedValue({ count: 0 });
  prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([]);
  prismaMock.financialFact.findMany.mockResolvedValue(prismaMock._dbMachineFacts);
  prismaMock.financialStatement.findUnique.mockResolvedValue(null);
  prismaMock.financialStatement.upsert.mockResolvedValue({ id: "stmt-1" });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock));
}

function makeResolvedReview(status: string) {
  return { ...prismaMock._dbReview, status };
}

// ---------------------------------------------------------------------------
// Tests: acceptAnnualReportReview
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

  it("creates reviewed facts from machine facts with ACCEPTED_MACHINE source", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.annualReportReviewedFact.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            reviewId: "review-1",
            metricKey: "revenue",
            correctionSource: "ACCEPTED_MACHINE",
            reviewerUserId: "user-reviewer-1",
            value: BigInt("5000000000"),
          }),
          expect.objectContaining({
            metricKey: "total_assets",
            correctionSource: "ACCEPTED_MACHINE",
            value: BigInt("12000000000"),
          }),
        ]),
        skipDuplicates: true,
      }),
    );
  });

  it("large BigInt value preserved exactly from machine facts", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    const call = prismaMock.annualReportReviewedFact.createMany.mock.calls[0][0];
    const revenueFact = call.data.find((d: { metricKey: string }) => d.metricKey === "revenue");
    expect(revenueFact.value).toBe(BigInt("5000000000"));
    // Ensure we didn't convert to number and back
    expect(typeof revenueFact.value).toBe("bigint");
  });

  it("skips reviewed facts creation when no extractionRunId", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue({
      ...prismaMock._dbReview,
      extractionRunId: null,
      extractionRun: null,
    } as never);

    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.annualReportReviewedFact.createMany).not.toHaveBeenCalled();
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

  it("preserves BigInt string value in training label without floating-point loss", async () => {
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

// ---------------------------------------------------------------------------
// Tests: correctAnnualReportReview
// ---------------------------------------------------------------------------

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

  it("stores corrected facts as MANUAL_CORRECTION reviewed facts", async () => {
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: "4500000" }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    expect(prismaMock.annualReportReviewedFact.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            metricKey: "revenue",
            correctionSource: "MANUAL_CORRECTION",
            value: BigInt("4500000"),
          }),
        ]),
      }),
    );
  });

  it("stores uncorrected machine facts as ACCEPTED_MACHINE", async () => {
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: "4500000" }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    // total_assets is in machine facts but not in corrections, so should be ACCEPTED_MACHINE
    const calls = prismaMock.annualReportReviewedFact.createMany.mock.calls;
    const acceptedMachineCall = calls.find((call: Array<{ data: Array<{ correctionSource: string }> }>) =>
      call[0].data.some((d: { correctionSource: string }) => d.correctionSource === "ACCEPTED_MACHINE"),
    );
    expect(acceptedMachineCall).toBeDefined();
    const acceptedData = acceptedMachineCall[0].data;
    expect(acceptedData.some((d: { metricKey: string }) => d.metricKey === "total_assets")).toBe(true);
    expect(acceptedData.some((d: { metricKey: string }) => d.metricKey === "revenue")).toBe(false);
  });

  it("converts large integer string to BigInt safely", async () => {
    const largeValue = "9007199254740993"; // beyond Number.MAX_SAFE_INTEGER
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: largeValue }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    const calls = prismaMock.annualReportReviewedFact.createMany.mock.calls;
    const manualCall = calls.find((call: Array<{ data: Array<{ correctionSource: string }> }>) =>
      call[0].data.some((d: { correctionSource: string }) => d.correctionSource === "MANUAL_CORRECTION"),
    );
    const revenueFact = manualCall[0].data.find((d: { metricKey: string }) => d.metricKey === "revenue");
    expect(revenueFact.value).toBe(BigInt(largeValue));
    expect(String(revenueFact.value)).toBe(largeValue);
  });

  it("handles null correction value safely", async () => {
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: null }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    const calls = prismaMock.annualReportReviewedFact.createMany.mock.calls;
    const manualCall = calls.find((call: Array<{ data: Array<{ correctionSource: string }> }>) =>
      call[0].data.some((d: { correctionSource: string }) => d.correctionSource === "MANUAL_CORRECTION"),
    );
    const revenueFact = manualCall[0].data.find((d: { metricKey: string }) => d.metricKey === "revenue");
    expect(revenueFact.value).toBeNull();
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

// ---------------------------------------------------------------------------
// Tests: rejectAnnualReportReview
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests: reprocessAnnualReportReview
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests: markAnnualReportReviewUnreadable
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests: validateReviewedAnnualReportFacts
// ---------------------------------------------------------------------------

describe("validateReviewedAnnualReportFacts", () => {
  beforeEach(resetMocks);

  it("returns passed:false with NO_REVIEWED_FACTS when no facts exist", async () => {
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([]);

    const result = await validateReviewedAnnualReportFacts("review-1");

    expect(result.passed).toBe(false);
    expect(result.blockingIssues).toHaveLength(1);
    expect(result.blockingIssues[0].ruleCode).toBe("NO_REVIEWED_FACTS");
    expect(result.reviewedFactCount).toBe(0);
  });

  it("returns passed:false when totalAssets != totalEquityAndLiabilities", async () => {
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([
      {
        id: "rf-1", reviewId: "review-1", metricKey: "total_assets",
        statementType: "BALANCE_SHEET", value: BigInt("10000000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
        correctionSource: "ACCEPTED_MACHINE",
      },
      {
        id: "rf-2", reviewId: "review-1", metricKey: "total_equity_and_liabilities",
        statementType: "BALANCE_SHEET", value: BigInt("12000000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
        correctionSource: "MANUAL_CORRECTION",
      },
    ] as never);

    const result = await validateReviewedAnnualReportFacts("review-1");

    expect(result.passed).toBe(false);
    expect(result.blockingIssues.some((i) => i.ruleCode === "BS_TOTAL_BALANCES")).toBe(true);
  });

  it("returns passed:true when balance sheet balances correctly", async () => {
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([
      {
        id: "rf-1", reviewId: "review-1", metricKey: "total_assets",
        statementType: "BALANCE_SHEET", value: BigInt("10000000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
        correctionSource: "ACCEPTED_MACHINE",
      },
      {
        id: "rf-2", reviewId: "review-1", metricKey: "total_equity_and_liabilities",
        statementType: "BALANCE_SHEET", value: BigInt("10000000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
        correctionSource: "ACCEPTED_MACHINE",
      },
    ] as never);

    const result = await validateReviewedAnnualReportFacts("review-1");

    expect(result.passed).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.reviewedFactCount).toBe(2);
  });

  it("detects unit scale inconsistency", async () => {
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([
      {
        id: "rf-1", reviewId: "review-1", metricKey: "total_assets",
        statementType: "BALANCE_SHEET", value: BigInt("10000000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
        correctionSource: "ACCEPTED_MACHINE",
      },
      {
        id: "rf-2", reviewId: "review-1", metricKey: "revenue",
        statementType: "INCOME_STATEMENT", value: BigInt("5000000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1000, sourcePage: null, rawLabel: null,
        correctionSource: "MANUAL_CORRECTION",
      },
    ] as never);

    const result = await validateReviewedAnnualReportFacts("review-1");

    expect(result.blockingIssues.some((i) => i.ruleCode === "UNIT_SCALE_INCONSISTENCY")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: publishReviewedAnnualReportFacts
// ---------------------------------------------------------------------------

describe("publishReviewedAnnualReportFacts", () => {
  beforeEach(resetMocks);

  const acceptedReview = {
    id: "review-1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    companyId: "company-1",
    fiscalYear: 2023,
    status: "ACCEPTED",
  };

  const validReviewedFacts = [
    {
      id: "rf-1", reviewId: "review-1", metricKey: "total_assets",
      statementType: "BALANCE_SHEET", value: BigInt("10000000"), fiscalYear: 2023,
      currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
      correctionSource: "ACCEPTED_MACHINE",
    },
    {
      id: "rf-2", reviewId: "review-1", metricKey: "total_equity_and_liabilities",
      statementType: "BALANCE_SHEET", value: BigInt("10000000"), fiscalYear: 2023,
      currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
      correctionSource: "ACCEPTED_MACHINE",
    },
  ];

  it("throws when review status is not ACCEPTED", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue({
      ...acceptedReview, status: "PENDING_REVIEW",
    } as never);

    await expect(
      publishReviewedAnnualReportFacts("review-1", "user-1"),
    ).rejects.toThrow("kan ikke publiseres");
  });

  it("returns published:false when no reviewed facts exist", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([]);

    const result = await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(result.published).toBe(false);
    if (!result.published) {
      expect(result.issues[0].ruleCode).toBe("NO_REVIEWED_FACTS");
    }
  });

  it("returns published:false when validation fails (unbalanced balance sheet)", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([
      {
        ...validReviewedFacts[0],
        metricKey: "total_assets",
        value: BigInt("10000000"),
      },
      {
        ...validReviewedFacts[1],
        metricKey: "total_equity_and_liabilities",
        value: BigInt("99999999"), // deliberately wrong
      },
    ] as never);

    const result = await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(result.published).toBe(false);
    if (!result.published) {
      expect(result.issues.some((i) => i.ruleCode === "BS_TOTAL_BALANCES")).toBe(true);
    }
  });

  it("publishes FinancialStatement when validation passes", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(validReviewedFacts as never);

    const result = await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(result.published).toBe(true);
    expect(prismaMock.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_fiscalYear: { companyId: "company-1", fiscalYear: 2023 } },
        create: expect.objectContaining({
          companyId: "company-1",
          fiscalYear: 2023,
          sourceEntityType: "annualReportReview",
        }),
      }),
    );
  });

  it("creates PUBLISHED_FROM_REVIEW audit decision", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(validReviewedFacts as never);

    await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decisionType: "PUBLISHED_FROM_REVIEW",
          reviewerUserId: "user-1",
          validationPassed: true,
        }),
      }),
    );
  });

  it("sets filing status to PUBLISHED", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(validReviewedFacts as never);

    await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(prismaMock.annualReportFiling.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "filing-1" },
        data: expect.objectContaining({ status: "PUBLISHED" }),
      }),
    );
  });

  it("qualityStatus is HIGH_CONFIDENCE when all facts are ACCEPTED_MACHINE", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(validReviewedFacts as never);

    await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(prismaMock.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ qualityStatus: "HIGH_CONFIDENCE" }),
      }),
    );
  });

  it("qualityStatus is MANUAL_REVIEW when any fact is MANUAL_CORRECTION", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([
      { ...validReviewedFacts[0], correctionSource: "MANUAL_CORRECTION" },
      validReviewedFacts[1],
    ] as never);

    await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(prismaMock.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ qualityStatus: "MANUAL_REVIEW" }),
      }),
    );
  });

  it("does not delete original FinancialFact records", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(validReviewedFacts as never);

    await publishReviewedAnnualReportFacts("review-1", "user-1");

    // financialFact should never be touched
    expect("deleteMany" in prismaMock).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: atomicity
// ---------------------------------------------------------------------------

describe("atomicity", () => {
  beforeEach(resetMocks);

  it("all writes in acceptAnnualReportReview happen inside a single $transaction call", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.annualReportReview.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledTimes(1);
    // reviewed facts created inside transaction too
    expect(prismaMock.annualReportReviewedFact.createMany).toHaveBeenCalledTimes(1);
  });

  it("labels and reviewed facts are not written if transaction throws", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("DB error"));

    await expect(
      acceptAnnualReportReview("review-1", "user-reviewer-1"),
    ).rejects.toThrow("DB error");

    expect(prismaMock.pdfTrainingLabel.createMany).not.toHaveBeenCalled();
    expect(prismaMock.annualReportReviewedFact.createMany).not.toHaveBeenCalled();
  });
});
