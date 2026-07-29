import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { logRecoverableError } from "@/lib/recoverable-error";
import { analysisReadService } from "@/server/analysis/analysis-read-service";
import {
  analysisService,
  createAnalysisSchema,
} from "@/server/analysis/analysis-service";

const querySchema = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
}).strict();

export async function GET(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }
  const query = querySchema.safeParse({
    includeArchived: request.nextUrl.searchParams.get("includeArchived") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Ugyldig filter." }, { status: 400 });
  }
  try {
    const analyses = await analysisReadService.list(session.user.id, {
      includeArchived: query.data.includeArchived === "true",
    });
    return NextResponse.json({ analyses });
  } catch (error) {
    logRecoverableError("analyses.list", error, { userId: session.user.id });
    return NextResponse.json({ error: "Kunne ikke laste analysene." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }
  const parsedBody = createAnalysisSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 });
  }
  try {
    const analysis = await analysisService.create(session.user.id, parsedBody.data);
    return NextResponse.json({ analysis }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke opprette analysen.";
    const status = error instanceof z.ZodError ? 400 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
