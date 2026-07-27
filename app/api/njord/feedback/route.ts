import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { analysisService } from "@/server/analysis/analysis-service";

export async function POST(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }
  const rateLimit = consumeRateLimit("njord-feedback", session.user.id, {
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "For mange tilbakemeldinger. Prøv igjen senere." },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }
  try {
    const feedback = await analysisService.saveNjordFeedback(session.user.id, body);
    return NextResponse.json({ feedback });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke lagre tilbakemeldingen.";
    const status = error instanceof z.ZodError
      ? 400
      : message.includes("not found")
        ? 404
        : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
