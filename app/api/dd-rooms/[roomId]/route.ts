import { DdRoomStatus, DdWorkstream } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { getDdRoomDetail, updateDdRoomStatus } from "@/server/services/dd-room-service";

const roomStatusSchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]),
});

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    const workstreamParam = _.nextUrl.searchParams.get("workstream");
    const workstream = workstreamParam && Object.values(DdWorkstream).includes(workstreamParam as DdWorkstream)
      ? (workstreamParam as DdWorkstream)
      : null;
    const detail = await getDdRoomDetail(session.user.id, roomId, workstream);
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: detail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente DD-rommet." },
      { status: 400 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    const body = await request.json();
    const values = roomStatusSchema.parse(body);
    const workspaceId = await updateDdRoomStatus(
      session.user.id,
      roomId,
      values.status === "ACTIVE" ? DdRoomStatus.ACTIVE : DdRoomStatus.ARCHIVED,
    );

    return NextResponse.json({ data: { roomId, workspaceId, status: values.status } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere DD-rommet." },
      { status: 400 },
    );
  }
}
