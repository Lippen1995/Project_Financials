import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { runObservedBackgroundJob } from "@/server/services/background-job-observability-service";
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
    const data = await runObservedBackgroundJob({
      jobKey: JOB_KEY,
      execute: async () => {
        const lease = await acquirePipelineJobLease({
          jobKey: JOB_KEY,
          leaseOwner,
          leaseSeconds: 15 * 60,
        });
        if (!lease.acquired) {
          return {
          skipped: true,
          skippedReason: `Jobben kjører allerede (eier: ${lease.lease.leaseOwner}).`,
          };
        }

        try {
          const result = await syncSsbClassifications();
          return { ...result, skipped: false };
        } finally {
          await releasePipelineJobLease({ jobKey: JOB_KEY, leaseOwner });
        }
      },
      summarize: (result) => ({
        claimedCount: "classifications" in result ? result.classifications : 0,
        succeededCount: "classifications" in result ? result.classifications : 0,
        failedCount: 0,
        skipped: !("classifications" in result),
      }),
    });
    return NextResponse.json({ job: JOB_KEY, data });
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
