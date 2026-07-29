import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { aiEconomicsSettingsInputSchema } from "@/server/ai-economics/domain";
import { updateAiEconomicsSettings } from "@/server/services/admin-ai-economics-service";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error || !auth.user) return auth.error;

  const payload = await request.json().catch(() => null);
  const parsed = aiEconomicsSettingsInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Ugyldig økonomikonfigurasjon.",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const settings = await updateAiEconomicsSettings(auth.user.id, parsed.data);
  return NextResponse.json({ ok: true, settings });
}
