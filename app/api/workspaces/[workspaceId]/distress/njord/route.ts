import { NextRequest, NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { answerNjordQuestion } from "@/server/distress/njord-assistant";
import { getDistressUniverseForWorkspace } from "@/server/services/distress-analysis-service";

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

  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Tomt spørsmål." }, { status: 400 });
  }

  const { workspaceId } = await context.params;

  // The whole universe, not the page the user happens to be looking at: "the five biggest" has to
  // mean the five biggest overall.
  const { rows, sectors } = await getDistressUniverseForWorkspace(session.user.id, workspaceId);
  const result = answerNjordQuestion({ question, rows, sectors });

  return NextResponse.json({ answer: result.answer, intent: result.intent });
}
