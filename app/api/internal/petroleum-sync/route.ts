import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import {
  PetroleumJobName,
  runPetroleumJobNow,
} from "@/server/services/petroleum-sync-service";

const SUPPORTED_JOBS: PetroleumJobName[] = [
  "bootstrap-core",
  "bootstrap-metrics",
  "bootstrap-publications",
  "bootstrap-events",
  "bootstrap-macros",
  "refresh-snapshots",
  "refresh-company-exposure",
  "bootstrap-all",
  "scheduled",
];

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

function parseJobName(request: NextRequest) {
  const job = request.nextUrl.searchParams.get("job");
  if (!job || !SUPPORTED_JOBS.includes(job as PetroleumJobName)) {
    return null;
  }

  return job as PetroleumJobName;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = parseJobName(request);
  if (!job) {
    return NextResponse.json(
      { error: "Manglende eller ugyldig petroleum-jobb.", supportedJobs: SUPPORTED_JOBS },
      { status: 400 },
    );
  }

  try {
    const data = await runPetroleumJobNow(job);
    return NextResponse.json({ job, data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Kunne ikke kjore petroleum-sync.",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
