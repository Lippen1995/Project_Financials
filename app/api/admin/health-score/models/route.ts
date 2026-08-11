import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { healthScoreModelInputSchema } from "@/server/health-score/domain";
import {
  buildAdminHealthScoreDashboard,
  createHealthScoreModel,
} from "@/server/services/admin-health-score-service";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error || !auth.user) return auth.error;

  const dashboard = await buildAdminHealthScoreDashboard();
  return NextResponse.json(dashboard);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = healthScoreModelInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig scoremodell.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const model = await createHealthScoreModel(auth.user.id, parsed.data);
    return NextResponse.json({ ok: true, model });
  } catch (error) {
    // A duplicate key is the one failure an admin can fix themselves, so it gets
    // a specific message rather than a generic 500.
    const message =
      error instanceof Error && error.message.includes("Unique constraint")
        ? "Nøkkelen er allerede i bruk av en annen modell."
        : "Kunne ikke opprette modellen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
