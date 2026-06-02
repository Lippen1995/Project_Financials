import { NextRequest, NextResponse } from "next/server";

export const revalidate = 300;

import { prisma } from "@/lib/prisma";
import { getCompanyByReference } from "@/server/services/company-service";
import { getCompanyNewsWithRelevance } from "@/server/services/news-aggregator-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const limitParam = request.nextUrl.searchParams.get("limit");
    const afterParam = request.nextUrl.searchParams.get("after");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 30;
    const after = afterParam ? new Date(afterParam) : undefined;

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

    const articles = await getCompanyNewsWithRelevance(company.id, limit, after);
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
