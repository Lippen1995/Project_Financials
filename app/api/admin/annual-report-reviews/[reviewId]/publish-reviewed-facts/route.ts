import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { finalizeAnnualReportReviewAndPublish } from "@/server/services/annual-report-review-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const { reviewId } = await params;

  // Optional list of validation rule codes the reviewer chose to override for
  // this publish (e.g. while the metric-mapping rule set is still WIP). Body is
  // optional, so a malformed/empty body is treated as "no overrides".
  let overriddenRuleCodes: string[] | undefined;
  try {
    const body = (await request.json()) as { overriddenRuleCodes?: unknown };
    if (Array.isArray(body?.overriddenRuleCodes)) {
      overriddenRuleCodes = body.overriddenRuleCodes.filter(
        (c): c is string => typeof c === "string",
      );
    }
  } catch {
    // No/!JSON body — proceed with no overrides.
  }

  try {
    const result = await finalizeAnnualReportReviewAndPublish({
      reviewId,
      reviewerUserId: user!.id,
      overriddenRuleCodes,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke publisere reviewed facts." },
      { status: 500 },
    );
  }
}
