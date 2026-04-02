import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { handoffFindingToWorkspaceWatch } from "@/server/services/dd-investment-service";

export async function POST(_: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { findingId } = await params;
    const watchId = await handoffFindingToWorkspaceWatch(session.user.id, findingId);
    return NextResponse.json({ data: { watchId } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke sende funnet til overvaking." },
      { status: 400 },
    );
  }
}
