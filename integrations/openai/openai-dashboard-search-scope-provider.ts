import env from "@/lib/env";
import type { ResolvedDashboardSearchScope } from "@/lib/dashboard-search";

type AiScopeResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const scopes: ResolvedDashboardSearchScope[] = [
  "companies",
  "industries",
  "persons",
  "roles",
  "bankruptcies",
];

/** Hard ceiling regardless of the budget handed in; the reply is one short JSON object. */
const PROVIDER_MAXIMUM_OUTPUT_TOKENS = 64;

/**
 * Token allowance for a single classification, derived from the caller's
 * remaining AI budget. There is no default: a caller that cannot say what it
 * can afford does not get a model call.
 */
export type ScopeClassificationBudget = {
  maxOutputTokens: number;
};

/**
 * Classifies a search query into one search scope using a language model.
 *
 * Fail-closed by design. This is a second model call path outside the Njord
 * adapter (GL-301) and outside the secure system prompt and injection
 * inspection in server/ai-search/runtime-policy.ts (GL-305), so it must not be
 * possible to reach it by accident. It refuses unless the caller passes an
 * explicit token budget AND the paid-AI master switch is on — the same switch
 * the search page and search API gate on.
 *
 * Wiring this into a user-facing flow is not just a matter of passing a
 * budget: per GL-306/GL-307 the caller must also reserve against the user's
 * quota via reserveAiSearchUsage and finalise the observed usage, as
 * app/(app)/search/page.tsx does. Until that exists, callers pass null and the
 * deterministic router in dashboard-search-routing-service decides the scope.
 */
export class OpenAiDashboardSearchScopeProvider {
  async classify(
    query: string,
    budget: ScopeClassificationBudget | null,
  ): Promise<ResolvedDashboardSearchScope | null> {
    if (!budget || !Number.isFinite(budget.maxOutputTokens) || budget.maxOutputTokens < 1) {
      return null;
    }
    if (!env.aiSearchBillingEnabled) return null;
    if (!env.openAiApiKey) return null;

    const maxCompletionTokens = Math.min(
      PROVIDER_MAXIMUM_OUTPUT_TOKENS,
      Math.trunc(budget.maxOutputTokens),
    );

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: env.openAiSearchModel,
          temperature: 0,
          max_completion_tokens: maxCompletionTokens,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Classify a Norwegian business-search query into exactly one available search scope. " +
                "Return strict JSON with the key scope and one of: companies, industries, persons, roles, bankruptcies. " +
                "Choose persons for a named individual, roles for queries primarily about a position, industries for an industry/activity, bankruptcies for bankruptcy-focused queries, otherwise companies. Do not invent facts.",
            },
            { role: "user", content: query },
          ],
        }),
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as AiScopeResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content) as { scope?: string };
      return scopes.includes(parsed.scope as ResolvedDashboardSearchScope)
        ? (parsed.scope as ResolvedDashboardSearchScope)
        : null;
    } catch {
      return null;
    }
  }
}
