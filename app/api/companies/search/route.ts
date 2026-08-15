import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import env from "@/lib/env";
import {
  consumeRateLimit,
  getClientAddress,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { getAiSearchSubscriptionContext } from "@/server/billing/subscription";
import {
  calculateMaxAffordableOutputTokens,
  calculateUsageCost,
} from "@/server/ai-economics/domain";
import { getAiRuntimeEconomicsConfig } from "@/server/services/admin-ai-economics-service";
import { searchCompanies } from "@/server/services/company-service";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import {
  failAiSearchUsage,
  finalizeAiSearchUsage,
  recordCompanySearch,
  releaseAiSearchUsage,
  reserveAiSearchUsage,
} from "@/server/services/search-history-service";

const optionalString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z.string().max(max).optional(),
  );

const searchParamsSchema = z.object({
  query: optionalString(200),
  status: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.enum(["ACTIVE", "DISSOLVED", "BANKRUPT"]).optional(),
  ),
  mode: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.literal("typeahead").optional(),
  ),
  limit: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.coerce.number().int().min(1).max(50).optional(),
  ),
  ai: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z.enum(["0", "1"]).optional(),
  ),
  industryCode: optionalString(20),
  city: optionalString(120),
  legalForm: optionalString(20),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestLimit = consumeRateLimit(
    "company-search",
    getClientAddress(request.headers),
    { limit: 60, windowMs: 60_000 },
  );
  if (!requestLimit.allowed) {
    return NextResponse.json(
      { error: "For mange søk. Prøv igjen om litt." },
      { status: 429, headers: rateLimitHeaders(requestLimit) },
    );
  }

  const parsedParams = searchParamsSchema.safeParse({
    query: searchParams.get("query"),
    status: searchParams.get("status"),
    mode: searchParams.get("mode"),
    limit: searchParams.get("limit"),
    ai: searchParams.get("ai"),
    industryCode: searchParams.get("industryCode"),
    city: searchParams.get("city"),
    legalForm: searchParams.get("legalForm"),
  });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldige søkeparametere." }, { status: 400 });
  }

  const {
    query,
    status,
    mode,
    limit,
    ai,
    industryCode,
    city,
    legalForm,
  } = parsedParams.data;

  // Typeahead mode: the nav search and watchlist quick-add only need name/org-number
  // matches, so hit the local entity mirror directly and skip the natural-language
  // interpretation layer (SSB industry/geography) that the full /search page uses.
  if (mode === "typeahead") {
    const companies = await searchRegistryCompanies({
      query,
      status,
      size: limit ?? 8,
    });
    return NextResponse.json({
      data: companies.map((company) => ({ company, relevanceScore: 1, matchReasons: [] })),
    });
  }

  const aiRequested = ai === "1";
  const session = aiRequested ? await safeAuth() : null;
  if (aiRequested && !session?.user?.id) {
    return NextResponse.json(
      { error: "AI-søk krever et aktivt Premium-abonnement." },
      { status: 403 },
    );
  }
  const economics = aiRequested ? await getAiRuntimeEconomicsConfig() : null;
  if (aiRequested && (!env.aiSearchBillingEnabled || !economics?.runtimeEnabled)) {
    return NextResponse.json(
      { error: "AI-søk er pauset eller mangler økonomikonfigurasjon i admin." },
      { status: 503 },
    );
  }
  const maxAiOutputTokens = economics
    ? calculateMaxAffordableOutputTokens({
        requestCostLimitNok: economics.requestCostLimitNok,
        inputPricePerMillion: economics.inputPricePerMillion,
        outputPricePerMillion: economics.outputPricePerMillion,
        exchangeRateNok: economics.exchangeRateNok,
        fxRiskBufferBps: economics.fxRiskBufferBps,
        reservedInputTokens: 2_000,
        providerMaximumOutputTokens: 500,
      })
    : 0;
  if (aiRequested && maxAiOutputTokens < 1) {
    return NextResponse.json(
      { error: "Kostnadsgrensen per AI-kall er for lav for et sikkert søk." },
      { status: 429 },
    );
  }
  const subscription = session?.user?.id
    ? await getAiSearchSubscriptionContext(session.user.id, new Date(), economics)
    : null;
  if (aiRequested && !subscription?.premium) {
    return NextResponse.json({ error: "AI-søk krever et aktivt Premium-abonnement." }, { status: 403 });
  }
  if (aiRequested && !subscription?.billingPeriod) {
    return NextResponse.json(
      { error: "Abonnementsperioden for AI-søk er ikke tilgjengelig." },
      { status: 503 },
    );
  }
  const reservationId = aiRequested && session?.user?.id && subscription?.billingPeriod
    ? await reserveAiSearchUsage(session.user.id, subscription.billingPeriod, {
        settingsVersion: economics?.version ?? 0,
        planEconomicsVersion: subscription.planEconomicsVersion,
        usageCategory: subscription.usageCategory,
        appRole: subscription.appRole,
        subscriptionPlan: subscription.subscriptionPlan,
        subscriptionStatus: subscription.subscriptionStatus,
        subscriptionUpdatedAt: subscription.subscriptionUpdatedAt,
      })
    : null;
  if (aiRequested && !reservationId) {
    return NextResponse.json(
      { error: "Kostnads-, dags- eller tokenrammen for AI-søk er brukt opp." },
      { status: 429 },
    );
  }

  let usageFinalized = false;
  let usageClosureAttempted = false;
  let searchResult: Awaited<ReturnType<typeof searchCompanies>>;
  try {
    searchResult = await searchCompanies(
      { query, aiAssisted: aiRequested, industryCode, city, legalForm, status },
      {
        maxAiOutputTokens: aiRequested ? maxAiOutputTokens : undefined,
        onAiUsage: async (usage) => {
          if (session?.user?.id && reservationId) {
            const cost = economics
              ? calculateUsageCost(usage, economics)
              : null;
            usageClosureAttempted = true;
            await finalizeAiSearchUsage(session.user.id, reservationId, {
              ...usage,
              estimatedCostNok: cost?.estimatedCostNok,
              providerCurrency: economics?.billingCurrency,
              providerCostAmount: cost?.providerCost,
              exchangeRateNok: economics?.exchangeRateNok,
              fxRiskBufferBps: economics?.fxRiskBufferBps,
              budgetedCostNok: cost?.budgetedCostNok,
            });
            usageFinalized = true;
          }
        },
        onAiUsageFailure: async (errorCode) => {
          if (session?.user?.id && reservationId) {
            usageClosureAttempted = true;
            await failAiSearchUsage(session.user.id, reservationId, {
              errorCode,
              durationMs: 0,
              retainReservation: true,
            });
            usageFinalized = true;
          }
        },
      },
    );
  } finally {
    if (
      session?.user?.id &&
      reservationId &&
      !usageFinalized &&
      !usageClosureAttempted
    ) {
      await releaseAiSearchUsage(session.user.id, reservationId);
    }
  }

  if (aiRequested && session?.user?.id) {
    await recordCompanySearch({
      userId: session.user.id,
      query,
      industryCode,
      city,
      legalForm,
      status,
      aiAssisted: true,
      resultCount: searchResult.results.length,
      succeeded: true,
      sectors: searchResult.interpretation.matchedIndustryCodes.map((sector) => ({
        code: sector.code,
        title: sector.title ?? null,
      })),
    });
  }

  return NextResponse.json({
    data: searchResult.results,
    interpretation: searchResult.interpretation,
  });
}
