import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { recordCompanySearch } from "@/server/services/search-history-service";

const inputSchema = z.object({
  eventKey: z.string().uuid(),
  query: z.string().trim().min(1).max(200),
  resultCount: z.number().int().min(0).max(100),
});

export async function POST(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Du må være innlogget." }, { status: 401 });
  }

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldig søkehendelse." }, { status: 400 });
  }

  await recordCompanySearch({
    userId: session.user.id,
    eventKey: parsed.data.eventKey,
    query: parsed.data.query,
    scope: "companies",
    resultCount: parsed.data.resultCount,
    succeeded: true,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
