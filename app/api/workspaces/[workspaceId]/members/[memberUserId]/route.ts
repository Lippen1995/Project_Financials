import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { removeWorkspaceMember } from "@/server/services/workspace-service";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ workspaceId: string; memberUserId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId, memberUserId } = await params;
    await removeWorkspaceMember(session.user.id, workspaceId, memberUserId);
    return NextResponse.json({ data: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke fjerne medlemmet." },
      { status: 400 },
    );
  }
}
