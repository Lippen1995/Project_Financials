import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { logRecoverableError } from "@/lib/recoverable-error";
import { analysisReadService } from "@/server/analysis/analysis-read-service";
import { analysisService } from "@/server/analysis/analysis-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ analysisId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }
  const { analysisId } = await context.params;
  if (!analysisId || analysisId.length > 128) {
    return NextResponse.json({ error: "Ugyldig analyse-ID." }, { status: 400 });
  }
  try {
    const analysis = await analysisReadService.get(session.user.id, analysisId);
    if (!analysis) {
      return NextResponse.json({ error: "Analysen finnes ikke." }, { status: 404 });
    }
    return NextResponse.json({ analysis });
  } catch (error) {
    logRecoverableError("analyses.get", error, {
      userId: session.user.id,
      analysisId,
    });
    return NextResponse.json({ error: "Kunne ikke laste analysen." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ analysisId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }
  const { analysisId } = await context.params;
  if (!analysisId || analysisId.length > 128) {
    return NextResponse.json({ error: "Ugyldig analyse-ID." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }
  try {
    await analysisService.updateConclusion(session.user.id, analysisId, body);
    return NextResponse.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke oppdatere analysen.";
    const status = error instanceof z.ZodError
      ? 400
      : message.includes("not found")
        ? 404
        : message.includes("changed")
          ? 409
          : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
