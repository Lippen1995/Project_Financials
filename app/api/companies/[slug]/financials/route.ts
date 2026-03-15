import { NextRequest, NextResponse } from "next/server";

import { getCompanyFinancials, getCompanyProfile } from "@/server/services/company-service";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const company = await getCompanyProfile(slug);

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const financials = await getCompanyFinancials(company.orgNumber);
  return NextResponse.json({ data: financials });
}