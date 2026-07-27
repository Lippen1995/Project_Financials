import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const revalidate = 0;

import { tryParseCompanyReference } from "@/lib/api-input";
import { prisma } from "@/lib/prisma";
import { getCompanyEventTimeline } from "@/server/news/company-event-timeline-service";
import { getCompanyByReference } from "@/server/services/company-service";

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    minScore: z.coerce.number().finite().min(0).max(100).default(35),
    minExposure: z.coerce.number().finite().min(0).max(1).default(0.65),
  })
  .strict();

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const companyReferenceInput = tryParseCompanyReference(slug);
    if (!companyReferenceInput) {
      return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
    }

    const query = querySchema.safeParse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      minScore: request.nextUrl.searchParams.get("minScore") ?? undefined,
      minExposure: request.nextUrl.searchParams.get("minExposure") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json({ error: "Invalid event filters" }, { status: 400 });
    }

    const companyReference = await getCompanyByReference(companyReferenceInput);
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
      limit: query.data.limit,
      minInvestorValueScore: query.data.minScore,
      minExposureScore: query.data.minExposure,
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
