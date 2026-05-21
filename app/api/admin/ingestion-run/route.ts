/**
 * GET /api/admin/ingestion-run
 *
 * Returns the ingestion run that should drive the admin background-activity
 * indicator: the active RUNNING run if one exists, otherwise the most recent
 * run. The UI polls this so administrators can see bulk ingestion progress
 * without watching a terminal.
 *
 * Authentication: requires FINANCIAL_REVIEWER role.
 */
import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { getCurrentIngestionRun } from "@/server/services/ingestion-run-service";

export async function GET() {
  const auth = await requireFinancialReviewer();
  if (auth.error) {
    return auth.error;
  }

  const run = await getCurrentIngestionRun();
  return NextResponse.json({ run });
}
