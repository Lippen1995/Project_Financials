import { NextRequest, NextResponse } from "next/server";
import { WorkspaceStatus } from "@prisma/client";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { getDashboardWorkspaceHome, switchWorkspace, updateWorkspaceStatus } from "@/server/services/workspace-service";

const updateWorkspaceSchema = z.object({
  action: z.enum(["activate", "archive", "reopen"]),
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId } = await params;
  const payload = await getDashboardWorkspaceHome(session.user.id, workspaceId);
  return NextResponse.json({ data: payload.currentWorkspace });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await params;
    const body = await request.json();
    const values = updateWorkspaceSchema.parse(body);

    if (values.action === "activate") {
      await switchWorkspace(session.user.id, workspaceId);
      return NextResponse.json({ data: { workspaceId } });
    }

    await updateWorkspaceStatus(
      session.user.id,
      workspaceId,
      values.action === "archive" ? WorkspaceStatus.ARCHIVED : WorkspaceStatus.ACTIVE,
    );

    return NextResponse.json({ data: { workspaceId, status: values.action === "archive" ? "ARCHIVED" : "ACTIVE" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere workspace-et." },
      { status: 400 },
    );
  }
}
