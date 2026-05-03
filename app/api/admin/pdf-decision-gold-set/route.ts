import { NextRequest, NextResponse } from "next/server";
import {
  PdfDecisionGoldSetReason,
  PdfDecisionGoldSetStatus,
} from "@prisma/client";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  listPdfDecisionGoldSet,
  PdfDecisionGoldSetValidationError,
  upsertPdfDecisionGoldSetItem,
} from "@/server/services/pdf-decision-gold-set-service";

const querySchema = z.object({
  status: z.nativeEnum(PdfDecisionGoldSetStatus).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: z.string().trim().min(1).max(20).optional(),
});

const bodySchema = z.object({
  filingId: z.string().trim().min(1),
  extractionRunId: z.string().trim().min(1).nullable().optional(),
  orgNumber: z.string().trim().min(1).max(20).nullable().optional(),
  fiscalYear: z.number().int().nullable().optional(),
  status: z.nativeEnum(PdfDecisionGoldSetStatus),
  reason: z.nativeEnum(PdfDecisionGoldSetReason),
  note: z.string().max(2000).nullable().optional(),
  decisionRoute: z.string().nullable().optional(),
  riskLevel: z.string().nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  outcome: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await listPdfDecisionGoldSet(parsed.data);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "Kunne ikke hente gold-set." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await upsertPdfDecisionGoldSetItem({
      ...parsed.data,
      userId: user.id,
    });
    return NextResponse.json({ data });
  } catch (err) {
    if (err instanceof PdfDecisionGoldSetValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Kunne ikke lagre gold-set item." },
      { status: 500 },
    );
  }
}

