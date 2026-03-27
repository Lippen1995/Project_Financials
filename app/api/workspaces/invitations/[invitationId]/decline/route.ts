import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { declineWorkspaceInvitation } from "@/server/services/workspace-service";

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
    await declineWorkspaceInvitation(session.user.id, invitationId);
    return NextResponse.json({ data: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke avslå invitasjonen." },
      { status: 400 },
    );
  }
}
