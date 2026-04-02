import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { getDistressCompanyDetailForWorkspace } from "@/server/services/distress-analysis-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; slug: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, slug } = await context.params;
    const data = await getDistressCompanyDetailForWorkspace(session.user.id, workspaceId, slug);

    if (!data) {
      return NextResponse.json({ error: "Fant ikke distress-selskapet." }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente distress-profilen." },
      { status: 400 },
    );
  }
}
