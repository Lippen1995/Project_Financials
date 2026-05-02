import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { acceptAnnualReportReview } from "@/server/services/annual-report-review-service";

const bodySchema = z.object({
  notes: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const { reviewId } = await params;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig forespørsel.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await acceptAnnualReportReview(reviewId, user!.id, parsed.data.notes);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke godkjenne review." },
      { status: 500 },
    );
  }
}
