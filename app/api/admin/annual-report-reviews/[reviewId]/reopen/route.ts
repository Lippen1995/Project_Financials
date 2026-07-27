import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import {
  reopenAnnualReportReview,
  ReviewConflictError,
} from "@/server/services/annual-report-review-service";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const routeIds = tryParseRouteIds(await params, ["reviewId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid review identifier." }, { status: 400 });
  }

  try {
    const { reviewId } = routeIds;
    const result = await reopenAnnualReportReview(reviewId, user!.id);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ReviewConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke gjenåpne saken." },
      { status: 500 },
    );
  }
}
