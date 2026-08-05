import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { parseRouteIds } from "@/lib/api-input";
import { reviewBoardReportExtraction } from "@/server/persistence/board-report-extraction-repository";

const reviewSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  reason: z.string().trim().max(2_000).nullable().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ extractionId: string }> },
) {
  const auth = await requireFinancialReviewer();
  if (auth.error) return auth.error;
  try {
    const { extractionId } = parseRouteIds(
      await context.params,
      ["extractionId"] as const,
    );
    const input = reviewSchema.parse(await request.json());
    const reviewed = await reviewBoardReportExtraction({
      extractionId,
      reviewerUserId: auth.user.id,
      decision: input.decision,
      reason: input.reason,
    });
    return NextResponse.json({ data: reviewed });
  } catch (error) {
    const validationError = error instanceof z.ZodError;
    return NextResponse.json(
      {
        error: {
          code: validationError ? "INVALID_REVIEW_REQUEST" : "BOARD_REPORT_REVIEW_FAILED",
          message: error instanceof Error ? error.message : "Board-report review failed.",
        },
      },
      { status: validationError ? 400 : 500 },
    );
  }
}
