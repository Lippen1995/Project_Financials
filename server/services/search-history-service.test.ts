import { beforeEach, describe, expect, it, vi } from "vitest";

const executeRaw = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { $executeRaw: executeRaw },
}));
vi.mock("@/lib/env", () => ({
  default: {
    njordInputNokPerMillion: 1,
    njordCachedInputNokPerMillion: 0.1,
    njordOutputNokPerMillion: 8,
  },
}));

import { failAiSearchUsage } from "@/server/services/search-history-service";

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
