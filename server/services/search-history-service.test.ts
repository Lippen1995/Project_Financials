import { beforeEach, describe, expect, it, vi } from "vitest";

const executeRaw = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: executeRaw, $transaction: transaction },
}));
vi.mock("@/lib/env", () => ({
  default: {
    njordInputNokPerMillion: 1,
    njordCachedInputNokPerMillion: 0.1,
    njordOutputNokPerMillion: 8,
  },
}));

import {
  deleteExpiredSearchHistory,
  failAiSearchUsage,
} from "@/server/services/search-history-service";

describe("failAiSearchUsage", () => {
  beforeEach(() => {
    executeRaw.mockReset();
    executeRaw.mockResolvedValue(1);
  });

  it("transfers a retained reservation into counted failed usage", async () => {
    await failAiSearchUsage("user-1", "reservation-1", {
      errorCode: "PROVIDER_ACCOUNTING_MISSING",
      durationMs: 4,
      retainReservation: true,
    });

    const query = executeRaw.mock.calls[0]?.[0] as { strings: string[] };
    const sql = query.strings.join("?");
    expect(sql).toContain('"usageTokens" = "reservedTokens"');
    expect(sql).toContain('"budgetedCostNok" = "reservedCostNok"');
    expect(sql).toContain('"reservedTokens" = 0');
    expect(sql).toContain('"reservedCostNok" = 0');
  });
});

describe("deleteExpiredSearchHistory", () => {
  it("retains only 30 days of background worker run evidence", async () => {
    executeRaw.mockReset();
    executeRaw.mockReturnValue({});
    transaction.mockImplementation(async (operations: unknown[]) => operations.map(() => 1));

    await expect(deleteExpiredSearchHistory(
      new Date("2026-08-28T08:00:00.000Z"),
    )).resolves.toBe(4);

    const statements = executeRaw.mock.calls
      .map(([query]) => (query as { strings: string[] }).strings.join("?"))
      .join("\n");
    expect(statements).toContain('DELETE FROM "BackgroundJobRun"');
  });
});
