import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import {
  analysisService,
  createWorklistSchema,
} from "@/server/analysis/analysis-service";

const paramsSchema = z.object({
  analysisId: z.string().trim().min(1).max(128),
}).strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ analysisId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig analyse-ID." }, { status: 400 });
  }
  const { analysisId } = parsedParams.data;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }
  const parsedBody = createWorklistSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }
  try {
    const worklist = await analysisService.createWorklist(
      session.user.id,
      analysisId,
      parsedBody.data,
    );
    return NextResponse.json({ worklist }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke lagre arbeidslisten.";
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
