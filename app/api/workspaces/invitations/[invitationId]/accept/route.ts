import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { acceptWorkspaceInvitation } from "@/server/services/workspace-service";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { invitationId } = await params;
    const workspaceId = await acceptWorkspaceInvitation(session.user.id, invitationId);
    return NextResponse.json({ data: { workspaceId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke akseptere invitasjonen." },
      { status: 400 },
    );
  }
}
