import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCompanyNewsWithRelevance } from "@/server/services/news-aggregator-service";

export const revalidate = 0; // News is fetched live from DB; no caching at route level

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const afterParam = request.nextUrl.searchParams.get("after");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 30;
  const after = afterParam ? new Date(afterParam) : undefined;

  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const articles = await getCompanyNewsWithRelevance(company.id, limit, after);
  return NextResponse.json({ data: articles });
}
