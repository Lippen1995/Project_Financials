import { DdTaskStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { updateDdTaskStatus } from "@/server/services/dd-workflow-service";

const taskStatusSchema = z.object({
  status: z.nativeEnum(DdTaskStatus),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { taskId } = await params;
    const body = await request.json();
    const values = taskStatusSchema.parse(body);
    const roomId = await updateDdTaskStatus(session.user.id, taskId, values.status);
    return NextResponse.json({ data: { taskId, roomId, status: values.status } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere oppgaven." },
      { status: 400 },
    );
  }
}
