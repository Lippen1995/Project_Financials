import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  financialDisclosureFor,
  SIMULATED_FINANCIALS_NOTICE,
} from "@/lib/financial-simulation-disclosure";
import { WatchlistView } from "./watchlist-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/actions/workspace-collaboration-actions", () => ({
  addToWatchlistAction: vi.fn(),
  archiveWatchlistCompanyAction: vi.fn(),
}));

describe("WatchlistView simulated disclosure", () => {
  it("labels the financial table and trend when the live dataset is simulated", () => {
    globalThis.React = React;
    const html = renderToStaticMarkup(
      <WatchlistView
        workspaceId="workspace-1"
        companies={[
          {
            watchId: "watch-1",
            orgNumber: "999999999",
            slug: "demo-as",
            name: "Demo AS",
            status: "ACTIVE",
            legalForm: "AS",
            industry: "Industri",
            watchedSince: "2026-08-10T00:00:00.000Z",
            foundedAt: null,
            employeeCount: null,
            website: null,
            statements: [
              {
                year: 2025,
                revenue: 1_000,
                operatingProfit: 100,
                netIncome: 80,
                equity: 400,
                assets: 900,
                origins: {
                  revenue: "reported",
                  operatingProfit: "synthetic",
                  netIncome: "synthetic",
                  equity: "synthetic",
                  assets: "synthetic",
                },
                statementOrigin: "simulated",
                financialDatasetVersion: "simulated:investor-2026-08:1",
              },
            ],
          },
        ]}
        news={[]}
        alerts={[]}
        ddRooms={[]}
        financialDisclosure={financialDisclosureFor(
          "simulated",
          "simulated:investor-2026-08:1",
        )}
      />,
    );

    expect(html).toContain(SIMULATED_FINANCIALS_NOTICE);
    expect(html).toContain("simulated:investor-2026-08:1");
    expect(html).toContain('role="note"');
    expect(html).toContain('data-value-origin="synthetic"');
  });
});
