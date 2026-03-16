import { NextRequest, NextResponse } from "next/server";

import { getCompanyProfile, getCompanyRoles } from "@/server/services/company-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const profile = await getCompanyProfile(slug);

  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const roles = await getCompanyRoles(profile.company.orgNumber);
  return NextResponse.json({ data: roles });
}
