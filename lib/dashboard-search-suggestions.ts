import type { DashboardSearchScope } from "@/lib/dashboard-search";
import {
  canShowNavSearchSuggestions,
  type NavSearchSuggestion,
} from "@/lib/nav-search";

const SUGGESTION_TYPE_BY_SCOPE: Record<
  Exclude<DashboardSearchScope, "all">,
  NavSearchSuggestion["type"]
> = {
  companies: "company",
  industries: "industry",
  persons: "person",
  roles: "role",
  bankruptcies: "bankruptcy",
};

export function filterDashboardSearchSuggestions(
  suggestions: NavSearchSuggestion[],
  scope: DashboardSearchScope,
) {
  if (scope === "all") return suggestions;
  return suggestions.filter((suggestion) => suggestion.type === SUGGESTION_TYPE_BY_SCOPE[scope]);
}

export type DashboardSuggestionPayload = {
  data: NavSearchSuggestion[];
  meta: { unavailableSources: string[] };
};

export function scheduleDashboardSuggestionSearch({
  query,
  aiEnabled,
  delayMs,
  fetcher = fetch,
  onStart,
  onResult,
  onError,
  onSettled,
}: {
  query: string;
  aiEnabled: boolean;
  delayMs: number;
  fetcher?: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  onStart: () => void;
  onResult: (payload: DashboardSuggestionPayload) => void;
  onError: () => void;
  onSettled: () => void;
}) {
  if (!canShowNavSearchSuggestions(query, aiEnabled)) return () => undefined;

  const controller = new AbortController();
  onStart();
  const handle = globalThis.setTimeout(async () => {
    try {
      const response = await fetcher(
        `/api/search/suggestions?query=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("suggestion search failed");
      onResult((await response.json()) as DashboardSuggestionPayload);
    } catch (error) {
      if ((error as Error).name !== "AbortError") onError();
    } finally {
      if (!controller.signal.aborted) onSettled();
    }
  }, delayMs);

  return () => {
    controller.abort();
    globalThis.clearTimeout(handle);
  };
}
