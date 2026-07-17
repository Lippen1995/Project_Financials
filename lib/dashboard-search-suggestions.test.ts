import { afterEach, describe, expect, it, vi } from "vitest";

import {
  filterDashboardSearchSuggestions,
  scheduleDashboardSuggestionSearch,
} from "@/lib/dashboard-search-suggestions";
import type { NavSearchSuggestion } from "@/lib/nav-search";

const suggestions: NavSearchSuggestion[] = [
  { type: "company", id: "1", title: "COMPANY", description: "", href: "/" },
  { type: "industry", id: "2", title: "INDUSTRY", description: "", href: "/" },
  { type: "person", id: "3", title: "PERSON", description: "", href: "/" },
  { type: "role", id: "4", title: "ROLE", description: "", href: "/" },
  { type: "bankruptcy", id: "5", title: "BANKRUPTCY", description: "", href: "/" },
];

describe("dashboard search suggestions", () => {
  afterEach(() => vi.useRealTimers());

  it("matches suggestions to every dashboard search scope", () => {
    expect(filterDashboardSearchSuggestions(suggestions, "all")).toHaveLength(5);
    expect(filterDashboardSearchSuggestions(suggestions, "companies")[0]?.type).toBe("company");
    expect(filterDashboardSearchSuggestions(suggestions, "industries")[0]?.type).toBe("industry");
    expect(filterDashboardSearchSuggestions(suggestions, "persons")[0]?.type).toBe("person");
    expect(filterDashboardSearchSuggestions(suggestions, "roles")[0]?.type).toBe("role");
    expect(filterDashboardSearchSuggestions(suggestions, "bankruptcies")[0]?.type).toBe(
      "bankruptcy",
    );
  });

  it("debounces live suggestions, clears stale results and skips AI mode", async () => {
    vi.useFakeTimers();
    const onStart = vi.fn();
    const onResult = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: suggestions, meta: { unavailableSources: [] } })),
    );

    scheduleDashboardSuggestionSearch({
      query: "result",
      scope: "companies",
      aiEnabled: false,
      delayMs: 200,
      fetcher,
      onStart,
      onResult,
      onError,
      onSettled,
    });

    expect(onStart).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/search/suggestions?query=result&scope=companies",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(onResult).toHaveBeenCalledWith({
      data: suggestions,
      meta: { unavailableSources: [] },
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledOnce();

    const aiFetcher = vi.fn();
    scheduleDashboardSuggestionSearch({
      query: "result",
      scope: "companies",
      aiEnabled: true,
      delayMs: 200,
      fetcher: aiFetcher,
      onStart,
      onResult,
      onError,
      onSettled,
    });
    await vi.advanceTimersByTimeAsync(200);
    expect(aiFetcher).not.toHaveBeenCalled();
  });

  it("delivers fast company suggestions without waiting for slower sources", async () => {
    vi.useFakeTimers();
    const companyPayload = {
      data: [suggestions[0]],
      meta: { unavailableSources: [] },
    };
    const neverResolves = new Promise<Response>(() => undefined);
    const fetcher = vi.fn((url: string) =>
      url.includes("scope=companies")
        ? Promise.resolve(new Response(JSON.stringify(companyPayload)))
        : neverResolves,
    );
    const onResult = vi.fn();

    scheduleDashboardSuggestionSearch({
      query: "reach subsea",
      scope: "all",
      aiEnabled: false,
      delayMs: 200,
      sourceTimeoutMs: 500,
      fetcher,
      onStart: vi.fn(),
      onResult,
      onError: vi.fn(),
      onSettled: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(200);

    expect(onResult).toHaveBeenCalledWith(companyPayload);

    await vi.advanceTimersByTimeAsync(500);
    expect(onResult).toHaveBeenLastCalledWith({
      data: companyPayload.data,
      meta: {
        unavailableSources: ["persons", "industries", "roles", "bankruptcies"],
      },
    });
  });
});
