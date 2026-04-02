import { NextRequest, NextResponse } from "next/server";
import { CompanyStatus } from "@prisma/client";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import {
  createWorkspaceMonitor,
  listWorkspaceMonitors,
} from "@/server/services/workspace-collaboration-service";

const createMonitorSchema = z.object({
  name: z.string().trim().min(2),
  industryCodePrefix: z.string().trim().optional(),
  minEmployees: z.number().int().nonnegative().optional(),
  maxEmployees: z.number().int().nonnegative().optional(),
  minRevenue: z.number().int().nonnegative().optional(),
  maxRevenue: z.number().int().nonnegative().optional(),
  companyStatus: z.nativeEnum(CompanyStatus).optional(),
  minimumDaysInStatus: z.number().int().nonnegative().optional(),
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
    const monitors = await listWorkspaceMonitors(session.user.id, workspaceId);
    return NextResponse.json({ data: monitors });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente monitorer." },
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
    const values = createMonitorSchema.parse(body);
    const monitor = await createWorkspaceMonitor(session.user.id, workspaceId, values);
    return NextResponse.json({ data: monitor });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette monitoren." },
      { status: 400 },
    );
  }
}
