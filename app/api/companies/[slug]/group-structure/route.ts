import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

import { queryYearSchema, tryParseCompanyReference } from "@/lib/api-input";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { getCompanyByReference } from "@/server/services/company-service";
import { getCompanyOwnershipOverview } from "@/server/ownership/ownership-overview-service";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  if (!companyReference) {
    return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
  }

  const requestedYear = queryYearSchema.safeParse(request.nextUrl.searchParams.get("year"));
  if (!requestedYear.success) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const company = await getCompanyByReference(companyReference);
  // Ownership data covers every company in the register, not only those fetched into the
  // local Company table — so when the slug is a bare org number we serve it directly and
  // resolve the name from the register.
  const parsedOrgNumber = norwegianOrganizationNumberSchema.safeParse(companyReference);
  const orgNumber =
    company?.orgNumber ?? (parsedOrgNumber.success ? parsedOrgNumber.data : null);
  if (!orgNumber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await getCompanyOwnershipOverview({
    orgNumber,
    companyName: company?.name ?? null,
    requestedYear: requestedYear.data,
  });

  return NextResponse.json({ data });
}
