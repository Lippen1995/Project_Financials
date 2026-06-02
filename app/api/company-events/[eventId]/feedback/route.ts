import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import {
  COMPANY_EVENT_FEEDBACK_ACTIONS,
  getCompanyEventFeedbackMetrics,
  recordCompanyEventFeedback,
} from "@/server/news/company-event-feedback-service";

const feedbackSchema = z.object({
  action: z.enum(COMPANY_EVENT_FEEDBACK_ACTIONS),
  workspaceId: z.string().trim().min(1).optional().nullable(),
  previousValue: z.unknown().optional(),
  correctedValue: z.unknown().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { eventId } = await context.params;
    const metrics = await getCompanyEventFeedbackMetrics(eventId);
    return NextResponse.json({ data: metrics });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load feedback metrics." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { eventId } = await context.params;
    const body = feedbackSchema.parse(await request.json());
    const feedback = await recordCompanyEventFeedback({
      eventId,
      userId: session.user.id,
      workspaceId: body.workspaceId ?? null,
      action: body.action,
      previousValue: body.previousValue,
      correctedValue: body.correctedValue,
      notes: body.notes,
      actorRole: session.user.appRole,
    });

    return NextResponse.json({ data: feedback }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to record feedback.";
    const status = error instanceof z.ZodError ? 400 : message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
