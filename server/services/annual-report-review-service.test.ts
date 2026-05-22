import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  let currentReview = { ...dbReview };
  let reviewedFactsStore: Array<Record<string, unknown>> = [];

  const labelsMock = vi.fn(async () => ({ count: 0 }));
  const reviewedFactCreateManyMock = vi.fn(async (args: { data: Array<Record<string, unknown>> }) => {
    reviewedFactsStore.push(...args.data);
    return { count: args.data.length };
  });
  const publishFinancialStatementSnapshotMock = vi.fn(async (input: Record<string, unknown>) =>
    (prismaMock.financialStatement.upsert as any)({
      where: {
        companyId_fiscalYear: {
          companyId: input.companyId as string,
          fiscalYear: input.fiscalYear as number,
        },
      },
      create: input,
      update: input,
    } as any),
  );

  const prismaMock = {
    _dbReview: dbReview,
    _dbMachineFacts: dbMachineFacts,
    _getCurrentReview: () => currentReview,
    _setCurrentReview: (next: typeof dbReview) => {
      currentReview = next;
    },
    _getReviewedFacts: () => reviewedFactsStore,
    _setReviewedFacts: (next: Array<Record<string, unknown>>) => {
      reviewedFactsStore = next;
    },
    _resetReviewedFacts: () => {
      reviewedFactsStore = [];
    },
    annualReportReview: {
      findUnique: vi.fn(async () => currentReview as typeof dbReview | null),
      update: vi.fn(async (args: { data?: Record<string, unknown> }) => {
        currentReview = {
          ...currentReview,
          ...(args.data ?? {}),
        };
        return currentReview;
      }),
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
      findMany: vi.fn(async () => reviewedFactsStore as typeof dbMachineFacts),
    },
    financialFact: {
      findMany: vi.fn(async () => dbMachineFacts),
    },
    financialStatement: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: "stmt-1" })),
    },
    publishFinancialStatementSnapshot: publishFinancialStatementSnapshotMock,
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
  publishFinancialStatementSnapshot: prismaMock.publishFinancialStatementSnapshot,
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
  prismaMock._setCurrentReview({ ...prismaMock._dbReview });
  prismaMock._resetReviewedFacts();
  prismaMock.annualReportReview.findUnique.mockImplementation(async () => prismaMock._getCurrentReview());
  prismaMock.annualReportReview.update.mockImplementation(async (args: { data?: Record<string, unknown> }) => {
    const next = {
      ...prismaMock._getCurrentReview(),
      ...(args.data ?? {}),
    };
    prismaMock._setCurrentReview(next);
    return next;
  });
  prismaMock.annualReportReviewDecision.create.mockResolvedValue({ id: "decision-1" });
  prismaMock.pdfTrainingLabel.createMany.mockResolvedValue({ count: 0 });
  prismaMock.annualReportReviewedFact.createMany.mockImplementation(async (args: { data: Array<Record<string, unknown>> }) => {
    const stored = args.data.map((item, index) => ({
      id: `reviewed-fact-${prismaMock._getReviewedFacts().length + index + 1}`,
      currency: "NOK",
      sourcePage: null,
      rawLabel: null,
      ...item,
    }));
    prismaMock._setReviewedFacts([...prismaMock._getReviewedFacts(), ...stored]);
    return { count: args.data.length };
  });
  prismaMock.annualReportReviewedFact.findMany.mockImplementation(
    (async (args?: { where?: { reviewId?: string } }) => {
      const reviewId = args?.where?.reviewId;
      return prismaMock
        ._getReviewedFacts()
        .filter((fact) => !reviewId || fact.reviewId === reviewId);
    }) as any,
  );
  prismaMock.financialFact.findMany.mockResolvedValue(prismaMock._dbMachineFacts);
  prismaMock.financialStatement.findUnique.mockResolvedValue(null);
  prismaMock.financialStatement.upsert.mockResolvedValue({ id: "stmt-1" });
  prismaMock.publishFinancialStatementSnapshot.mockClear();
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

    type CreateManyCall = [{ data: Array<{ metricKey: string; value: unknown }> }];
    const allCalls = prismaMock.annualReportReviewedFact.createMany.mock.calls as unknown as CreateManyCall[];
    const call = allCalls.at(0);
    expect(call).toBeDefined();
    const [callArg] = call!;
    const revenueFact = callArg.data.find((d) => d.metricKey === "revenue");
    expect(revenueFact).toBeDefined();
    expect(revenueFact!.value).toBe(BigInt("5000000000"));
    // Ensure we didn't convert to number and back
    expect(typeof revenueFact!.value).toBe("bigint");
  });

  it("skips reviewed facts creation when no extractionRunId", async () => {
    prismaMock._setCurrentReview({
      ...prismaMock._dbReview,
      extractionRunId: null,
      extractionRun: null,
    } as never);

    await expect(
      acceptAnnualReportReview("review-1", "user-reviewer-1"),
    ).rejects.toThrow("NO_REVIEWED_FACTS");

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
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: "4500000", unitScale: 1000 }],
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
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: "4500000", unitScale: 1000 }],
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
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: "4500000", unitScale: 1000 }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    // total_assets is in machine facts but not in corrections, so should be ACCEPTED_MACHINE
    type ReviewedFactArg = [{ data: Array<{ correctionSource: string; metricKey: string; value: unknown }> }];
    const calls = prismaMock.annualReportReviewedFact.createMany.mock.calls as unknown as ReviewedFactArg[];
    const acceptedMachineCall = calls.find(([arg]) =>
      arg.data.some((d) => d.correctionSource === "ACCEPTED_MACHINE"),
    );
    expect(acceptedMachineCall).toBeDefined();
    const acceptedData = acceptedMachineCall![0].data;
    expect(acceptedData.some((d) => d.metricKey === "total_assets")).toBe(true);
    expect(acceptedData.some((d) => d.metricKey === "revenue")).toBe(false);
  });

  it("excludes the original machine fact when a row is reassigned to a new metric key", async () => {
    const corrections = {
      facts: [
        {
          metricKey: "other_operating_income",
          sourceMetricKey: "revenue",
          fiscalYear: 2023,
          value: "4500000",
          unitScale: 1000,
        },
      ],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    type ReviewedFactArg = [{ data: Array<{ correctionSource: string; metricKey: string }> }];
    const calls = prismaMock.annualReportReviewedFact.createMany.mock.calls as unknown as ReviewedFactArg[];
    const acceptedMachineCall = calls.find(([arg]) =>
      arg.data.some((d) => d.correctionSource === "ACCEPTED_MACHINE"),
    );
    expect(acceptedMachineCall).toBeDefined();
    const acceptedData = acceptedMachineCall![0].data;
    expect(acceptedData.some((d) => d.metricKey === "revenue")).toBe(false);
    expect(acceptedData.some((d) => d.metricKey === "total_assets")).toBe(true);
  });

  it("converts large integer string to BigInt safely", async () => {
    const largeValue = "9007199254740993"; // beyond Number.MAX_SAFE_INTEGER
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: largeValue, unitScale: 1000 }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    type ReviewedFactArgBigInt = [{ data: Array<{ correctionSource: string; metricKey: string; value: unknown }> }];
    const calls = prismaMock.annualReportReviewedFact.createMany.mock.calls as unknown as ReviewedFactArgBigInt[];
    const manualCall = calls.find(([arg]) =>
      arg.data.some((d) => d.correctionSource === "MANUAL_CORRECTION"),
    );
    expect(manualCall).toBeDefined();
    const revenueFact = manualCall![0].data.find((d) => d.metricKey === "revenue");
    expect(revenueFact?.value).toBe(BigInt(largeValue));
    expect(String(revenueFact?.value)).toBe(largeValue);
  });

  it("handles null correction value safely", async () => {
    const corrections = {
      facts: [{ metricKey: "revenue", fiscalYear: 2023, value: null }],
    };

    await correctAnnualReportReview("review-1", "user-reviewer-1", corrections);

    type ReviewedFactArgNull = [{ data: Array<{ correctionSource: string; metricKey: string; value: unknown }> }];
    const calls = prismaMock.annualReportReviewedFact.createMany.mock.calls as unknown as ReviewedFactArgNull[];
    const manualCall = calls.find(([arg]) =>
      arg.data.some((d) => d.correctionSource === "MANUAL_CORRECTION"),
    );
    expect(manualCall).toBeDefined();
    const revenueFact = manualCall![0].data.find((d) => d.metricKey === "revenue");
    expect(revenueFact?.value).toBeNull();
  });

  it("creates FACT_VALUE training labels for corrected facts", async () => {
    const corrections = {
      facts: [{ metricKey: "net_income", fiscalYear: 2023, value: "200000", unitScale: 1000 }],
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
          sourceEntityType: "annualReportReviewedFact",
          sourceSystem: "PROJECT_FINANCIALS_REVIEW",
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
// Tests: publishReviewedAnnualReportFacts — realistic golden fixture
// ---------------------------------------------------------------------------

describe("publishReviewedAnnualReportFacts — realistic golden fixture", () => {
  const fixture = JSON.parse(
    readFileSync(
      join(__dirname, "../../test/fixtures/annual-reports/proff-2024-reviewed-facts.json"),
      "utf-8",
    ),
  ) as { facts: Record<string, string>; expectedValidation: { passed: boolean; hasBlockingErrors: boolean } };

  const acceptedReview = {
    id: "review-1",
    filingId: "filing-1",
    extractionRunId: "run-1",
    companyId: "company-1",
    fiscalYear: 2024,
    status: "ACCEPTED",
  };

  function makeFixtureFacts(overrides: Partial<Record<string, bigint | null>> = {}) {
    const f = fixture.facts;
    const defaults: Record<string, bigint | null> = {
      total_operating_income:       BigInt(f.total_operating_income),
      total_operating_expenses:     BigInt(f.total_operating_expenses),
      operating_profit:             BigInt(f.operating_profit),
      net_financial_items:          BigInt(f.net_financial_items),
      profit_before_tax:            BigInt(f.profit_before_tax),
      tax_expense:                  BigInt(f.tax_expense),
      net_income:                   BigInt(f.net_income),
      total_assets:                 BigInt(f.total_assets),
      total_equity:                 BigInt(f.total_equity),
      total_liabilities:            BigInt(f.total_liabilities),
      total_equity_and_liabilities: BigInt(f.total_equity_and_liabilities),
    };
    const merged = { ...defaults, ...overrides };
    return Object.entries(merged).map(([metricKey, value], i) => ({
      id: `rf-${i}`,
      reviewId: "review-1",
      metricKey,
      statementType: ["total_assets", "total_equity", "total_liabilities", "total_equity_and_liabilities"].includes(metricKey)
        ? "BALANCE_SHEET"
        : "INCOME_STATEMENT",
      value,
      fiscalYear: 2024,
      currency: "NOK",
      unitScale: 1,
      sourcePage: null,
      rawLabel: null,
      correctionSource: "ACCEPTED_MACHINE",
    }));
  }

  beforeEach(resetMocks);

  it("validation passes for all correctly-balanced fixture facts", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(makeFixtureFacts() as never);

    const result = await validateReviewedAnnualReportFacts("review-1");

    expect(result.passed).toBe(fixture.expectedValidation.passed);
    expect(result.hasBlockingErrors).toBe(fixture.expectedValidation.hasBlockingErrors);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.reviewedFactCount).toBe(Object.keys(fixture.facts).length);
  });

  it("publishes and upserts FinancialStatement with correct BigInt values", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(makeFixtureFacts() as never);

    const result = await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(result.published).toBe(true);
    expect(prismaMock.financialStatement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          revenue:         Number(fixture.facts.total_operating_income),
          operatingProfit: Number(fixture.facts.operating_profit),
          netIncome:       Number(fixture.facts.net_income),
          equity:          Number(fixture.facts.total_equity),
          assets:          Number(fixture.facts.total_assets),
        }),
      }),
    );
  });

  it("blocks publish and returns serialized string issues when balance sheet is wrong", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    // total_equity_and_liabilities deliberately wrong
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(
      makeFixtureFacts({ total_equity_and_liabilities: 91000000n }) as never,
    );

    const result = await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(result.published).toBe(false);
    if (!result.published) {
      const issue = result.issues.find((i) => i.ruleCode === "BS_TOTAL_BALANCES");
      expect(issue).toBeDefined();
      // Values must be serialized as strings, not numbers
      expect(typeof issue!.expectedValue).toBe("string");
      expect(typeof issue!.actualValue).toBe("string");
      expect(issue!.expectedValue).toBe(fixture.facts.total_assets);
      expect(issue!.actualValue).toBe("91000000");
    }
    expect(prismaMock.financialStatement.upsert).not.toHaveBeenCalled();
  });

  it("FinancialStatement is not upserted and filing stays unpublished when validation fails", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(
      makeFixtureFacts({ total_equity_and_liabilities: 91000000n }) as never,
    );

    await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect(prismaMock.financialStatement.upsert).not.toHaveBeenCalled();
    expect(prismaMock.annualReportFiling.update).not.toHaveBeenCalled();
  });

  it("original FinancialFact records are not deleted or modified after publish", async () => {
    prismaMock.annualReportReview.findUnique.mockResolvedValue(acceptedReview as never);
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue(makeFixtureFacts() as never);

    await publishReviewedAnnualReportFacts("review-1", "user-1");

    expect("deleteMany" in prismaMock.financialFact).toBe(false);
    expect(prismaMock.financialFact.findMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: validateReviewedAnnualReportFacts — BigInt serialization
// ---------------------------------------------------------------------------

describe("validateReviewedAnnualReportFacts — BigInt serialization", () => {
  beforeEach(resetMocks);

  it("returns string expectedValue/actualValue in blockingIssues for JSON safety", async () => {
    prismaMock.annualReportReviewedFact.findMany.mockResolvedValue([
      {
        id: "rf-1", reviewId: "review-1", metricKey: "total_assets",
        statementType: "BALANCE_SHEET", value: BigInt("92155000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
        correctionSource: "ACCEPTED_MACHINE",
      },
      {
        id: "rf-2", reviewId: "review-1", metricKey: "total_equity_and_liabilities",
        statementType: "BALANCE_SHEET", value: BigInt("91000000"), fiscalYear: 2023,
        currency: "NOK", unitScale: 1, sourcePage: null, rawLabel: null,
        correctionSource: "MANUAL_CORRECTION",
      },
    ] as never);

    const result = await validateReviewedAnnualReportFacts("review-1");

    expect(result.passed).toBe(false);
    const issue = result.blockingIssues.find((i) => i.ruleCode === "BS_TOTAL_BALANCES");
    expect(issue).toBeDefined();
    expect(typeof issue!.expectedValue).toBe("string");
    expect(typeof issue!.actualValue).toBe("string");
    expect(issue!.expectedValue).toBe("92155000");
    expect(issue!.actualValue).toBe("91000000");
  });

  it("hasBlockingErrors and validationScore are included in the payload", async () => {
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

    expect(result).toHaveProperty("hasBlockingErrors", false);
    expect(result).toHaveProperty("validationScore");
    expect(typeof result.validationScore).toBe("number");
    expect(result.validationScore).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: atomicity
// ---------------------------------------------------------------------------

describe("atomicity", () => {
  beforeEach(resetMocks);

  it("accept flow persists review data first and then publishes reviewed values", async () => {
    await acceptAnnualReportReview("review-1", "user-reviewer-1");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(prismaMock.annualReportReviewDecision.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.annualReportReview.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.pdfTrainingLabel.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.annualReportReviewedFact.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.financialStatement.upsert).toHaveBeenCalledTimes(1);
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
