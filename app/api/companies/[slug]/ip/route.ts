import { NextResponse } from "next/server";

import { getCompanyByReference } from "@/server/services/company-service";
import { getCompanyIPOverview, getCompanyIPPortfolio } from "@/server/services/company-ip-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const orgNumberMatch = slug.match(/\d{9}/);
  const orgNumber = orgNumberMatch?.[0] ?? (await getCompanyByReference(slug))?.orgNumber;

  if (!orgNumber) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const [rights, overview] = await Promise.all([
      getCompanyIPPortfolio(orgNumber),
      getCompanyIPOverview(orgNumber),
    ]);

    return NextResponse.json({
      data: {
        rights,
        overview,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load IP portfolio" }, { status: 502 });
  }
}
