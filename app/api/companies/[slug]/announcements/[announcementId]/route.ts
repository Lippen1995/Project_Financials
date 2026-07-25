import { NextRequest, NextResponse } from "next/server";

import { isValidNorwegianOrganizationNumber } from "@/lib/norwegian-organization-number";
import { getCompanyAnnouncementDetail, getCompanyByReference } from "@/server/services/company-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; announcementId: string }> },
) {
  const { slug, announcementId } = await context.params;
  const orgNumberMatch = slug.match(/\d{9}/);
  const embeddedOrgNumber = orgNumberMatch?.[0];
  const orgNumber =
    embeddedOrgNumber && isValidNorwegianOrganizationNumber(embeddedOrgNumber)
      ? embeddedOrgNumber
      : (await getCompanyByReference(slug))?.orgNumber;

  if (!orgNumber) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const publishedAtParam = request.nextUrl.searchParams.get("publishedAt");
  const publishedAt = publishedAtParam ? new Date(publishedAtParam) : null;
  const detail = await getCompanyAnnouncementDetail(
    orgNumber,
    announcementId,
    publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
  );

  if (!detail) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  return NextResponse.json({ data: detail });
}
