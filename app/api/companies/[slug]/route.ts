import { NextRequest, NextResponse } from "next/server";

import { getCompanyProfile } from "@/server/services/company-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const profile = await getCompanyProfile(slug);

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: profile });
}
