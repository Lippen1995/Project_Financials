import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { buildPdfParserRemediationReport } from "@/server/services/pdf-parser-remediation-report-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: z.string().trim().min(1).max(20).optional(),
  maxExamples: z.coerce.number().int().min(1).max(20).optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
    maxExamples: request.nextUrl.searchParams.get("maxExamples") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await buildPdfParserRemediationReport({
      limit: parsed.data.limit,
      fiscalYear: parsed.data.fiscalYear,
      orgNumber: parsed.data.orgNumber,
      maxExamplesPerCluster: parsed.data.maxExamples,
    });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Could not build PDF parser remediation report." },
      { status: 500 },
    );
  }
}
