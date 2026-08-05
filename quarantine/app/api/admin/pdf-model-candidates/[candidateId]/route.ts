import { NextRequest, NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import {
  getPdfModelCandidateDetail,
} from "@/server/services/pdf-model-candidate-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const routeIds = tryParseRouteIds(await params, ["candidateId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid candidate ID." }, { status: 400 });
  }
  const { candidateId } = routeIds;
  const data = await getPdfModelCandidateDetail(candidateId);
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ data });
}
