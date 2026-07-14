import { NextRequest, NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { hasPremiumAiSearchAccess } from "@/lib/ai-search-usage";
import { searchCompanies } from "@/server/services/company-service";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";
import {
  finalizeAiSearchUsage,
  recordCompanySearch,
  releaseAiSearchUsage,
  reserveAiSearchUsage,
} from "@/server/services/search-history-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? undefined;
  const status =
    (searchParams.get("status") as "ACTIVE" | "DISSOLVED" | "BANKRUPT" | null) ?? undefined;

  // Typeahead mode: the nav search and watchlist quick-add only need name/org-number
  // matches, so hit the local entity mirror directly and skip the natural-language
  // interpretation layer (SSB industry/geography) that the full /search page uses.
  if (searchParams.get("mode") === "typeahead") {
    const limitParam = searchParams.get("limit");
    const size = limitParam ? Number(limitParam) : 8;
    const companies = await searchRegistryCompanies({
      query,
      status,
      size: Number.isNaN(size) ? 8 : size,
    });
    return NextResponse.json({
      data: companies.map((company) => ({ company, relevanceScore: 1, matchReasons: [] })),
    });
  }

  const aiRequested = searchParams.get("ai") === "1";
  const session = aiRequested ? await safeAuth() : null;
  const premium = hasPremiumAiSearchAccess(
    session?.user?.subscriptionStatus,
    session?.user?.subscriptionPlan,
  );
  if (aiRequested && (!session?.user?.id || !premium)) {
    return NextResponse.json({ error: "AI-søk krever et aktivt Premium-abonnement." }, { status: 403 });
  }
  const reservationId = aiRequested && session?.user?.id
    ? await reserveAiSearchUsage(session.user.id)
    : null;
  if (aiRequested && !reservationId) {
    return NextResponse.json({ error: "Tokenkvoten for AI-søk er brukt opp." }, { status: 429 });
  }

  const industryCode = searchParams.get("industryCode") ?? undefined;
  const city = searchParams.get("city") ?? undefined;
  const legalForm = searchParams.get("legalForm") ?? undefined;
  let usageFinalized = false;
  let searchResult: Awaited<ReturnType<typeof searchCompanies>>;
  try {
    searchResult = await searchCompanies(
      { query, aiAssisted: aiRequested, industryCode, city, legalForm, status },
      {
        onAiUsage: async (usage) => {
          if (session?.user?.id && reservationId) {
            await finalizeAiSearchUsage(session.user.id, reservationId, usage);
            usageFinalized = true;
          }
        },
      },
    );
  } finally {
    if (session?.user?.id && reservationId && !usageFinalized) {
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
