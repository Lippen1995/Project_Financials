import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import { refreshAnnualReportFilingFromAdmin } from "@/server/services/admin-annual-report-refresh-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ filingId: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const routeIds = tryParseRouteIds(await params, ["filingId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid filing identifier." }, { status: 400 });
  }

  try {
    const { filingId } = routeIds;
    const result = await refreshAnnualReportFilingFromAdmin(filingId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke starte ny behandling." },
      { status: 500 },
    );
  }
}
