import { NextRequest, NextResponse } from "next/server";
import { WorkspaceWatchStatus } from "@prisma/client";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { updateWorkspaceWatchStatus } from "@/server/services/workspace-collaboration-service";

const updateWatchSchema = z.object({
  status: z.nativeEnum(WorkspaceWatchStatus),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ watchId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { watchId } = await context.params;
    const body = await request.json();
    const values = updateWatchSchema.parse(body);
    const workspaceId = await updateWorkspaceWatchStatus(session.user.id, watchId, values.status);
    return NextResponse.json({ data: { workspaceId, status: values.status } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere abonnementet." },
      { status: 400 },
    );
  }
}
