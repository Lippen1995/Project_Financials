import { NextRequest, NextResponse } from "next/server";

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
    const { workspaceId } = await context.params;
    const notifications = await listWorkspaceNotifications(session.user.id, workspaceId);
    return NextResponse.json({ data: notifications });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente varsler." },
      { status: 400 },
    );
  }
}
