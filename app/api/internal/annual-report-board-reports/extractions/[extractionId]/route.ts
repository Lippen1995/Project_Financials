import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { getBoardReportExtraction } from "@/server/persistence/board-report-extraction-repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ extractionId: string }> },
) {
  const auth = await requireFinancialReviewer();
  if (auth.error) return auth.error;
  const { extractionId } = await context.params;
  const data = await getBoardReportExtraction(extractionId);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}
