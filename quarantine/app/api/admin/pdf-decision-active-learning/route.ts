import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { listPdfDecisionActiveLearningQueue } from "@/server/services/pdf-decision-active-learning-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: norwegianOrganizationNumberSchema.optional(),
  includeCurated: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  minPriority: z.coerce.number().int().min(0).max(100).optional(),
  priorityBand: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  investigationArea: z.enum(["PARSER", "OCR_ODL", "VALIDATION", "REVIEW_LABELS", "NONE"]).optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
    includeCurated: request.nextUrl.searchParams.get("includeCurated") ?? undefined,
    minPriority: request.nextUrl.searchParams.get("minPriority") ?? undefined,
    priorityBand: request.nextUrl.searchParams.get("priorityBand") ?? undefined,
    investigationArea: request.nextUrl.searchParams.get("investigationArea") ?? undefined,
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
