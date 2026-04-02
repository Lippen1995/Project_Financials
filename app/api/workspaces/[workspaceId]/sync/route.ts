import { NextRequest, NextResponse } from "next/server";

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
    const { workspaceId } = await context.params;
    const result = await syncWorkspaceNotifications(session.user.id, workspaceId);
    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke synkronisere workspace-et." },
      { status: 400 },
    );
  }
}
