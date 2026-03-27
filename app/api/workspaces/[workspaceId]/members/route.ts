import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { getDashboardWorkspaceHome, inviteWorkspaceMember } from "@/server/services/workspace-service";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function GET(_: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;
  const payload = await getDashboardWorkspaceHome(session.user.id, workspaceId);
  return NextResponse.json({ data: payload.currentWorkspace.members });
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await params;
    const body = await request.json();
    const values = inviteSchema.parse(body);
    const invitation = await inviteWorkspaceMember(session.user.id, workspaceId, values.email, values.role);

    return NextResponse.json({ data: { id: invitation.id, status: invitation.status } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke invitere medlemmet." },
      { status: 400 },
    );
  }
}
