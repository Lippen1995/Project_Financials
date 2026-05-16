import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getCompanyNews } from "@/server/services/news-aggregator-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 50) : 20;

  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const articles = await getCompanyNews(company.id, limit);
  return NextResponse.json({ data: articles });
}
