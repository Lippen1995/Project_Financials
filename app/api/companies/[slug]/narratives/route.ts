import { NextRequest, NextResponse } from "next/server";

import { queryYearSchema, tryParseCompanyReference } from "@/lib/api-input";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  if (!companyReference) {
    return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
  }

  const year = queryYearSchema.safeParse(request.nextUrl.searchParams.get("year"));
  if (!year.success) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const company = await prisma.company.findFirst({
    where: { OR: [{ slug: companyReference }, { orgNumber: companyReference }] },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await prisma.annualReportNarrative.findMany({
    where: {
      companyId: company.id,
      ...(year.data !== undefined ? { fiscalYear: year.data } : {}),
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
