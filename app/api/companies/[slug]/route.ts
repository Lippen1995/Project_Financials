import { NextRequest, NextResponse } from "next/server";

import { tryParseCompanyReference } from "@/lib/api-input";
import { getCompanyProfile } from "@/server/services/company-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  if (!companyReference) {
    return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
  }

  const profile = await getCompanyProfile(companyReference);

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: profile });
}
