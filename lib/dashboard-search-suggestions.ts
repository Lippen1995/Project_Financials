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

const ALL_SUGGESTION_SCOPES: Array<Exclude<DashboardSearchScope, "all">> = [
  "companies",
  "persons",
  "industries",
  "roles",
  "bankruptcies",
];
const DEFAULT_SOURCE_TIMEOUT_MS = 2_500;

export function scheduleDashboardSuggestionSearch({
  query,
  scope,
  aiEnabled,
  delayMs,
  sourceTimeoutMs = DEFAULT_SOURCE_TIMEOUT_MS,
  fetcher = fetch,
  onStart,
  onResult,
  onError,
  onSettled,
}: {
  query: string;
  scope: DashboardSearchScope;
  aiEnabled: boolean;
  delayMs: number;
  sourceTimeoutMs?: number;
  fetcher?: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
  onStart: () => void;
  onResult: (payload: DashboardSuggestionPayload) => void;
  onError: () => void;
  onSettled: () => void;
}) {
  if (!canShowNavSearchSuggestions(query, aiEnabled)) return () => undefined;

  const controller = new AbortController();
  onStart();
  const handle = globalThis.setTimeout(() => {
    const scopes = scope === "all" ? ALL_SUGGESTION_SCOPES : [scope];
    const resultsByScope = new Map<DashboardSearchScope, NavSearchSuggestion[]>();
    const resolvedScopes: DashboardSearchScope[] = [];
    const unavailableSources = new Set<string>();

    const emitResult = () => {
      onResult({
        data: resolvedScopes.flatMap((candidate) => resultsByScope.get(candidate) ?? []),
        meta: { unavailableSources: [...unavailableSources] },
      });
    };

    const requests = scopes.map(async (candidate) => {
      const requestController = new AbortController();
      const abortRequest = () => requestController.abort();
      controller.signal.addEventListener("abort", abortRequest, { once: true });
      const aborted = new Promise<never>((_, reject) => {
        requestController.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Suggestion source aborted", "AbortError")),
          { once: true },
        );
      });
      const timeoutHandle = globalThis.setTimeout(abortRequest, sourceTimeoutMs);

      try {
        const response = await Promise.race([
          fetcher(
            `/api/search/suggestions?query=${encodeURIComponent(query.trim())}&scope=${candidate}`,
            { signal: requestController.signal },
          ),
          aborted,
        ]);
        if (!response.ok) throw new Error("suggestion search failed");
        const payload = (await response.json()) as DashboardSuggestionPayload;
        if (controller.signal.aborted) return;
        if (!resultsByScope.has(candidate)) resolvedScopes.push(candidate);
        resultsByScope.set(candidate, payload.data);
        payload.meta.unavailableSources.forEach((source) => unavailableSources.add(source));
        emitResult();
      } catch (error) {
        if (!controller.signal.aborted) unavailableSources.add(candidate);
      } finally {
        globalThis.clearTimeout(timeoutHandle);
        controller.signal.removeEventListener("abort", abortRequest);
      }
    });

    void Promise.allSettled(requests).then(() => {
      if (controller.signal.aborted) return;
      if (resultsByScope.size === 0) onError();
      else if (unavailableSources.size > 0) emitResult();
      onSettled();
    });
  }, delayMs);

  return () => {
    controller.abort();
    globalThis.clearTimeout(handle);
  };
}
