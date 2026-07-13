import { describe, expect, it, vi } from "vitest";

import {
  resolveDashboardSearchHref,
  type RoutingDependencies,
} from "@/server/services/dashboard-search-routing-service";

function dependencies(input?: {
  companyName?: string;
  personName?: string;
  industryCode?: string;
  aiScope?: Awaited<ReturnType<RoutingDependencies["classifyWithAi"]>>;
}): RoutingDependencies {
  return {
    searchCompanyMatches: vi.fn().mockResolvedValue({
      results: input?.companyName ? [{ company: { name: input.companyName } }] : [],
      interpretation: {
        matchedIndustryCodes: input?.industryCode ? [{ code: input.industryCode }] : [],
      },
    }),
    searchPersonMatches: vi
      .fn()
      .mockResolvedValue(input?.personName ? [{ fullName: input.personName }] : []),
    classifyWithAi: vi.fn().mockResolvedValue(input?.aiScope ?? null),
  };
}

describe("dashboard all-search routing", () => {
  it("lets AI choose the destination while preserving AI mode", async () => {
    const href = await resolveDashboardSearchHref(
      { query: "hvem leder Equinor", aiEnabled: true },
      dependencies({ aiScope: "roles" }),
    );

    expect(href).toBe("/people?query=hvem+leder+Equinor&scope=roles&ai=1#role-filter");
  });

  it("prefers an exact person match over a non-exact company match", async () => {
    const href = await resolveDashboardSearchHref(
      { query: "Ola Nordmann", aiEnabled: false },
      dependencies({ companyName: "Ola Nordmann Invest AS", personName: "Ola Nordmann" }),
    );

    expect(href).toBe("/people?query=Ola+Nordmann&scope=persons");
  });

  it("routes organisation numbers and industry codes deterministically", async () => {
    await expect(
      resolveDashboardSearchHref(
        { query: "923 609 016", aiEnabled: false },
        dependencies(),
      ),
    ).resolves.toBe("/search?query=923+609+016&scope=companies");
    await expect(
      resolveDashboardSearchHref(
        { query: "62.010", aiEnabled: false },
        dependencies(),
      ),
    ).resolves.toBe("/search?query=62.010&scope=industries");
  });

  it("falls back to real match signals if AI is unavailable", async () => {
    const href = await resolveDashboardSearchHref(
      { query: "Kari Nordmann", aiEnabled: true },
      dependencies({ personName: "Kari Nordmann" }),
    );

    expect(href).toBe("/people?query=Kari+Nordmann&scope=persons&ai=1");
  });
});
