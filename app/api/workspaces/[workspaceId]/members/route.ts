import { NextResponse } from "next/server";

import { parseRouteIds, tryParseRouteIds } from "@/lib/api-input";
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

  const routeIds = tryParseRouteIds(await params, ["workspaceId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid workspace identifier." }, { status: 400 });
  }
  const { workspaceId } = routeIds;
  const payload = await getDashboardWorkspaceHome(session.user.id, workspaceId);
  return NextResponse.json({ data: payload.currentWorkspace.members });
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = parseRouteIds(await params, ["workspaceId"] as const);
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
