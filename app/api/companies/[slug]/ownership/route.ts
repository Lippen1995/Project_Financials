import { NextRequest, NextResponse } from "next/server";

import { getCompanyProfile } from "@/server/services/company-service";
import { getCompanyShareholdingOverview } from "@/server/shareholdings/shareholding-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const yearParam = request.nextUrl.searchParams.get("year");
  const requestedYear = yearParam ? Number.parseInt(yearParam, 10) : undefined;

  const profile = await getCompanyProfile(slug);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await getCompanyShareholdingOverview(profile.company.orgNumber, requestedYear);
  return NextResponse.json({ data });
}
