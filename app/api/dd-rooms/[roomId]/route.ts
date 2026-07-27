import { DdRoomStatus, DdWorkstream } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseRouteIds } from "@/lib/api-input";
import { safeAuth } from "@/lib/auth";
import { getDdRoomDetail, updateDdRoomStatus } from "@/server/services/dd-room-service";

const roomStatusSchema = z.object({
  status: z.enum(["ACTIVE", "ARCHIVED"]),
});

const querySchema = z.object({
  workstream: z.nativeEnum(DdWorkstream).optional(),
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
    const { roomId } = parseRouteIds(await params, ["roomId"] as const);
    const query = querySchema.safeParse({
      workstream: _.nextUrl.searchParams.get("workstream") ?? undefined,
    });
    if (!query.success) {
      return NextResponse.json({ error: "Ugyldig workstream." }, { status: 400 });
    }
    const detail = await getDdRoomDetail(
      session.user.id,
      roomId,
      query.data.workstream ?? null,
    );
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
    const { roomId } = parseRouteIds(await params, ["roomId"] as const);
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
