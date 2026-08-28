import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
import { drainAiSearchJobs } from "@/server/services/ai-search-job-service";
import { runObservedBackgroundJob } from "@/server/services/background-job-observability-service";

const querySchema = z.object({
  limit: z.string().regex(/^(?:[1-9]\d?)$/).transform(Number).pipe(z.number().int().min(1).max(50)),
}).strict();

async function handle(request: NextRequest) {
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = querySchema.safeParse({ limit: request.nextUrl.searchParams.get("limit") ?? "2" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid AI job query." }, { status: 400 });
  }

  try {
    const data = await runObservedBackgroundJob({
      jobKey: "ai-search-jobs",
      execute: () => drainAiSearchJobs({ limit: parsed.data.limit }),
      summarize: (result) => ({
        claimedCount: result.claimed,
        succeededCount: result.completed,
        failedCount: result.failed,
        skipped: result.skipped,
      }),
    });
    return NextResponse.json({ job: "ai-search-jobs", data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke kjøre AI-jobber." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const maxDuration = 300;
