import { NextRequest, NextResponse } from "next/server";
import { AnnualReportReviewStatus } from "@prisma/client";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { listReviewQueue } from "@/server/services/annual-report-review-service";

const querySchema = z.object({
  status: z.array(z.nativeEnum(AnnualReportReviewStatus)).optional(),
  orgNumber: z.array(z.string()).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  ruleCode: z.array(z.string()).optional(),
  minQualityScore: z.coerce.number().min(0).max(1).optional(),
  maxQualityScore: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function readListParam(req: NextRequest, key: string) {
  return req.nextUrl.searchParams
    .getAll(key)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;
  void user;

  const parsed = querySchema.safeParse({
    status: readListParam(request, "status").length
      ? readListParam(request, "status")
      : undefined,
    orgNumber: readListParam(request, "orgNumber").length
      ? readListParam(request, "orgNumber")
      : undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    ruleCode: readListParam(request, "ruleCode").length
      ? readListParam(request, "ruleCode")
      : undefined,
    minQualityScore: request.nextUrl.searchParams.get("minQualityScore") ?? undefined,
    maxQualityScore: request.nextUrl.searchParams.get("maxQualityScore") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig forespørsel.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = await listReviewQueue({
      statuses: parsed.data.status,
      orgNumbers: parsed.data.orgNumber,
      fiscalYear: parsed.data.fiscalYear,
      ruleCodes: parsed.data.ruleCode,
      minQualityScore: parsed.data.minQualityScore,
      maxQualityScore: parsed.data.maxQualityScore,
      limit: parsed.data.limit,
    });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke hente review-kø." },
      { status: 500 },
    );
  }
}
