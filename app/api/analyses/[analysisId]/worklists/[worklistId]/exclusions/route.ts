import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import {
  analysisService,
  listWorklistExclusionsSchema,
} from "@/server/analysis/analysis-service";

const paramsSchema = z.object({
  analysisId: z.string().trim().min(1).max(128),
  worklistId: z.string().trim().min(1).max(128),
}).strict();

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
  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig analyse- eller arbeidsliste-ID." }, { status: 400 });
  }
  const { analysisId, worklistId } = parsedParams.data;
  const query = listWorklistExclusionsSchema.safeParse({
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Ugyldig sideinndeling." }, { status: 400 });
  }
  try {
    const result = await analysisService.listWorklistExclusions(
      session.user.id,
      analysisId,
      worklistId,
      query.data,
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
