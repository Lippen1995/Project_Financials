import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const revalidate = 300;

import { queryDateTimeSchema, tryParseCompanyReference } from "@/lib/api-input";
import { prisma } from "@/lib/prisma";
import { getCompanyByReference } from "@/server/services/company-service";
import { getCompanyNewsWithRelevance } from "@/server/services/news-aggregator-service";

const limitSchema = z.preprocess(
  (value) => value ?? 30,
  z.coerce.number().int().min(1).max(50),
);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const companyReferenceInput = tryParseCompanyReference(slug);
    if (!companyReferenceInput) {
      return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
    }

    const limit = limitSchema.safeParse(request.nextUrl.searchParams.get("limit"));
    const after = queryDateTimeSchema.safeParse(request.nextUrl.searchParams.get("after"));
    if (!limit.success || !after.success) {
      return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
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

    const articles = await getCompanyNewsWithRelevance(company.id, limit.data, after.data);
    return NextResponse.json({ data: articles });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load company news",
      },
      { status: 500 },
    );
  }
}
