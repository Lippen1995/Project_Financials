import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { analysisService } from "@/server/analysis/analysis-service";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ analysisId: string; worklistId: string }>;
  },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }
  const { analysisId, worklistId } = await context.params;
  if (
    !analysisId ||
    analysisId.length > 128 ||
    !worklistId ||
    worklistId.length > 128
  ) {
    return NextResponse.json({ error: "Ugyldig analyse- eller arbeidsliste-ID." }, { status: 400 });
  }
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limit = request.nextUrl.searchParams.get("limit") ?? undefined;
  try {
    const result = await analysisService.listWorklistExclusions(
      session.user.id,
      analysisId,
      worklistId,
      { cursor, limit },
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Kunne ikke laste eksklusjonsgrunnlaget.";
    const status = error instanceof z.ZodError
      ? 400
      : message.includes("not found")
        ? 404
        : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
