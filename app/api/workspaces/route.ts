import { NextRequest, NextResponse } from "next/server";
import { WorkspaceMemberRole } from "@prisma/client";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { createTeamWorkspace, getDashboardWorkspaceHome } from "@/server/services/workspace-service";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2),
});

const querySchema = z.object({
  workspace: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    .optional(),
}).strict();

export async function GET(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = querySchema.safeParse({
    workspace: request.nextUrl.searchParams.get("workspace") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid workspace query." }, { status: 400 });
  }

  const payload = await getDashboardWorkspaceHome(
    session.user.id,
    parsedQuery.data.workspace,
  );

  return NextResponse.json({ data: payload });
}

export async function POST(request: NextRequest) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const values = createWorkspaceSchema.parse(body);
    const workspace = await createTeamWorkspace(session.user.id, values.name);

    return NextResponse.json({
      data: {
        id: workspace.id,
        role: WorkspaceMemberRole.OWNER,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette workspace." },
      { status: 400 },
    );
  }
}
