import { NextRequest, NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { answerNjordQuestion } from "@/server/distress/njord-assistant";
import { getDistressUniverseForWorkspace } from "@/server/services/distress-analysis-service";
import { z } from "zod";

const requestSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
  })
  .strict();

/**
 * Njord, the distress analyst assistant. It is answered by the deterministic rule engine in
 * njord-assistant.ts — ZERO API cost, no model call — matching how /api/ai-search runs on the
 * HeuristicLlmClient. GO-LIVE re-connect: to give Njord real reasoning, swap answerNjordQuestion
 * for a model adapter here and meter it the way the search page meters its quota. The grounding
 * context it would need is exactly the rows loaded below.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }

  const requestLimit = consumeRateLimit("njord-distress", session.user.id, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!requestLimit.allowed) {
    return NextResponse.json(
      { error: "For mange Njord-forespørsler. Prøv igjen senere." },
      { status: 429, headers: rateLimitHeaders(requestLimit) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }

  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Ugyldig spørsmål. Maksimal lengde er 2000 tegn." },
      { status: 400 },
    );
  }
  const question = parsedBody.data.question;

  const { workspaceId } = await context.params;

  // The whole universe, not the page the user happens to be looking at: "the five biggest" has to
  // mean the five biggest overall.
  const { rows, sectors } = await getDistressUniverseForWorkspace(session.user.id, workspaceId);
  const result = answerNjordQuestion({ question, rows, sectors });

  return NextResponse.json({ answer: result.answer, intent: result.intent });
}
