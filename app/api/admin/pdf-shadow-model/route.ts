import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { evaluatePdfDecisionShadowModel } from "@/server/services/pdf-decision-shadow-model-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: norwegianOrganizationNumberSchema.optional(),
  split: z.enum(["train", "validation", "test", "all"]).optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
    split: request.nextUrl.searchParams.get("split") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await evaluatePdfDecisionShadowModel(parsed.data);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Could not evaluate PDF Decision shadow model." },
      { status: 500 },
    );
  }
}
