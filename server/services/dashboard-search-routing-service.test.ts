import { describe, expect, it, vi } from "vitest";

import {
  resolveDashboardSearchHref,
  type RoutingDependencies,
} from "@/server/services/dashboard-search-routing-service";

function dependencies(input?: {
  companyName?: string;
  personName?: string;
  industryCode?: string;
  industryTitle?: string;
  roleLabel?: string;
  bankruptcyName?: string;
  aiScope?: Awaited<ReturnType<RoutingDependencies["classifyWithAi"]>>;
}): RoutingDependencies {
  return {
    searchCompanyMatches: vi.fn().mockImplementation((_, options) =>
      Promise.resolve({
        results: options?.status
          ? input?.bankruptcyName
            ? [{ company: { name: input.bankruptcyName } }]
            : []
          : input?.companyName
            ? [{ company: { name: input.companyName } }]
            : [],
      }),
    ),
    searchPersonMatches: vi
      .fn()
      .mockResolvedValue(input?.personName ? [{ fullName: input.personName }] : []),
    searchIndustryMatches: vi.fn().mockResolvedValue(
      input?.industryCode
        ? [{ code: input.industryCode, title: input.industryTitle ?? null, score: 40 }]
        : [],
    ),
    searchRoleMatches: vi.fn().mockResolvedValue(
      input?.roleLabel ? [{ roleType: "ROLE_CODE", roleTypeLabel: input.roleLabel }] : [],
    ),
    classifyWithAi: vi.fn().mockResolvedValue(input?.aiScope ?? null),
  };
}

describe("dashboard all-search routing", () => {
  it("lets AI choose the destination while preserving AI mode", async () => {
    const href = await resolveDashboardSearchHref(
      {
        query: "ROLE_QUERY",
        aiEnabled: true,
        aiBudget: {
          maxOutputTokens: 32,
          onAiUsage: vi.fn(),
          onAiUsageFailure: vi.fn(),
        },
      },
      dependencies({ aiScope: "roles" }),
    );

    expect(href).toBe("/people?query=ROLE_QUERY&scope=roles&ai=1#role-filter");
  });

  it("does not call the model classifier when no AI budget is supplied", async () => {
    const deps = dependencies({ aiScope: "roles", personName: "PERSON_QUERY" });

    const href = await resolveDashboardSearchHref(
      { query: "PERSON_QUERY", aiEnabled: true },
      deps,
    );

    expect(deps.classifyWithAi).not.toHaveBeenCalled();
    // Falls back to deterministic routing rather than spending on a model call.
    expect(href).toBe("/people?query=PERSON_QUERY&scope=persons&ai=1");
  });

  it("does not call the model classifier when the budget is explicitly null", async () => {
    const deps = dependencies({ aiScope: "roles", personName: "PERSON_QUERY" });

    await resolveDashboardSearchHref(
      { query: "PERSON_QUERY", aiEnabled: true, aiBudget: null },
      deps,
    );

    expect(deps.classifyWithAi).not.toHaveBeenCalled();
  });

  it("prefers an exact person match over a non-exact company match", async () => {
    const href = await resolveDashboardSearchHref(
      { query: "PERSON_QUERY", aiEnabled: false },
      dependencies({ companyName: "PERSON_QUERY_HOLDING", personName: "PERSON_QUERY" }),
    );

    expect(href).toBe("/people?query=PERSON_QUERY&scope=persons");
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
      { query: "PERSON_QUERY", aiEnabled: true },
      dependencies({ personName: "PERSON_QUERY" }),
    );

    expect(href).toBe("/people?query=PERSON_QUERY&scope=persons&ai=1");
  });

  it("compares actual industry and role matches in all-search", async () => {
    await expect(
      resolveDashboardSearchHref(
        { query: "Databehandling", aiEnabled: false },
        dependencies({ industryCode: "63.110", industryTitle: "Databehandling" }),
      ),
    ).resolves.toBe("/search?query=Databehandling&scope=industries");
    await expect(
      resolveDashboardSearchHref(
        { query: "Observatør", aiEnabled: false },
        dependencies({ roleLabel: "Observatør" }),
      ),
    ).resolves.toBe("/people?query=Observat%C3%B8r&scope=roles#role-filter");
  });
});
