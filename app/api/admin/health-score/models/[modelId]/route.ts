import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-auth";
import { healthScoreModelInputSchema } from "@/server/health-score/domain";
import {
  deleteHealthScoreModel,
  promoteHealthScoreModelToFallback,
  updateHealthScoreModel,
} from "@/server/services/admin-health-score-service";

type RouteContext = { params: Promise<{ modelId: string }> };

const paramsSchema = z.object({ modelId: z.string().cuid() }).strict();

async function parseModelId(context: RouteContext) {
  const parsedParams = paramsSchema.safeParse(await context.params);
  return parsedParams.success ? parsedParams.data.modelId : null;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user) return auth.error;

  const modelId = await parseModelId(context);
  if (!modelId) {
    return NextResponse.json({ error: "Ugyldig modell-id." }, { status: 400 });
  }
  const payload = await request.json().catch(() => null);
  const parsed = healthScoreModelInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig scoremodell.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const model = await updateHealthScoreModel(auth.user.id, modelId, parsed.data);
    return NextResponse.json({ ok: true, model });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("Unique constraint")
        ? "Nøkkelen er allerede i bruk av en annen modell."
        : "Kunne ikke lagre modellen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user) return auth.error;

  const modelId = await parseModelId(context);
  if (!modelId) {
    return NextResponse.json({ error: "Ugyldig modell-id." }, { status: 400 });
  }
  const payload = (await request.json().catch(() => null)) as { action?: string } | null;

  if (payload?.action !== "promote-fallback") {
    return NextResponse.json({ error: "Ukjent handling." }, { status: 400 });
  }

  const model = await promoteHealthScoreModelToFallback(auth.user.id, modelId);
  return NextResponse.json({ ok: true, model });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user) return auth.error;

  const modelId = await parseModelId(context);
  if (!modelId) {
    return NextResponse.json({ error: "Ugyldig modell-id." }, { status: 400 });
  }
  try {
    await deleteHealthScoreModel(auth.user.id, modelId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Kunne ikke slette modellen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
