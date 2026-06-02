import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { saveReviewClientDraft } from "@/server/services/annual-report-review-service";

// The draft is an opaque client snapshot (editable facts, row edits, added
// rows, custom keys, text fields). We don't validate its internal shape — it
// is only rehydrated by the same client. Cap the size to avoid abuse.
const bodySchema = z.object({
  draft: z.unknown(),
});

const MAX_DRAFT_BYTES = 2_000_000; // 2 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const { reviewId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }

  const draft = parsed.data.draft ?? {};
  try {
    if (JSON.stringify(draft).length > MAX_DRAFT_BYTES) {
      return NextResponse.json({ error: "Utkastet er for stort." }, { status: 413 });
    }
  } catch {
    return NextResponse.json({ error: "Utkastet kunne ikke serialiseres." }, { status: 400 });
  }

  try {
    const result = await saveReviewClientDraft(reviewId, draft as object);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke lagre utkast." },
      { status: 500 },
    );
  }
}
