import { NextRequest, NextResponse } from "next/server";

import { searchCompanies } from "@/server/services/company-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const searchResult = await searchCompanies({
    query: searchParams.get("query") ?? undefined,
    industryCode: searchParams.get("industryCode") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    legalForm: searchParams.get("legalForm") ?? undefined,
    status:
      (searchParams.get("status") as "ACTIVE" | "DISSOLVED" | "BANKRUPT" | null) ?? undefined,
  });

  return NextResponse.json({
    data: searchResult.results,
    interpretation: searchResult.interpretation,
  });
}
