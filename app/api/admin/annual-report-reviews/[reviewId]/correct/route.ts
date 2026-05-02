import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { correctAnnualReportReview } from "@/server/services/annual-report-review-service";

const factSchema = z.object({
  metricKey: z.string(),
  fiscalYear: z.number().int(),
  value: z.number().nullable(),
  rawLabel: z.string().nullable().optional(),
  sourcePage: z.number().int().nullable().optional(),
  unitScale: z.number().nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
});

const sectionSchema = z.object({
  sectionType: z.string(),
  startPage: z.number().int().optional(),
  endPage: z.number().int().optional(),
  text: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
});

const auditorOpinionSchema = z.object({
  opinionType: z.enum(["CLEAN", "QUALIFIED", "ADVERSE", "DISCLAIMER", "UNKNOWN"]),
  hasGoingConcernEmphasis: z.boolean().optional(),
  hasEmphasisOfMatter: z.boolean().optional(),
  conclusionText: z.string().nullable().optional(),
  auditorName: z.string().nullable().optional(),
  auditorFirm: z.string().nullable().optional(),
  signedDate: z.string().nullable().optional(),
});

const bodySchema = z.object({
  corrections: z.object({
    facts: z.array(factSchema).optional(),
    sections: z.array(sectionSchema).optional(),
    auditorOpinion: auditorOpinionSchema.optional(),
    failureReason: z.string().optional(),
  }),
  notes: z.string().max(2000).optional(),
  overrideReason: z.string().max(2000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
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
    return NextResponse.json({ error: "Ugyldig forespørsel.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await correctAnnualReportReview(
      reviewId,
      user!.id,
      parsed.data.corrections,
      parsed.data.notes,
      parsed.data.overrideReason,
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke lagre korrigeringer." },
      { status: 500 },
    );
  }
}
