import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { listPdfDecisionActiveLearningQueue } from "@/server/services/pdf-decision-active-learning-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: z.string().trim().min(1).max(20).optional(),
  includeCurated: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
    includeCurated: request.nextUrl.searchParams.get("includeCurated") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig foresporsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await listPdfDecisionActiveLearningQueue(parsed.data);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Kunne ikke hente active-learning queue." },
      { status: 500 },
    );
  }
}
