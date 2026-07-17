import { describe, expect, it } from "vitest";

import {
  buildReportedChange,
  isTransactionAfterSnapshot,
} from "@/server/insider-transactions/reported-change-window";

describe("reported insider changes", () => {
  it("shows only transactions strictly after the shareholder snapshot", () => {
    const snapshotDate = new Date("2025-12-31T00:00:00.000Z");

    expect(isTransactionAfterSnapshot(new Date("2025-12-31T00:00:00.000Z"), snapshotDate)).toBe(false);
    expect(isTransactionAfterSnapshot(new Date("2026-01-01T00:00:00.000Z"), snapshotDate)).toBe(true);
  });

  it("weights a holding-company transaction without changing its reported volume", () => {
    expect(
      buildReportedChange({
        transactionId: "tx-1",
        transactionDate: new Date("2026-07-16T00:00:00.000Z"),
        action: "PURCHASE",
        reportedShares: 3_000n,
        ownershipFraction: "0.6",
        direct: false,
        legalPartyName: "NORTH INDUSTRIES 1 AS",
        sourceUrl: "https://newsweb.oslobors.no/message/1",
      }),
    ).toMatchObject({
      reportedShares: "3000",
      attributedShares: "1800",
      ownershipFraction: "0.6",
      direct: false,
    });
  });
});
