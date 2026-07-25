import { NextRequest, NextResponse } from "next/server";

import { parseRouteIds } from "@/lib/api-input";
import { safeAuth } from "@/lib/auth";
import { syncWorkspaceNotifications } from "@/server/services/workspace-collaboration-service";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = parseRouteIds(await context.params, ["workspaceId"] as const);
    const result = await syncWorkspaceNotifications(session.user.id, workspaceId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke synkronisere workspace-et." },
      { status: 400 },
    );
  }
}
