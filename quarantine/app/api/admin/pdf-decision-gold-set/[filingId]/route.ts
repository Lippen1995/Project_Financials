import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import {
  PdfDecisionGoldSetValidationError,
  removePdfDecisionGoldSetItem,
} from "@/server/services/pdf-decision-gold-set-service";

export async function DELETE(
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
    await removePdfDecisionGoldSetItem(filingId);
    return NextResponse.json({ data: { filingId, removed: true } });
  } catch (err) {
    if (err instanceof PdfDecisionGoldSetValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Kunne ikke fjerne gold-set item." },
      { status: 500 },
    );
  }
}

