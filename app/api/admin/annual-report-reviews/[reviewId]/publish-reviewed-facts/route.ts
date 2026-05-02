import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { publishReviewedAnnualReportFacts } from "@/server/services/annual-report-review-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const { reviewId } = await params;

  try {
    const result = await publishReviewedAnnualReportFacts(reviewId, user!.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke publisere reviewed facts." },
      { status: 500 },
    );
  }
}
