import { NextRequest, NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import env from "@/lib/env";
import { calculateAiUsageTokens } from "@/lib/ai-search-usage";
import { logRecoverableError } from "@/lib/recoverable-error";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { runAgent } from "@/server/ai-search/agent/agent-loop";
import { buildCompanySearchRows } from "@/server/ai-search/agent/company-rows";
import { buildTargetReasoningPrompt } from "@/server/ai-search/agent/target-reasoning";
import { buildNjordVisualization } from "@/server/ai-search/agent/visualization";
import { OpenAiLlmClient } from "@/server/ai-search/llm/openai-client";
import {
  buildSecureNjordSystemPrompt,
  estimateNjordCostNok,
  inspectNjordUserQuery,
  validateNjordActivation,
} from "@/server/ai-search/runtime-policy";
import { getRetrievalToolsForAccess } from "@/server/ai-search/tools";
import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";
import {
  finalizeAiSearchUsage,
  failAiSearchUsage,
  getAiSearchUsageStatus,
  reserveAiSearchUsage,
} from "@/server/services/search-history-service";
import { z } from "zod";

const requestSchema = z
  .object({
    query: z.string().trim().min(1).max(4_000),
  })
  .strict();

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

  const requestLimit = consumeRateLimit("njord-ai-search", session.user.id, {
    limit: 10,
    windowMs: 5 * 60_000,
  });
  if (!requestLimit.allowed) {
    return NextResponse.json(
      { error: "For mange Njord-forespørsler. Prøv igjen senere." },
      { status: 429, headers: rateLimitHeaders(requestLimit) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }

  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Ugyldig søk. Maksimal lengde er 4000 tegn." },
      { status: 400 },
    );
  }
  const query = parsedBody.data.query;

  const queryInspection = inspectNjordUserQuery(query);
  if (!queryInspection.allowed) {
    return NextResponse.json(
      {
        error:
          "Njord kan ikke hente hemmeligheter, interne instrukser eller omgå tilgangskontroll.",
        reason: queryInspection.reason,
      },
      { status: 400 },
    );
  }

  const realLlmEnabled = env.aiSearchBillingEnabled && Boolean(env.openAiApiKey);
  if (!realLlmEnabled) {
    return NextResponse.json(
      { error: "Njord LLM er ikke aktivert i dette miljøet." },
      { status: 503 },
    );
  }
  const activation = validateNjordActivation({
    enabled: env.aiSearchBillingEnabled,
    provider: env.njordProvider,
    apiKeyPresent: Boolean(env.openAiApiKey),
    inputNokPerMillion: env.njordInputNokPerMillion,
    outputNokPerMillion: env.njordOutputNokPerMillion,
    requestCostLimitNok: env.njordRequestCostLimitNok,
    monthlyCostLimitNok: env.njordMonthlyCostLimitNok,
    dailyRequestLimit: env.njordDailyRequestLimit,
  });
  if (!activation.ready) {
    logRecoverableError("ai-search.activation-preflight", new Error(activation.issues.join(" ")));
    return NextResponse.json(
      { error: "Njord er ikke aktivert med fullstendige kostnads- og sikkerhetsgrenser." },
      { status: 503 },
    );
  }
  const dailyLimit = consumeRateLimit("njord-ai-search-daily", session.user.id, {
    limit: env.njordDailyRequestLimit,
    windowMs: 24 * 60 * 60_000,
  });
  if (!dailyLimit.allowed) {
    return NextResponse.json(
      { error: "Dagsgrensen for Njord er brukt opp." },
      { status: 429, headers: rateLimitHeaders(dailyLimit) },
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
    return NextResponse.json(
      { error: "Kostnads- eller tokenkvoten for Njord er brukt opp." },
      { status: 429 },
    );
  }
  const pricing = {
    inputNokPerMillion: env.njordInputNokPerMillion,
    cachedInputNokPerMillion: env.njordCachedInputNokPerMillion,
    outputNokPerMillion: env.njordOutputNokPerMillion,
  };
  const llm = new OpenAiLlmClient({
    apiKey: env.openAiApiKey,
    model: env.openAiSearchModel,
    pricing,
    requestCostLimitNok: env.njordRequestCostLimitNok,
  });
  const tools = getRetrievalToolsForAccess({
    canUseDueDiligence: subscription.canUseDueDiligence,
    userQuery: query,
  });
  let result: Awaited<ReturnType<typeof runAgent>>;
  const startedAt = Date.now();
  let durationMs = 0;
  let estimatedCostNok = 0;
  try {
    result = await runAgent({
      llm,
      tools,
      systemPrompt: buildSecureNjordSystemPrompt(
        buildTargetReasoningPrompt({
          canUseDueDiligence: subscription.canUseDueDiligence,
        }),
      ),
      userQuery: query,
    });
    durationMs = Date.now() - startedAt;
    estimatedCostNok = estimateNjordCostNok(result.usage, pricing);
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
        estimatedCostNok,
        durationMs,
      });
    }
    if (estimatedCostNok > env.njordRequestCostLimitNok) {
      throw new Error("Njord request exceeded the configured cost limit.");
    }
  } catch (error) {
    if (reservationId) {
      await failAiSearchUsage(session.user.id, reservationId, {
        errorCode: "MODEL_UNAVAILABLE",
        durationMs: Date.now() - startedAt,
      });
    }
    logRecoverableError("ai-search.model-unavailable", error, {
      userId: session.user.id,
    });
    return NextResponse.json(
      {
        error:
          "Njord er midlertidig utilgjengelig. Selskapsdata og øvrige funksjoner fungerer fortsatt.",
      },
      { status: 503 },
    );
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
    answerKey: reservationId,
    answer: result.answer,
    visualization,
    companies,
    subjectOrgNumber,
    groundedOrgNumbers: result.groundedOrgNumbers,
    tools: result.invocations.map((i) => ({ name: i.name, ok: i.ok })),
    usage: result.usage,
    runtime: {
      durationMs,
      estimatedCostNok,
      requestCostLimitNok: env.njordRequestCostLimitNok,
    },
    evidence: result.toolResults.map((toolResult) => ({
      tool: toolResult.name,
      toolVersion: toolResult.toolVersion,
      kind: toolResult.outputKind,
      dataDomains: toolResult.dataDomains,
    })),
    stopReason: result.stopReason,
    mode: "llm-tools-offline-knowledge",
    capabilities: { mnaProForma: subscription.canUseDueDiligence },
    quota,
  });
}
