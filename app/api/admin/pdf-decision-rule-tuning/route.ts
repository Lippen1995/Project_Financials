import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { runDefaultPdfDecisionRuleTuningSimulation } from "@/server/services/pdf-decision-rule-tuning-simulation-service";

const querySchema = z.object({
  candidateSet: z.literal("default").optional(),
  family: z
    .enum([
      "CONSERVATIVE",
      "AGGRESSIVE",
      "OCR_SENSITIVE",
      "PAGE_HINT_SENSITIVE",
      "VALIDATION_SENSITIVE",
    ])
    .optional(),
  candidate: z.string().trim().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    candidateSet: request.nextUrl.searchParams.get("candidateSet") ?? undefined,
    family: request.nextUrl.searchParams.get("family") ?? undefined,
    candidate: request.nextUrl.searchParams.get("candidate") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = runDefaultPdfDecisionRuleTuningSimulation({
      family: parsed.data.family,
      candidateId: parsed.data.candidate,
    });
    if (parsed.data.candidate && data.candidates.length === 0) {
      return NextResponse.json({ error: "Unknown rule candidate." }, { status: 400 });
    }
    return NextResponse.json({
      data,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not run PDF Decision rule tuning simulation." },
      { status: 500 },
    );
  }
}
