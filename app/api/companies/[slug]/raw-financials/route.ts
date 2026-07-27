import { NextRequest, NextResponse } from "next/server";

import { queryYearSchema, tryParseCompanyReference } from "@/lib/api-input";
import { prisma } from "@/lib/prisma";
import env from "@/lib/env";

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
  if (env.betaStructuredFinancialsOnly) {
    return NextResponse.json({
      source: "structured-brreg-only",
      data: [],
      availability: {
        available: false,
        sourceSystem: "BRREG",
        message:
          "Detaljerte PDF- eller OCR-avledede regnskapslinjer er ikke tilgjengelige i betaen.",
      },
    });
  }

  const { slug } = await context.params;
  const companyReference = tryParseCompanyReference(slug);
  if (!companyReference) {
    return NextResponse.json({ error: "Invalid company reference" }, { status: 400 });
  }

  const year = queryYearSchema.safeParse(request.nextUrl.searchParams.get("year"));
  if (!year.success) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }
  const yearFilter = year.data !== undefined ? { fiscalYear: year.data } : {};

  const company = await prisma.company.findFirst({
    where: { OR: [{ slug: companyReference }, { orgNumber: companyReference }] },
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
