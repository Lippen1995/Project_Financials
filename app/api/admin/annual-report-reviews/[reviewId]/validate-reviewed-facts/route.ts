import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { validateReviewedAnnualReportFacts } from "@/server/services/annual-report-review-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;
  void user;

  const { reviewId } = await params;

  try {
    const result = await validateReviewedAnnualReportFacts(reviewId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke validere reviewed facts." },
      { status: 500 },
    );
  }
}
