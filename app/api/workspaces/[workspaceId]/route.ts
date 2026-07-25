import { NextRequest, NextResponse } from "next/server";
import { WorkspaceStatus } from "@prisma/client";
import { z } from "zod";

import { parseRouteIds, tryParseRouteIds } from "@/lib/api-input";
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

  const routeIds = tryParseRouteIds(await params, ["workspaceId"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid workspace identifier." }, { status: 400 });
  }
  const { workspaceId } = routeIds;
  const payload = await getDashboardWorkspaceHome(session.user.id, workspaceId);
  return NextResponse.json({ data: payload.currentWorkspace });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = parseRouteIds(await params, ["workspaceId"] as const);
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
