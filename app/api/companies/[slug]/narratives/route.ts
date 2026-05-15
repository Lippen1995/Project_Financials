import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;

  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.annualReportNarrative.findMany({
    where: {
      companyId: company.id,
      ...(year !== null && !isNaN(year) ? { fiscalYear: year } : {}),
    },
    orderBy: [{ fiscalYear: "desc" }, { sectionKind: "asc" }],
    select: {
      id: true,
      fiscalYear: true,
      sectionKind: true,
      title: true,
      textPreview: true,
      fullText: true,
      pageStart: true,
      pageEnd: true,
      confidence: true,
      provenance: true,
    },
  });

  return NextResponse.json({ data: items });
}
