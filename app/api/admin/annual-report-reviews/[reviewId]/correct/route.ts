import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { correctAnnualReportReview, ReviewConflictError } from "@/server/services/annual-report-review-service";

const factSchema = z.object({
  metricKey: z.string(),
  sourceMetricKey: z.string().nullable().optional(),
  fiscalYear: z.number().int(),
  value: z.string().regex(/^-?[0-9]+$/).nullable(),
  rawLabel: z.string().nullable().optional(),
  sourcePage: z.number().int().nullable().optional(),
  unitScale: z.number().nullable().optional(),
  confidenceScore: z.number().min(0).max(1).nullable().optional(),
  // Per-fact konsern/selskap scope. When omitted the review's primary scope
  // is used. Lets a reviewer add a row of the OTHER scope than the review's
  // primary one (e.g. a selskap line inside a konsern review).
  statementScope: z.enum(["COMPANY", "CONSOLIDATED"]).optional(),
  // Per-fact statement bucket. The client knows which section table a row
  // belongs to, so it sends this directly. When omitted the server falls back
  // to metric-key inference (which mis-buckets custom/unmapped keys).
  statementType: z.enum(["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW", "NOTE"]).optional(),
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
    // Metric keys the reviewer explicitly deleted. The machine-extracted fact
    // for each of these keys is dropped instead of carried over as
    // ACCEPTED_MACHINE — used when the model produced a spurious row.
    deletedMetricKeys: z.array(z.string()).optional(),
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
    if (err instanceof ReviewConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke lagre korrigeringer." },
      { status: 500 },
    );
  }
}
