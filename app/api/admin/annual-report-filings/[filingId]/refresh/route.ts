import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { refreshAnnualReportFilingFromAdmin } from "@/server/services/admin-annual-report-refresh-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ filingId: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const { filingId } = await params;

  try {
    const result = await refreshAnnualReportFilingFromAdmin(filingId);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke starte ny behandling." },
      { status: 500 },
    );
  }
}
