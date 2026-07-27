import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { analysisService } from "@/server/analysis/analysis-service";

type WorklistContext = {
  params: Promise<{ analysisId: string; worklistId: string }>;
};

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof z.ZodError
    ? 400
    : message.includes("not found")
      ? 404
      : message.includes("already exists")
        ? 409
        : 403;
  return NextResponse.json({ error: message }, { status });
}

type ScopeResult =
  | { response: NextResponse; userId?: never; analysisId?: never; worklistId?: never }
  | { response?: never; userId: string; analysisId: string; worklistId: string };

async function requestScope(context: WorklistContext): Promise<ScopeResult> {
  const session = await safeAuth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Krever innlogging." }, { status: 401 }) };
  const { analysisId, worklistId } = await context.params;
  if (!analysisId || analysisId.length > 128 || !worklistId || worklistId.length > 128) {
    return { response: NextResponse.json({ error: "Ugyldig analyse- eller arbeidsliste-ID." }, { status: 400 }) };
  }
  return { userId: session.user.id, analysisId, worklistId };
}

type BodyResult =
  | { response: NextResponse; body?: never }
  | { response?: never; body: unknown };

async function jsonBody(request: NextRequest): Promise<BodyResult> {
  try {
    return { body: await request.json() as unknown };
  } catch {
    return { response: NextResponse.json({ error: "Ugyldig forespørsel." }, { status: 400 }) };
  }
}

export async function PATCH(request: NextRequest, context: WorklistContext) {
  const scope = await requestScope(context);
  if (scope.response) return scope.response;
  const payload = await jsonBody(request);
  if (payload.response) return payload.response;
  try {
    await analysisService.reorderWorklist(
      scope.userId,
      scope.analysisId,
      scope.worklistId,
      payload.body,
    );
    return NextResponse.json({ updated: true });
  } catch (error) {
    return errorResponse(error, "Kunne ikke endre rekkefølgen.");
  }
}

export async function POST(request: NextRequest, context: WorklistContext) {
  const scope = await requestScope(context);
  if (scope.response) return scope.response;
  const payload = await jsonBody(request);
  if (payload.response) return payload.response;
  try {
    const item = await analysisService.promoteWorklistItem(
      scope.userId,
      scope.analysisId,
      scope.worklistId,
      payload.body,
    );
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Kunne ikke promotere selskapet.");
  }
}
