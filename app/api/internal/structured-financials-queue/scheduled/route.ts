import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
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
  if (!env.financialsSyncSecret) {
    return false;
  }

  const bearer = request.headers.get("authorization");
  if (bearer === `Bearer ${env.financialsSyncSecret}`) {
    return true;
  }

  const headerSecret = request.headers.get("x-financials-sync-secret");
  return headerSecret === env.financialsSyncSecret;
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
    const data = await drainStructuredFinancialsQueue({
      limit: parsedQuery.data.limit,
    });
    const depth = await getStructuredFinancialsQueueDepth();

    return NextResponse.json({
      job: "structured-financials-queue",
      data: { ...data, depth },
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
