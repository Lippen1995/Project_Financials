import { NextRequest, NextResponse } from "next/server";

import { tryParseRouteIds } from "@/lib/api-input";
import { safeAuth } from "@/lib/auth";
import { listWorkspaceNotifications } from "@/server/services/workspace-collaboration-service";

export async function GET(
  _request: NextRequest,
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
    const notifications = await listWorkspaceNotifications(session.user.id, workspaceId);
    return NextResponse.json({ data: notifications });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente varsler." },
      { status: 400 },
    );
  }
}
