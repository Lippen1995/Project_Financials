import { NextResponse } from "next/server";

import { requireFinancialReviewer } from "@/lib/admin-auth";
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

  const { filingId } = await params;

  try {
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

