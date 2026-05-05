import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  approvePdfModelCandidateForShadow,
  PdfModelCandidateError,
} from "@/server/services/pdf-model-candidate-service";

const bodySchema = z.object({
  note: z.string().trim().max(2000).nullish(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { candidateId } = await params;
    const data = await approvePdfModelCandidateForShadow(candidateId, user.id, parsed.data.note);
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof PdfModelCandidateError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Could not approve candidate for shadow." }, { status: 400 });
  }
}
