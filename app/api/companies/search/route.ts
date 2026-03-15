import { NextRequest, NextResponse } from "next/server";

import { searchCompanies } from "@/server/services/company-service";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companies = await searchCompanies({
    query: searchParams.get("query") ?? undefined,
    industryCode: searchParams.get("industryCode") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    status: (searchParams.get("status") as "ACTIVE" | "DISSOLVED" | "BANKRUPT" | null) ?? undefined,
    minRevenue: searchParams.get("minRevenue") ? Number(searchParams.get("minRevenue")) : undefined,
    minEmployees: searchParams.get("minEmployees") ? Number(searchParams.get("minEmployees")) : undefined,
  });

  return NextResponse.json({ data: companies });
}