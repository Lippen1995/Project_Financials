import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { createDdRoom } from "@/server/services/dd-room-service";
import { getDashboardWorkspaceHome } from "@/server/services/workspace-service";

const createDdRoomSchema = z.object({
  companyReference: z.string().trim().min(1),
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await params;
    const payload = await getDashboardWorkspaceHome(session.user.id, workspaceId);
    return NextResponse.json({
      data: {
        active: payload.currentWorkspace.activeDdRooms,
        archived: payload.currentWorkspace.archivedDdRooms,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente DD-rom." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await params;
    const body = await request.json();
    const values = createDdRoomSchema.parse(body);
    const room = await createDdRoom(session.user.id, workspaceId, values);
    return NextResponse.json({ data: room });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette DD-rom." },
      { status: 400 },
    );
  }
}
