import { NextRequest, NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { logRecoverableError } from "@/lib/recoverable-error";
import { runAgent } from "@/server/ai-search/agent/agent-loop";
import { buildTargetReasoningPrompt } from "@/server/ai-search/agent/target-reasoning";
import { HeuristicLlmClient } from "@/server/ai-search/llm/heuristic-client";
import { retrievalTools } from "@/server/ai-search/tools";
import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";
import { getAiSearchUsageStatus } from "@/server/services/search-history-service";

/**
 * AI-search agent endpoint. Runs the Step-3 agent loop over the retrieval tools. For now it is
 * driven by the deterministic HeuristicLlmClient — ZERO API cost — so the whole UI works end-to-end
 * before any paid model is enabled. GO-LIVE re-connect: when `env.aiSearchBillingEnabled` is turned
 * on, swap HeuristicLlmClient for the real LlmClient adapter here AND wrap it in the
 * reserve/finalize/release token accounting from search-history-service (mirroring the search page),
 * so the subscription quota gate meters real usage. While billing is off there is nothing to meter,
 * so this only requires a signed-in session.
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

  const result = await runAgent({
    llm: new HeuristicLlmClient(),
    tools: retrievalTools,
    systemPrompt: buildTargetReasoningPrompt({}),
    userQuery: query,
  });

  let quota = null;
  try {
    const subscription = await getAiSearchSubscriptionContext(session.user.id);
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
    groundedOrgNumbers: result.groundedOrgNumbers,
    tools: result.invocations.map((i) => ({ name: i.name, ok: i.ok })),
    usage: result.usage,
    stopReason: result.stopReason,
    mode: "rule-based-zero-cost",
    quota,
  });
}
