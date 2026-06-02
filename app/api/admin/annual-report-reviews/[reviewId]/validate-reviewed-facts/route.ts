import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { validateReviewedAnnualReportFacts } from "@/server/services/annual-report-review-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;
  void user;

  const { reviewId } = await params;

  let overriddenRuleCodes: string[] | undefined;
  try {
    const body = (await request.json()) as { overriddenRuleCodes?: unknown };
    if (Array.isArray(body?.overriddenRuleCodes)) {
      overriddenRuleCodes = body.overriddenRuleCodes.filter(
        (c): c is string => typeof c === "string",
      );
    }
  } catch {
    // No/!JSON body — validate with no overrides.
  }

  try {
    const result = await validateReviewedAnnualReportFacts(reviewId, overriddenRuleCodes);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke validere reviewed facts." },
      { status: 500 },
    );
  }
}
