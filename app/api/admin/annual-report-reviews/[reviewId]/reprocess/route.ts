import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { reprocessAnnualReportReview } from "@/server/services/annual-report-review-service";

const bodySchema = z.object({
  reason: z.string().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const { reviewId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig forespørsel.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await reprocessAnnualReportReview(reviewId, user!.id, parsed.data.reason);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke sende til reprocessing." },
      { status: 500 },
    );
  }
}
