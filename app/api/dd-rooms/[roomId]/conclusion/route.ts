import { DdDecisionOutcome } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { getDdRoomDetail } from "@/server/services/dd-room-service";
import { getDdConclusion, upsertDdConclusion } from "@/server/services/dd-investment-service";

const conclusionSchema = z.object({
  investmentCaseSummary: z.string().trim().optional(),
  valueDriversSummary: z.string().trim().optional(),
  keyRisksSummary: z.string().trim().optional(),
  recommendationRationale: z.string().trim().optional(),
  monitoringPlan: z.string().trim().optional(),
  decisionNote: z.string().trim().optional(),
  outcome: z.nativeEnum(DdDecisionOutcome).optional(),
  isFinal: z.boolean().optional(),
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
    const data = await getDdConclusion(roomId);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente konklusjonen." },
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
    const values = conclusionSchema.parse(body);
    const data = await upsertDdConclusion(session.user.id, roomId, values);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke lagre konklusjonen." },
      { status: 400 },
    );
  }
}
