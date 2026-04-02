import { DdFindingImpact, DdFindingSeverity, DdFindingStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { updateDdFinding } from "@/server/services/dd-investment-service";

const updateFindingSchema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  severity: z.nativeEnum(DdFindingSeverity).optional(),
  status: z.nativeEnum(DdFindingStatus).optional(),
  impact: z.nativeEnum(DdFindingImpact).optional(),
  recommendedAction: z.string().trim().optional(),
  isBlocking: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { findingId } = await params;
    const body = await request.json();
    const values = updateFindingSchema.parse(body);
    const data = await updateDdFinding(session.user.id, findingId, values);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke oppdatere funnet." },
      { status: 400 },
    );
  }
}
