import {
  DdFindingImpact,
  DdFindingSeverity,
  DdFindingStatus,
  DdTaskStage,
  DdWorkstream,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { getDdRoomDetail } from "@/server/services/dd-room-service";
import { buildFindingsSummary, createDdFinding, getRoomFindings } from "@/server/services/dd-investment-service";

const createFindingSchema = z.object({
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  stage: z.nativeEnum(DdTaskStage),
  workstream: z.nativeEnum(DdWorkstream),
  severity: z.nativeEnum(DdFindingSeverity).optional(),
  status: z.nativeEnum(DdFindingStatus).optional(),
  impact: z.nativeEnum(DdFindingImpact).optional(),
  recommendedAction: z.string().trim().optional(),
  isBlocking: z.boolean().optional(),
  dueAt: z.string().optional(),
  assigneeUserId: z.string().optional(),
  taskId: z.string().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    if (!(await getDdRoomDetail(session.user.id, roomId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const url = new URL(request.url);
    const workstreamParam = url.searchParams.get("workstream");
    const workstream = workstreamParam && Object.values(DdWorkstream).includes(workstreamParam as DdWorkstream)
      ? (workstreamParam as DdWorkstream)
      : null;
    const findings = await getRoomFindings(roomId);
    return NextResponse.json({ data: buildFindingsSummary(findings, workstream) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente funn." },
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
    if (!(await getDdRoomDetail(session.user.id, roomId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const body = await request.json();
    const values = createFindingSchema.parse(body);
    const data = await createDdFinding(session.user.id, roomId, {
      ...values,
      dueAt: values.dueAt ? new Date(values.dueAt) : null,
      assigneeUserId: values.assigneeUserId || null,
      taskId: values.taskId || null,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette funn." },
      { status: 400 },
    );
  }
}
