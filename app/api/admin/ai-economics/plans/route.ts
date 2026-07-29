import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { aiPlanEconomicsInputSchema } from "@/server/ai-economics/domain";
import { upsertAiPlanEconomics } from "@/server/services/admin-ai-economics-service";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = aiPlanEconomicsInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Ugyldig abonnementskonfigurasjon.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const plan = await upsertAiPlanEconomics(auth.user.id, parsed.data);
  return NextResponse.json({ ok: true, plan });
}
