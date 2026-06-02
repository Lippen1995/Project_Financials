import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * "Som rapportert" line items for the company page.
 *
 * Precedence:
 *   1. PublishedFinancialLineItem — the authoritative, human-reviewed
 *      "as reported" figures. Written only by the review-publish flow and never
 *      touched by extraction, so these win whenever they exist.
 *   2. RawFinancialLineItem — the raw machine extraction, shown only when no
 *      reviewed data has been published for the company yet.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;
  const yearFilter = year !== null && !isNaN(year) ? { fiscalYear: year } : {};

  const company = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const published = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId: company.id, ...yearFilter },
    orderBy: [{ fiscalYear: "desc" }, { statementScope: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      fiscalYear: true,
      statementType: true,
      statementScope: true,
      metricKey: true,
      rawLabel: true,
      value: true,
      unitScale: true,
      sourcePage: true,
      sortOrder: true,
    },
  });

  if (published.length > 0) {
    return NextResponse.json({
      source: "published",
      data: published.map((item) => ({
        id: item.id,
        fiscalYear: item.fiscalYear,
        statementType: item.statementType,
        statementScope: item.statementScope,
        originalLabel: item.rawLabel ?? item.metricKey,
        originalValue: item.value !== null ? item.value.toString() : "",
        parsedValue: item.value !== null ? item.value.toString() : null,
        canonicalKey: item.metricKey,
        unitScale: item.unitScale,
        sourcePage: item.sourcePage,
        rowIndex: item.sortOrder,
        extractionRoute: "REVIEWED",
        confidence: 1,
      })),
    });
  }

  const items = await prisma.rawFinancialLineItem.findMany({
    where: { companyId: company.id, ...yearFilter },
    orderBy: [
      { fiscalYear: "desc" },
      { statementType: "asc" },
      { rowIndex: "asc" },
    ],
    select: {
      id: true,
      fiscalYear: true,
      statementType: true,
      statementScope: true,
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
    source: "raw",
    data: items.map((item) => ({
      ...item,
      parsedValue: item.parsedValue !== null ? item.parsedValue.toString() : null,
    })),
  });
}
