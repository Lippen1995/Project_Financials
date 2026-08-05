import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  company: { findUnique: vi.fn() },
  structuredFinancialFetchState: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
};

const acquirePipelineJobLease = vi.fn();
const releasePipelineJobLease = vi.fn();
const ingestStructuredFinancialsForCompany = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/recoverable-error", () => ({ logRecoverableError: vi.fn() }));
vi.mock("@/server/persistence/pipeline-job-lease-repository", () => ({
  acquirePipelineJobLease: (input: unknown) => acquirePipelineJobLease(input),
  releasePipelineJobLease: (input: unknown) => releasePipelineJobLease(input),
}));
vi.mock("@/server/services/structured-financials-service", () => ({
  ingestStructuredFinancialsForCompany: (orgNumber: string) =>
    ingestStructuredFinancialsForCompany(orgNumber),
}));

const {
  drainStructuredFinancialsQueue,
  enqueueStructuredFinancialsFetch,
  STRUCTURED_FETCH_STATUS_PENDING,
} = await import("@/server/services/structured-financials-queue-service");

function ingestionResult(overrides: Record<string, unknown> = {}) {
  return {
    orgNumber: "912345678",
    status: "AVAILABLE",
    available: true,
    fromCache: false,
    published: 1,
    skippedReviewed: 0,
    unavailableReason: null,
    fiscalYears: [2025],
    errorCode: null,
    nextCheckAt: new Date(),
    sourceSystem: "BRREG",
    sourceEntityType: "structuredAnnualAccounts",
    sourceId: "912345678",
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  acquirePipelineJobLease.mockResolvedValue({ acquired: true, lease: {} });
  releasePipelineJobLease.mockResolvedValue({ count: 1 });
});

describe("enqueueStructuredFinancialsFetch", () => {
  it("creates a PENDING row due immediately for an untracked company", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-1" });
    prismaMock.structuredFinancialFetchState.findUnique.mockResolvedValue(null);
    prismaMock.structuredFinancialFetchState.create.mockResolvedValue({});

    const outcome = await enqueueStructuredFinancialsFetch("912345678");

    expect(outcome).toBe("queued");
    const data = prismaMock.structuredFinancialFetchState.create.mock.calls[0][0].data;
    expect(data.status).toBe(STRUCTURED_FETCH_STATUS_PENDING);
    expect(data.companyId).toBe("company-1");
    // Due immediately so the next drain picks it up.
    expect(data.nextCheckAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("does not touch an existing row, so repeat views cannot reset backoff", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-1" });
    prismaMock.structuredFinancialFetchState.findUnique.mockResolvedValue({
      status: "ERROR",
    });

    const outcome = await enqueueStructuredFinancialsFetch("912345678");

    expect(outcome).toBe("already_tracked");
    expect(prismaMock.structuredFinancialFetchState.create).not.toHaveBeenCalled();
  });

  it("reports an already queued company without rewriting it", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-1" });
    prismaMock.structuredFinancialFetchState.findUnique.mockResolvedValue({
      status: STRUCTURED_FETCH_STATUS_PENDING,
    });

    expect(await enqueueStructuredFinancialsFetch("912345678")).toBe("already_queued");
    expect(prismaMock.structuredFinancialFetchState.create).not.toHaveBeenCalled();
  });

  it("returns unknown_company rather than throwing on the read path", async () => {
    prismaMock.company.findUnique.mockResolvedValue(null);

    expect(await enqueueStructuredFinancialsFetch("912345678")).toBe("unknown_company");
  });

  it("never throws when the database write fails", async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: "company-1" });
    prismaMock.structuredFinancialFetchState.findUnique.mockResolvedValue(null);
    prismaMock.structuredFinancialFetchState.create.mockRejectedValue(
      new Error("unique constraint"),
    );

    await expect(enqueueStructuredFinancialsFetch("912345678")).resolves.toBe(
      "already_queued",
    );
  });
});

describe("drainStructuredFinancialsQueue", () => {
  it("skips when another worker holds the lease", async () => {
    acquirePipelineJobLease.mockResolvedValue({
      acquired: false,
      lease: { leaseOwner: "other-worker" },
    });

    const result = await drainStructuredFinancialsQueue();

    expect(result.skipped).toBe(true);
    expect(result.skippedReason).toContain("other-worker");
    expect(ingestStructuredFinancialsForCompany).not.toHaveBeenCalled();
  });

  it("fetches every due company oldest first and releases the lease", async () => {
    prismaMock.structuredFinancialFetchState.findMany
      .mockResolvedValueOnce([{ company: { orgNumber: "911111111" } }])
      .mockResolvedValueOnce([{ company: { orgNumber: "922222222" } }]);
    ingestStructuredFinancialsForCompany
      .mockResolvedValueOnce(ingestionResult({ orgNumber: "911111111" }))
      .mockResolvedValueOnce(
        ingestionResult({
          orgNumber: "922222222",
          status: "UNAVAILABLE",
          available: false,
          fiscalYears: [],
        }),
      );

    const result = await drainStructuredFinancialsQueue({ limit: 10 });

    expect(prismaMock.structuredFinancialFetchState.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { nextCheckAt: "asc" }, take: 10 }),
    );
    expect(result.claimed).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.available).toBe(1);
    expect(result.unavailable).toBe(1);
    expect(releasePipelineJobLease).toHaveBeenCalledTimes(1);
  });

  it("drains queued companies before routine refreshes", async () => {
    prismaMock.structuredFinancialFetchState.findMany
      .mockResolvedValueOnce([{ company: { orgNumber: "9PENDING1" } }])
      .mockResolvedValueOnce([{ company: { orgNumber: "9REFRESH1" } }]);
    ingestStructuredFinancialsForCompany.mockResolvedValue(ingestionResult());

    await drainStructuredFinancialsQueue({ limit: 5 });

    const [pendingQuery, refreshQuery] =
      prismaMock.structuredFinancialFetchState.findMany.mock.calls;
    expect(pendingQuery[0].where.status).toBe(STRUCTURED_FETCH_STATUS_PENDING);
    expect(refreshQuery[0].where.status).toEqual({ not: STRUCTURED_FETCH_STATUS_PENDING });
    // Remaining capacity only.
    expect(refreshQuery[0].take).toBe(4);
    expect(ingestStructuredFinancialsForCompany.mock.calls[0][0]).toBe("9PENDING1");
  });

  it("does not query refreshes when queued companies already fill the batch", async () => {
    prismaMock.structuredFinancialFetchState.findMany.mockResolvedValueOnce([
      { company: { orgNumber: "9PENDING1" } },
      { company: { orgNumber: "9PENDING2" } },
    ]);
    ingestStructuredFinancialsForCompany.mockResolvedValue(ingestionResult());

    await drainStructuredFinancialsQueue({ limit: 2 });

    expect(prismaMock.structuredFinancialFetchState.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps draining after one company throws", async () => {
    prismaMock.structuredFinancialFetchState.findMany
      .mockResolvedValueOnce([
        { company: { orgNumber: "911111111" } },
        { company: { orgNumber: "922222222" } },
      ])
      .mockResolvedValueOnce([]);
    ingestStructuredFinancialsForCompany
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(ingestionResult({ orgNumber: "922222222" }));

    const result = await drainStructuredFinancialsQueue();

    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.companies).toHaveLength(2);
    expect(result.companies[0].errorCode).toBe("DRAIN_FAILED");
  });

  it("releases the lease even when the queue read fails", async () => {
    prismaMock.structuredFinancialFetchState.findMany.mockRejectedValue(
      new Error("db down"),
    );

    await expect(drainStructuredFinancialsQueue()).rejects.toThrow("db down");
    expect(releasePipelineJobLease).toHaveBeenCalledTimes(1);
  });
});
