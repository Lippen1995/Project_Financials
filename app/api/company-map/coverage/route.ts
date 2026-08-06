import { NextRequest, NextResponse } from "next/server";

import { companyMapCoverageQuerySchema as queryCompanyMapCoverageSchema } from "@/lib/company-map";
import {
  CompanyMapNotPublishedError,
  getPublishedCompanyMapCoverage,
} from "@/server/company-map/public-company-map-service";

export async function GET(request: NextRequest) {
  const query = queryCompanyMapCoverageSchema.safeParse(new URL(request.url).searchParams);
  if (!query.success) {
    return NextResponse.json({ error: "Invalid company-map filters." }, { status: 400 });
  }
  try {
    const data = await getPublishedCompanyMapCoverage(query.data);
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof CompanyMapNotPublishedError) {
      return NextResponse.json(
        { error: "Company-map data is being prepared and has not been published yet." },
        { status: 503, headers: { "Retry-After": "3600" } },
      );
    }
    throw error;
  }
}
