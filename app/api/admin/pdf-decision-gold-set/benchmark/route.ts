import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { runPdfDecisionGoldSetBenchmark } from "@/server/services/pdf-decision-gold-set-benchmark-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  status: z.enum(["APPROVED", "CANDIDATE", "ALL"]).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: norwegianOrganizationNumberSchema.optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig foresporsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await runPdfDecisionGoldSetBenchmark(parsed.data);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Kunne ikke kjore gold-set benchmark." },
      { status: 500 },
    );
  }
}
