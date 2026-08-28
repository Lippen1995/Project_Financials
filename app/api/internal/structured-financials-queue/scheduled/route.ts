import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
import { runObservedBackgroundJob } from "@/server/services/background-job-observability-service";
import {
  drainStructuredFinancialsQueue,
  getStructuredFinancialsQueueDepth,
} from "@/server/services/structured-financials-queue-service";

const querySchema = z
  .object({
    limit: z
      .string()
      .regex(/^(?:[1-9]\d{0,3})$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(1000)),
  })
  .strict();

function isAuthorized(request: NextRequest) {
  const validSecrets = [env.financialsSyncSecret, env.cronSecret].filter(Boolean);
  if (validSecrets.length === 0) {
    return false;
  }

  const bearer = request.headers.get("authorization");
  if (validSecrets.some((secret) => bearer === `Bearer ${secret}`)) {
    return true;
  }

  const headerSecret = request.headers.get("x-financials-sync-secret");
  return Boolean(
    env.financialsSyncSecret
      && headerSecret
      && headerSecret === env.financialsSyncSecret,
  );
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get("limit") ?? "25",
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid structured financials queue query." },
      { status: 400 },
    );
  }

  try {
    const data = await runObservedBackgroundJob({
      jobKey: "structured-financials-queue",
      execute: async () => {
        const drained = await drainStructuredFinancialsQueue({
          limit: parsedQuery.data.limit,
        });
        const depth = await getStructuredFinancialsQueueDepth();
        return { ...drained, depth };
      },
      summarize: (result) => ({
        claimedCount: result.claimed,
        succeededCount: result.succeeded,
        failedCount: result.failed,
        skipped: result.skipped,
      }),
    });

    return NextResponse.json({
      job: "structured-financials-queue",
      data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke kjore planlagt henting av strukturerte regnskapstall.",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const maxDuration = 300;
