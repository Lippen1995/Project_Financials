import { DdTaskPriority, DdTaskStage, DdWorkstream } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { getDdRoomDetail } from "@/server/services/dd-room-service";
import { createDdTask } from "@/server/services/dd-workflow-service";

const createTaskSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  stage: z.nativeEnum(DdTaskStage),
  workstream: z.nativeEnum(DdWorkstream),
  priority: z.nativeEnum(DdTaskPriority).optional(),
  dueAt: z.string().optional(),
  assigneeUserId: z.string().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    const detail = await getDdRoomDetail(session.user.id, roomId);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: detail.workflow });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente workflow." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    const body = await request.json();
    const values = createTaskSchema.parse(body);
    const task = await createDdTask(session.user.id, roomId, {
      title: values.title,
      description: values.description,
      stage: values.stage,
      workstream: values.workstream,
      priority: values.priority,
      dueAt: values.dueAt ? new Date(values.dueAt) : null,
      assigneeUserId: values.assigneeUserId || null,
    });

    return NextResponse.json({ data: { id: task.id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette oppgaven." },
      { status: 400 },
    );
  }
}
