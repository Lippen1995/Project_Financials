import { NextRequest, NextResponse } from "next/server";

import {
  queryDateTimeSchema,
  tryParseCompanyReference,
  tryParseRouteIds,
} from "@/lib/api-input";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { getCompanyAnnouncementDetail, getCompanyByReference } from "@/server/services/company-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; announcementId: string }> },
) {
  const { slug, announcementId } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  const routeIds = tryParseRouteIds({ announcementId }, ["announcementId"] as const);
  if (!companyReference || !routeIds) {
    return NextResponse.json({ error: "Invalid route parameters" }, { status: 400 });
  }

  const parsedOrgNumber = norwegianOrganizationNumberSchema.safeParse(companyReference);
  const orgNumber =
    parsedOrgNumber.success
      ? parsedOrgNumber.data
      : (await getCompanyByReference(companyReference))?.orgNumber;

  if (!orgNumber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const publishedAt = queryDateTimeSchema.safeParse(
    request.nextUrl.searchParams.get("publishedAt"),
  );
  if (!publishedAt.success) {
    return NextResponse.json({ error: "Invalid publishedAt" }, { status: 400 });
  }

  const detail = await getCompanyAnnouncementDetail(
    orgNumber,
    routeIds.announcementId,
    publishedAt.data ?? null,
  );

  if (!detail) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  return NextResponse.json({ data: detail });
}
