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
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const items = await prisma.rawFinancialLineItem.findMany({
    where: {
      companyId: company.id,
      ...(year !== null && !isNaN(year) ? { fiscalYear: year } : {}),
    },
    orderBy: [
      { fiscalYear: "desc" },
      { statementType: "asc" },
      { rowIndex: "asc" },
    ],
    select: {
      id: true,
      fiscalYear: true,
      statementType: true,
      originalLabel: true,
      originalValue: true,
      parsedValue: true,
      canonicalKey: true,
      unitScale: true,
      sourcePage: true,
      rowIndex: true,
      extractionRoute: true,
      confidence: true,
    },
  });

  return NextResponse.json({
    data: items.map((item) => ({
      ...item,
      parsedValue: item.parsedValue !== null ? item.parsedValue.toString() : null,
    })),
  });
}
