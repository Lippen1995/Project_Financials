import { NextRequest, NextResponse } from "next/server";

import { getCompanyByReference, getCompanyRoles } from "@/server/services/company-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const company = await getCompanyByReference(slug);
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const roles = await getCompanyRoles(company.orgNumber);
  return NextResponse.json({ data: roles });
}
