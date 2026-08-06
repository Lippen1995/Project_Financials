import { NextRequest, NextResponse } from "next/server";

import { companyMapCompaniesQuerySchema as queryCompanyMapCompaniesSchema } from "@/lib/company-map";
import {
  CompanyMapNotPublishedError,
  getPublishedCompanyMapCompanies,
} from "@/server/company-map/public-company-map-service";

export async function GET(request: NextRequest) {
  const query = queryCompanyMapCompaniesSchema.safeParse(
    new URL(request.url).searchParams,
  );
  if (!query.success) {
    return NextResponse.json(
      { error: "Invalid company-map filters." },
      { status: 400 },
    );
  }

  try {
    const data = await getPublishedCompanyMapCompanies(query.data);
    return NextResponse.json(
      { data },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof CompanyMapNotPublishedError) {
      return NextResponse.json(
        {
          error:
            "Company-map data is being prepared and has not been published yet.",
        },
        { status: 503, headers: { "Retry-After": "3600" } },
      );
    }
    throw error;
  }
}
