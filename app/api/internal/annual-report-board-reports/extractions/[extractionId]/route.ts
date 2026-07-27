import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import { getBoardReportExtraction } from "@/server/persistence/board-report-extraction-repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ extractionId: string }> },
) {
  const auth = await requireFinancialReviewer();
  if (auth.error) return auth.error;
  const routeIds = tryParseRouteIds(await context.params, ["extractionId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid extraction ID." }, { status: 400 });
  }
  const { extractionId } = routeIds;
  const data = await getBoardReportExtraction(extractionId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}
