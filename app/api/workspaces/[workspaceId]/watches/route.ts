import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import {
  createWorkspaceWatch,
  listWorkspaceWatches,
} from "@/server/services/workspace-collaboration-service";

const createWatchSchema = z.object({
  companyReference: z.string().trim().min(1),
  watchAnnouncements: z.boolean().optional(),
  watchFinancialStatements: z.boolean().optional(),
  watchStatusChanges: z.boolean().optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await context.params;
    const watches = await listWorkspaceWatches(session.user.id, workspaceId);
    return NextResponse.json({ data: watches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente abonnementer." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { workspaceId } = await context.params;
    const body = await request.json();
    const values = createWatchSchema.parse(body);
    const watch = await createWorkspaceWatch(session.user.id, workspaceId, values);
    return NextResponse.json({ data: watch });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette abonnementet." },
      { status: 400 },
    );
  }
}
