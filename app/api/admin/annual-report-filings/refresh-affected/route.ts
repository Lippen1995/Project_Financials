import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { refreshAffectedAnnualReportFilingsFromAdmin } from "@/server/services/admin-annual-report-refresh-service";

export async function POST() {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  try {
    const result = await refreshAffectedAnnualReportFilingsFromAdmin();
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke starte ny behandling." },
      { status: 500 },
    );
  }
}
