import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { getReviewDetail } from "@/server/services/annual-report-review-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;
  void user;

  const { reviewId } = await params;

  try {
    const data = await getReviewDetail(reviewId);
    if (!data) {
      return NextResponse.json({ error: "Review ikke funnet." }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke hente review." },
      { status: 500 },
    );
  }
}
