import { NextRequest, NextResponse } from "next/server";

import { queryYearSchema, tryParseCompanyReference } from "@/lib/api-input";
import { rawFinancialsReader } from "@/server/financials/raw-financials-reader";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  if (!companyReference) {
    return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
  }

  const year = queryYearSchema.safeParse(request.nextUrl.searchParams.get("year"));
  if (!year.success) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const financials = await rawFinancialsReader.readCompany({
    companyReference,
    ...(year.data === undefined ? {} : { fiscalYear: year.data }),
  });
  if (!financials) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(financials);
}
