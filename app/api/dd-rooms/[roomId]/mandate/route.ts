import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { getDdRoomDetail } from "@/server/services/dd-room-service";
import { getDdMandate, upsertDdMandate } from "@/server/services/dd-investment-service";

const mandateSchema = z.object({
  investmentCase: z.string().trim().optional(),
  thesis: z.string().trim().optional(),
  valueDrivers: z.string().trim().optional(),
  keyRisks: z.string().trim().optional(),
  timeHorizon: z.string().trim().optional(),
  decisionGoal: z.string().trim().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    if (!(await getDdRoomDetail(session.user.id, roomId))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = await getDdMandate(roomId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente mandatet." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    const body = await request.json();
    const values = mandateSchema.parse(body);
    const data = await upsertDdMandate(session.user.id, roomId, values);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke lagre mandatet." },
      { status: 400 },
    );
  }
}
