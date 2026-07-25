import { NextRequest, NextResponse } from "next/server";

import { parseRouteIds } from "@/lib/api-input";
import { safeAuth } from "@/lib/auth";
import { markWorkspaceNotificationRead } from "@/server/services/workspace-collaboration-service";

export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { notificationId } = parseRouteIds(
      await context.params,
      ["notificationId"] as const,
    );
    const workspaceId = await markWorkspaceNotificationRead(session.user.id, notificationId);
    return NextResponse.json({ data: { workspaceId, read: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere varslet." },
      { status: 400 },
    );
  }
}
