import { NextResponse } from "next/server";

import { tryParseRouteIds } from "@/lib/api-input";
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
    const routeIds = tryParseRouteIds(await context.params, ["workspaceId"] as const);
    if (!routeIds) {
      return NextResponse.json({ error: "Ugyldig workspace-ID." }, { status: 400 });
    }
    const { workspaceId } = routeIds;
    const data = await getDistressOverviewForWorkspace(session.user.id, workspaceId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente distress-oversikt." },
      { status: 400 },
    );
  }
}
