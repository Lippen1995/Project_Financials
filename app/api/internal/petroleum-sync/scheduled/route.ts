import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { runScheduledPetroleumJobs } from "@/server/services/petroleum-sync-service";

function isAuthorized(request: NextRequest) {
  if (!env.workspaceSyncSecret) {
    return false;
  }

  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${env.workspaceSyncSecret}`) {
    return true;
  }

  const headerSecret = request.headers.get("x-workspace-sync-secret");
  return headerSecret === env.workspaceSyncSecret;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await runScheduledPetroleumJobs();
    return NextResponse.json({ job: "scheduled", data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Kunne ikke kjore planlagt petroleum-sync.",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
