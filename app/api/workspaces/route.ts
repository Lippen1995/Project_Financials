import { NextRequest, NextResponse } from "next/server";
import { WorkspaceMemberRole } from "@prisma/client";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { createTeamWorkspace, getDashboardWorkspaceHome } from "@/server/services/workspace-service";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2),
});

export async function GET(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = request.nextUrl.searchParams.get("workspace");
  const payload = await getDashboardWorkspaceHome(session.user.id, workspaceId);

  return NextResponse.json({ data: payload });
}

export async function POST(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const values = createWorkspaceSchema.parse(body);
    const workspace = await createTeamWorkspace(session.user.id, values.name);

    return NextResponse.json({
      data: {
        id: workspace.id,
        role: WorkspaceMemberRole.OWNER,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette workspace." },
      { status: 400 },
    );
  }
}
