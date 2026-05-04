import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { buildPdfRouteRecommendationExperimentReport } from "@/server/services/pdf-route-recommendation-experiment-service";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: z.string().trim().min(1).max(20).optional(),
  includeLowPriority: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
    includeLowPriority: request.nextUrl.searchParams.get("includeLowPriority") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await buildPdfRouteRecommendationExperimentReport({
      limit: parsed.data.limit,
      fiscalYear: parsed.data.fiscalYear,
      orgNumber: parsed.data.orgNumber,
      includeLowPriority: parsed.data.includeLowPriority,
    });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Could not build PDF route recommendation experiment report." },
      { status: 500 },
    );
  }
}
