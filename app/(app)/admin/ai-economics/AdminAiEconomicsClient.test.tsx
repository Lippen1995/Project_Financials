import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { AdminAiEconomicsDashboard } from "@/server/services/admin-ai-economics-service";

import AdminAiEconomicsClient from "./AdminAiEconomicsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function dashboard(): AdminAiEconomicsDashboard {
  return {
    period: {
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
      generatedAt: "2026-07-29T12:00:00.000Z",
    },
    settings: null,
    runtimeControl: {
      environmentMasterEnabled: false,
      adminEnabled: false,
      effectiveEnabled: false,
    },
    totals: {
      calls: 2,
      failedCalls: 0,
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 20,
      usageTokens: 120,
      estimatedCostNok: 90,
      budgetedCostNok: 100,
      reservedCostNok: 0,
      modeledSubscriptionRevenueNok: 5_000,
      allocatedAiRevenueNok: 125,
      aiContributionNok: 25,
      realizedMarkupPercent: 25,
      committedCostNok: 100,
      remainingBudgetNok: 0,
      projectedBudgetedCostNok: 100,
    },
    splits: {
      categories: [],
      roles: [],
      plans: [],
      models: [],
    },
    plans: [],
    users: [],
    recentChanges: [],
  };
}

describe("AdminAiEconomicsClient", () => {
  it("shows total modeled AI revenue and contribution next to cost totals", () => {
    const html = renderToStaticMarkup(
      <AdminAiEconomicsClient model={dashboard()} />,
    );

    expect(html).toContain("Samlet abonnementsøkonomi");
    expect(html).toContain("Allokert AI-inntekt");
    expect(html).toContain("AI-bidrag");
    expect(html).toContain("Realisert påslag");
    expect(html).toContain("125,00");
    expect(html).toContain("25,00");
    expect(html).toContain("25,0");
  });
});
