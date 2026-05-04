import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { runDefaultPdfDecisionRuleTuningSimulation } from "@/server/services/pdf-decision-rule-tuning-simulation-service";

const querySchema = z.object({
  candidateSet: z.literal("default").optional(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    candidateSet: request.nextUrl.searchParams.get("candidateSet") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ data: runDefaultPdfDecisionRuleTuningSimulation() });
  } catch {
    return NextResponse.json(
      { error: "Could not run PDF Decision rule tuning simulation." },
      { status: 500 },
    );
  }
}
