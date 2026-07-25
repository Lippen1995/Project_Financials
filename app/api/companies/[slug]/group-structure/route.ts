import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { getCompanyByReference } from "@/server/services/company-service";
import { getCompanyOwnershipOverview } from "@/server/ownership/ownership-overview-service";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const yearParam = request.nextUrl.searchParams.get("year");
  const requestedYear = yearParam ? Number.parseInt(yearParam, 10) : undefined;

  const company = await getCompanyByReference(slug);
  // Ownership data covers every company in the register, not only those fetched into the
  // local Company table — so when the slug is a bare org number we serve it directly and
  // resolve the name from the register.
  const parsedOrgNumber = norwegianOrganizationNumberSchema.safeParse(slug);
  const orgNumber =
    company?.orgNumber ?? (parsedOrgNumber.success ? parsedOrgNumber.data : null);
  if (!orgNumber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await getCompanyOwnershipOverview({
    orgNumber,
    companyName: company?.name ?? null,
    requestedYear: Number.isInteger(requestedYear) ? requestedYear : undefined,
  });

  return NextResponse.json({ data });
}
