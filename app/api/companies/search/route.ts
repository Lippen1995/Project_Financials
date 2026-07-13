import { NextRequest, NextResponse } from "next/server";

import { searchCompanies } from "@/server/services/company-service";
import { searchRegistryCompanies } from "@/server/registry/entity-search-service";

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

  const searchResult = await searchCompanies({
    query,
    aiAssisted: searchParams.get("ai") === "1",
    industryCode: searchParams.get("industryCode") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    legalForm: searchParams.get("legalForm") ?? undefined,
    status,
  });

  return NextResponse.json({
    data: searchResult.results,
    interpretation: searchResult.interpretation,
  });
}
