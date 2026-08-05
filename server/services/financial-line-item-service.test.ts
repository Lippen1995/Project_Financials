import { describe, expect, it } from "vitest";

import type { FinancialFactStatementType } from "@prisma/client";

import { buildStructuredLineItemDrafts } from "@/server/services/financial-line-item-service";

const statementTypeByKey = new Map<string, FinancialFactStatementType>([
  ["total_operating_income", "INCOME_STATEMENT"],
  ["operating_profit", "INCOME_STATEMENT"],
  ["net_income", "INCOME_STATEMENT"],
  ["total_assets", "BALANCE_SHEET"],
  ["total_equity", "BALANCE_SHEET"],
]);

const registryOrder = new Map<string, number>([
  ["total_operating_income", 0],
  ["operating_profit", 1],
  ["net_income", 2],
  ["total_assets", 10],
  ["total_equity", 11],
]);

function build(canonicalValues: Record<string, unknown> | null) {
  return buildStructuredLineItemDrafts(
    { canonicalValues: canonicalValues as Record<string, number> | null },
    statementTypeByKey,
    registryOrder,
  );
}

describe("buildStructuredLineItemDrafts", () => {
  it("maps canonical values to mapped line items with no source label", () => {
    const { drafts } = build({ operating_profit: 1500, total_assets: 9000 });

    expect(drafts).toHaveLength(2);
    for (const draft of drafts) {
      // The structured feed is pre-mapped by our own code, so there is no raw
      // label to map and nothing lands in the mapping queue.
      expect(draft.metricKey).not.toBeNull();
      expect(draft.sourceLabel).toBeNull();
    }
  });

  it("assigns statement type from the registry", () => {
    const { drafts } = build({ operating_profit: 1, total_assets: 2 });
    const byKey = new Map(drafts.map((d) => [d.metricKey, d.statementType]));

    expect(byKey.get("operating_profit")).toBe("INCOME_STATEMENT");
    expect(byKey.get("total_assets")).toBe("BALANCE_SHEET");
  });

  it("orders by the registry, not by JSON key order", () => {
    const { drafts } = build({
      total_equity: 4,
      net_income: 3,
      total_operating_income: 1,
    });

    expect(drafts.map((d) => d.metricKey)).toEqual([
      "total_operating_income",
      "net_income",
      "total_equity",
    ]);
    expect(drafts.map((d) => d.sortOrder)).toEqual([0, 1, 2]);
  });

  it("keeps a key the registry does not know and reports it", () => {
    const { drafts, unknownKeys } = build({ operating_profit: 1, mystery_key: 2 });

    expect(unknownKeys).toEqual(["mystery_key"]);
    expect(drafts.map((d) => d.metricKey)).toContain("mystery_key");
    // Unknown keys sort last rather than silently jumping the statement.
    expect(drafts.at(-1)?.metricKey).toBe("mystery_key");
  });

  it("builds a stable sourceKey so re-ingestion updates rather than duplicates", () => {
    const first = build({ operating_profit: 1 }).drafts[0];
    const second = build({ operating_profit: 999 }).drafts[0];

    expect(first.sourceKey).toBe(second.sourceKey);
    expect(first.sourceKey).toBe("canonicalValues:operating_profit");
  });

  it("drops non-finite and non-numeric values instead of storing zero", () => {
    const { drafts } = build({
      operating_profit: Number.NaN,
      net_income: Number.POSITIVE_INFINITY,
      total_assets: "1000",
      total_equity: 42,
    });

    expect(drafts.map((d) => d.metricKey)).toEqual(["total_equity"]);
  });

  it("rounds to whole currency units", () => {
    const { drafts } = build({ operating_profit: 1500.6 });

    expect(drafts[0].value).toBe(1501n);
  });

  it("returns nothing for a statement without canonical values", () => {
    expect(build(null).drafts).toEqual([]);
    expect(build({}).drafts).toEqual([]);
  });
});
