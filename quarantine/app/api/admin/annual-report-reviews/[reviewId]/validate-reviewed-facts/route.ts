import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { validateReviewedAnnualReportFacts } from "@/server/services/annual-report-review-service";

const paramsSchema = z.object({ reviewId: z.string().trim().min(1).max(128) }).strict();
const requestSchema = z
  .object({
    overriddenRuleCodes: z
      .array(z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.:-]+$/))
      .max(100)
      .optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;
  void user;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig reviewId." }, { status: 400 });
  }
  const { reviewId } = parsedParams.data;

  let parsedBody: z.infer<typeof requestSchema>;
  try {
    const rawBody = await request.text();
    const result = requestSchema.safeParse(rawBody.trim() ? JSON.parse(rawBody) : {});
    if (!result.success) {
      return NextResponse.json({ error: "Ugyldige valideringsoverstyringer." }, { status: 400 });
    }
    parsedBody = result.data;
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  try {
    const result = await validateReviewedAnnualReportFacts(
      reviewId,
      parsedBody.overriddenRuleCodes,
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke validere reviewed facts." },
      { status: 500 },
    );
  }
}
