import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

import { tryParseCompanyReference } from "@/lib/api-input";
import { getCompanyByReference, getCompanyFinancials } from "@/server/services/company-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  if (!companyReference) {
    return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
  }

  const company = await getCompanyByReference(companyReference);
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const financials = await getCompanyFinancials(company.orgNumber);
  return NextResponse.json({ data: financials });
}
