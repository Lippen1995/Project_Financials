import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

import { prisma } from "@/lib/prisma";
import { getCompanyEventTimeline } from "@/server/news/company-event-timeline-service";
import { getCompanyByReference } from "@/server/services/company-service";

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const limit = boundedNumber(request.nextUrl.searchParams.get("limit"), 30, 1, 100);
    const minInvestorValueScore = boundedNumber(request.nextUrl.searchParams.get("minScore"), 0, 0, 100);
    const minExposureScore = boundedNumber(request.nextUrl.searchParams.get("minExposure"), 0.58, 0, 1);

    const companyReference = await getCompanyByReference(slug);
    if (!companyReference) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const company = await prisma.company.findUnique({
      where: { orgNumber: companyReference.orgNumber },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const timeline = await getCompanyEventTimeline(company.id, {
      limit,
      minInvestorValueScore,
      minExposureScore,
    });
    return NextResponse.json(timeline);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load company event timeline",
      },
      { status: 500 },
    );
  }
}
