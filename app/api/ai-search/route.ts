import { NextRequest, NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import env from "@/lib/env";
import { calculateAiUsageTokens } from "@/lib/ai-search-usage";
import { logRecoverableError } from "@/lib/recoverable-error";
import { runAgent } from "@/server/ai-search/agent/agent-loop";
import { buildCompanySearchRows } from "@/server/ai-search/agent/company-rows";
import { buildTargetReasoningPrompt } from "@/server/ai-search/agent/target-reasoning";
import { buildNjordVisualization } from "@/server/ai-search/agent/visualization";
import { OpenAiLlmClient } from "@/server/ai-search/llm/openai-client";
import { retrievalTools } from "@/server/ai-search/tools";
import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";
import {
  finalizeAiSearchUsage,
  getAiSearchUsageStatus,
  releaseAiSearchUsage,
  reserveAiSearchUsage,
} from "@/server/services/search-history-service";

/**
 * AI-search agent endpoint. Runs the guarded tool loop with the real LLM when billing and an API key
 * are configured. There is intentionally no deterministic answer fallback: Njord capabilities
 * belong in grounded tools and the LLM prompt, not in a parallel rule model.
 */
export async function POST(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "Tomt søk." }, { status: 400 });
  }

  const realLlmEnabled = env.aiSearchBillingEnabled && Boolean(env.openAiApiKey);
  if (!realLlmEnabled) {
    return NextResponse.json(
      { error: "Njord LLM er ikke aktivert i dette miljøet." },
      { status: 503 },
    );
  }
  const subscription = await getAiSearchSubscriptionContext(session.user.id);
  if (!subscription.premium) {
    return NextResponse.json({ error: "Njord LLM krever et aktivt Premium-abonnement." }, { status: 403 });
  }
  if (!subscription.billingPeriod) {
    return NextResponse.json({ error: "Abonnementsperioden for Njord er ikke tilgjengelig." }, { status: 503 });
  }
  const reservationId = await reserveAiSearchUsage(session.user.id, subscription.billingPeriod);
  if (!reservationId) {
    return NextResponse.json({ error: "Tokenkvoten for Njord er brukt opp." }, { status: 429 });
  }
  const llm = new OpenAiLlmClient({ apiKey: env.openAiApiKey, model: env.openAiSearchModel });
  let result: Awaited<ReturnType<typeof runAgent>>;
  try {
    result = await runAgent({
      llm,
      tools: retrievalTools,
      systemPrompt: buildTargetReasoningPrompt({}),
      userQuery: query,
    });
    if (reservationId) {
      const observedAt = new Date();
      await finalizeAiSearchUsage(session.user.id, reservationId, {
        model: result.usage.model ?? env.openAiSearchModel,
        sourceSystem: "OPENAI",
        sourceEntityType: "chat.completion",
        sourceId: result.usage.sourceIds.join(",").slice(0, 500) || "unavailable",
        fetchedAt: observedAt,
        normalizedAt: observedAt,
        inputTokens: result.usage.inputTokens,
        cachedInputTokens: result.usage.cachedInputTokens,
        outputTokens: result.usage.outputTokens,
        usageTokens: calculateAiUsageTokens(result.usage),
      });
    }
  } catch (error) {
    if (reservationId) await releaseAiSearchUsage(session.user.id, reservationId);
    throw error;
  }

  // The companies the agent SURFACED (find_by_business matches, in its ranked order) become the
  // result table — the agent drives the Treffliste. The resolved subject is excluded: a company is
  // not its own acquisition candidate.
  const subjectOrgNumber =
    result.toolResults
      .filter((t) => t.name === "get_company_profile")
      .map((t) => (t.output as { profile?: { orgNumber?: string } } | null)?.profile?.orgNumber)
      .find((org): org is string => Boolean(org)) ?? null;

  const surfacedOrgNumbers = result.toolResults.flatMap((toolResult) => {
    if (toolResult.name === "find_by_business") {
      return (
        (toolResult.output as { matches?: Array<{ orgNumber: string }> } | null)?.matches ?? []
      ).map((match) => match.orgNumber);
    }
    if (toolResult.name === "get_chain_financials") {
      return (
        (toolResult.output as { operators?: Array<{ orgNumber: string }> } | null)?.operators ?? []
      ).map((operator) => operator.orgNumber);
    }
    return [];
  }).filter((org) => org !== subjectOrgNumber);

  const companies = await buildCompanySearchRows([...new Set(surfacedOrgNumbers)]);
  const visualization = buildNjordVisualization(query, result.toolResults);

  let quota = null;
  try {
    const usageStatus = await getAiSearchUsageStatus(
      session.user.id,
      subscription.premium,
      subscription.billingPeriod,
    );
    quota = {
      enabled: usageStatus.enabled,
      tokenLimit: usageStatus.tokenLimit,
      usedTokens: usageStatus.usedTokens,
      remainingTokens: usageStatus.remainingTokens,
      usagePercent: usageStatus.usagePercent,
      resetAt: usageStatus.billingPeriod?.resetAt.toISOString() ?? null,
    };
  } catch (error) {
    logRecoverableError("ai-search.getAiSearchUsageStatus", error, {
      userId: session.user.id,
    });
  }

  return NextResponse.json({
    answer: result.answer,
    visualization,
    companies,
    subjectOrgNumber,
    groundedOrgNumbers: result.groundedOrgNumbers,
    tools: result.invocations.map((i) => ({ name: i.name, ok: i.ok })),
    usage: result.usage,
    stopReason: result.stopReason,
    mode: "llm-tools-offline-knowledge",
    quota,
  });
}
