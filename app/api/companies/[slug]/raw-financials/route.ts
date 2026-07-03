import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Public "as reported" line items for the company page.
 *
 * Only PublishedFinancialLineItem is exposed here. Machine extraction writes to
 * that store after document-level gates pass; reviewed rows win per fiscal year,
 * statement type and scope when present.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const yearParam = request.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;
  const yearFilter = year !== null && !isNaN(year) ? { fiscalYear: year } : {};

  const company = await prisma.company.findFirst({
    where: { OR: [{ slug }, { orgNumber: slug }] },
    select: { id: true },
  });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const published = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId: company.id, ...yearFilter },
    orderBy: [
      { fiscalYear: "desc" },
      { statementScope: "asc" },
      { statementType: "asc" },
      { sortOrder: "asc" },
    ],
    select: {
      id: true,
      fiscalYear: true,
      statementType: true,
      statementScope: true,
      metricKey: true,
      rawLabel: true,
      originalLabel: true,
      originalValue: true,
      parsedValue: true,
      value: true,
      unitScale: true,
      sourcePage: true,
      sortOrder: true,
      publicationSource: true,
      sourceSystem: true,
      sourceEntityType: true,
      sourceId: true,
      sourceExtractionRunId: true,
      extractionRoute: true,
      confidence: true,
      fetchedAt: true,
      normalizedAt: true,
      publishedAt: true,
    },
  });

  const groupsWithReview = new Set(
    published
      .filter((item) => item.publicationSource === "MANUAL_REVIEW")
      .map((item) => `${item.fiscalYear}:${item.statementType}:${item.statementScope}`),
  );
  const visible = published.filter(
    (item) =>
      item.publicationSource === "MANUAL_REVIEW" ||
      !groupsWithReview.has(`${item.fiscalYear}:${item.statementType}:${item.statementScope}`),
  );

  return NextResponse.json({
    source: "published",
    data: visible.map((item) => ({
      id: item.id,
      fiscalYear: item.fiscalYear,
      statementType: item.statementType,
      statementScope: item.statementScope,
      originalLabel: item.originalLabel ?? item.rawLabel ?? item.metricKey ?? "",
      originalValue:
        item.originalValue ??
        (item.value !== null ? item.value.toString() : ""),
      parsedValue:
        item.parsedValue !== null
          ? item.parsedValue.toString()
          : item.value !== null
            ? item.value.toString()
            : null,
      canonicalKey: item.metricKey,
      unitScale: item.unitScale,
      sourcePage: item.sourcePage,
      rowIndex: item.sortOrder,
      extractionRoute: item.extractionRoute,
      confidence: item.confidence,
      publicationSource: item.publicationSource,
      sourceSystem: item.sourceSystem,
      sourceEntityType: item.sourceEntityType,
      sourceId: item.sourceId,
      sourceExtractionRunId: item.sourceExtractionRunId,
      fetchedAt: item.fetchedAt,
      normalizedAt: item.normalizedAt,
      publishedAt: item.publishedAt,
    })),
  });
}
