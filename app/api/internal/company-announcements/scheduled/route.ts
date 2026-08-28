import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
import { runObservedBackgroundJob } from "@/server/services/background-job-observability-service";
import { drainCompanyAnnouncementQueue } from "@/server/services/company-announcement-sync-service";

const querySchema = z.object({
  limit: z.string().regex(/^(?:[1-9]\d{0,2})$/).transform(Number).pipe(z.number().int().min(1).max(100)),
}).strict();

function isAuthorized(request: NextRequest) {
  const bearer = request.headers.get("authorization");
  const validSecrets = [env.cronSecret, env.newsSyncSecret].filter(Boolean);
  return validSecrets.some((secret) => bearer === `Bearer ${secret}`)
    || Boolean(env.newsSyncSecret && request.headers.get("x-news-sync-secret") === env.newsSyncSecret);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? "5",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid company announcement queue query." }, { status: 400 });
  }

  try {
    const data = await runObservedBackgroundJob({
      jobKey: "company-announcement-queue",
      execute: () => drainCompanyAnnouncementQueue({ limit: parsed.data.limit }),
      summarize: (result) => ({
        claimedCount: result.claimed,
        succeededCount: result.succeeded,
        failedCount: result.failed,
        skipped: result.skipped,
      }),
    });
    return NextResponse.json({ job: "company-announcement-queue", data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke synkronisere kunngjøringer." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const maxDuration = 300;
