import env from "@/lib/env";
import type { AiTokenUsage } from "@/lib/ai-search-usage";
import type { ResolvedDashboardSearchScope } from "@/lib/dashboard-search";
import {
  createNjordLlmClient,
  getNjordLlmRuntimeConfig,
} from "@/server/ai-search/llm/runtime-client";
import {
  LlmProviderAccountingError,
  LlmProviderResponseError,
  type LlmClient,
  type LlmRunResult,
} from "@/server/ai-search/llm/types";
import { toObservedAiUsage } from "@/server/ai-search/llm/usage";
import {
  buildSecureNjordSystemPrompt,
  inspectNjordUserQuery,
} from "@/server/ai-search/runtime-policy";

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
  /** Finalizes the caller's pre-existing quota/cost reservation with observed provider usage. */
  onAiUsage: (usage: AiTokenUsage) => Promise<void>;
  /** Marks a reserved call failed when the provider omits accounting metadata. */
  onAiUsageFailure: (errorCode: "PROVIDER_ACCOUNTING_MISSING") => Promise<void>;
};

/**
 * Classifies a search query into one search scope using a language model.
 *
 * Fail-closed by design. The classifier uses the shared LlmClient adapter,
 * secure system prompt and injection inspection required by GL-A03. It refuses
 * unless the caller passes an explicit token budget AND the paid-AI master
 * switch is on — the same switch the search page and search API gate on.
 *
 * Wiring this into a user-facing flow is not just a matter of passing a
 * budget: per GL-306/GL-307 the caller must also reserve against the user's
 * quota via reserveAiSearchUsage and finalise the observed usage, as
 * app/(app)/search/page.tsx does. Until that exists, callers pass null and the
 * deterministic router in dashboard-search-routing-service decides the scope.
 */
export class DashboardSearchScopeLlmProvider {
  private readonly llm: LlmClient | null;
  private readonly providerConfigured: boolean;

  constructor(options: { llm?: LlmClient } = {}) {
    if (options.llm) {
      this.providerConfigured = true;
      this.llm = options.llm;
      return;
    }
    const runtime = getNjordLlmRuntimeConfig();
    this.providerConfigured = Boolean(runtime.credential);
    this.llm = runtime.credential ? createNjordLlmClient(runtime, {}) : null;
  }

  async classify(
    query: string,
    budget: ScopeClassificationBudget | null,
  ): Promise<ResolvedDashboardSearchScope | null> {
    if (
      !budget ||
      !Number.isSafeInteger(budget.maxOutputTokens) ||
      budget.maxOutputTokens < 1 ||
      typeof budget.onAiUsage !== "function" ||
      typeof budget.onAiUsageFailure !== "function"
    ) {
      return null;
    }
    if (!env.aiSearchBillingEnabled) return null;
    if (!this.providerConfigured) return null;
    const llm = this.llm;
    if (!llm) return null;
    if (!inspectNjordUserQuery(query).allowed) return null;

    const maxCompletionTokens = Math.min(
      PROVIDER_MAXIMUM_OUTPUT_TOKENS,
      Math.trunc(budget.maxOutputTokens),
    );

    let result: LlmRunResult;
    try {
      result = await llm.run({
        tools: [],
        temperature: 0,
        maxOutputTokens: maxCompletionTokens,
        responseFormat: "json_object",
        messages: [
          {
            role: "system",
            content: buildSecureNjordSystemPrompt(
              "Classify a Norwegian business-search query into exactly one available search scope. " +
                "Return strict JSON with the key scope and one of: companies, industries, persons, roles, bankruptcies. " +
                "Choose persons for a named individual, roles for queries primarily about a position, industries for an industry/activity, bankruptcies for bankruptcy-focused queries, otherwise companies. Do not invent facts.",
            ),
          },
          { role: "user", content: query },
        ],
      });
    } catch (error) {
      if (error instanceof LlmProviderAccountingError) {
        await budget.onAiUsageFailure("PROVIDER_ACCOUNTING_MISSING");
        return null;
      }
      if (error instanceof LlmProviderResponseError) {
        const failedUsage = toObservedAiUsage(error.usage, llm.model);
        if (failedUsage) await budget.onAiUsage(failedUsage);
      }
      return null;
    }

    const observedUsage = toObservedAiUsage(result.usage, llm.model);
    if (!observedUsage) {
      await budget.onAiUsageFailure("PROVIDER_ACCOUNTING_MISSING");
      return null;
    }
    // Usage storage is part of the authorization contract. Let failures escape so the
    // reservation owner can mark the request failed instead of treating it as free fallback.
    await budget.onAiUsage(observedUsage);

    try {
      const content = result.content;
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
