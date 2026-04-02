import { NextRequest, NextResponse } from "next/server";

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
    const { notificationId } = await context.params;
    const workspaceId = await markWorkspaceNotificationRead(session.user.id, notificationId);
    return NextResponse.json({ data: { workspaceId, read: true } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere varslet." },
      { status: 400 },
    );
  }
}
