import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-auth";
import { updateAdminUserRole } from "@/server/services/admin-user-management-service";

const bodySchema = z.object({
  nextRole: z.enum(["USER", "FINANCIAL_REVIEWER", "ADMIN"]),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { user, error } = await requireAdmin();
  if (error || !user) {
    return error;
  }

  const params = await context.params;
  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig rollevalg." }, { status: 400 });
  }

  try {
    const result = await updateAdminUserRole({
      actorUserId: user.id,
      targetUserId: params.userId,
      nextRole: parsed.data.nextRole,
    });

    return NextResponse.json({ ok: true, result });
  } catch (routeError) {
    const message =
      routeError instanceof Error ? routeError.message : "Kunne ikke endre rollen.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
