import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import {
  acquirePipelineJobLease,
  releasePipelineJobLease,
} from "@/server/persistence/pipeline-job-lease-repository";
import { syncSsbClassifications } from "@/server/services/ssb-classification-sync-service";

const JOB_KEY = "ssb-classifications";

function isAuthorized(request: NextRequest) {
  if (!env.cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${env.cronSecret}`;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leaseOwner = `ssb-classifications-${process.pid}`;
  try {
    const lease = await acquirePipelineJobLease({
      jobKey: JOB_KEY,
      leaseOwner,
      leaseSeconds: 15 * 60,
    });
    if (!lease.acquired) {
      return NextResponse.json({
        job: JOB_KEY,
        data: {
          skipped: true,
          skippedReason: `Jobben kjører allerede (eier: ${lease.lease.leaseOwner}).`,
        },
      });
    }

    try {
      const data = await syncSsbClassifications();
      return NextResponse.json({ job: JOB_KEY, data });
    } finally {
      await releasePipelineJobLease({ jobKey: JOB_KEY, leaseOwner });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke synkronisere SSB Klass.",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const maxDuration = 300;
