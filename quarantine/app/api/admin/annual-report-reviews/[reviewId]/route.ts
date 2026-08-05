import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import { getReviewDetail } from "@/server/services/annual-report-review-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;
  void user;

  const routeIds = tryParseRouteIds(await params, ["reviewId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Ugyldig review-ID." }, { status: 400 });
  }
  const { reviewId } = routeIds;

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
