import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

import { queryYearSchema, tryParseCompanyReference } from "@/lib/api-input";
import { getCompanyByReference } from "@/server/services/company-service";
import { getCompanyShareholdingOverview } from "@/server/shareholdings/shareholding-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  if (!companyReference) {
    return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
  }

  const requestedYear = queryYearSchema.safeParse(request.nextUrl.searchParams.get("year"));
  if (!requestedYear.success) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const company = await getCompanyByReference(companyReference);
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await getCompanyShareholdingOverview(company.orgNumber, requestedYear.data);
  return NextResponse.json({ data });
}
