import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { getDistressOverviewForWorkspace } from "@/server/services/distress-analysis-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await context.params;
    const data = await getDistressOverviewForWorkspace(session.user.id, workspaceId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente distress-oversikt." },
      { status: 400 },
    );
  }
}
