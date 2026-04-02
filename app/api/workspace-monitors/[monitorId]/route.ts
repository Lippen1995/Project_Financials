import { NextRequest, NextResponse } from "next/server";
import { WorkspaceMonitorStatus } from "@prisma/client";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { updateWorkspaceMonitorStatus } from "@/server/services/workspace-collaboration-service";

const updateMonitorSchema = z.object({
  status: z.nativeEnum(WorkspaceMonitorStatus),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ monitorId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { monitorId } = await context.params;
    const body = await request.json();
    const values = updateMonitorSchema.parse(body);
    const workspaceId = await updateWorkspaceMonitorStatus(session.user.id, monitorId, values.status);
    return NextResponse.json({ data: { workspaceId, status: values.status } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere monitoren." },
      { status: 400 },
    );
  }
}
