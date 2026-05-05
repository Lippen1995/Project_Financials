import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { buildPdfShadowVsRuleComparisonGateReport } from "@/server/services/pdf-shadow-vs-rule-comparison-gate-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: z.string().trim().min(1).max(20).optional(),
  split: z.enum(["train", "validation", "test", "all"]).optional(),
  minRecordCount: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
    split: request.nextUrl.searchParams.get("split") ?? undefined,
    minRecordCount: request.nextUrl.searchParams.get("minRecordCount") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig foresporsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await buildPdfShadowVsRuleComparisonGateReport(parsed.data);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Kunne ikke bygge gate-rapport." },
      { status: 500 },
    );
  }
}
