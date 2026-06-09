import { NextRequest, NextResponse } from "next/server";

import env from "@/lib/env";
import { syncCompanyEventIntelligence } from "@/server/news/company-event-intelligence-sync";

export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  const validBearerSecrets = [env.cronSecret, env.newsSyncSecret].filter(Boolean);
  if (validBearerSecrets.length === 0) return false;

  const bearer = request.headers.get("authorization");
  if (validBearerSecrets.some((secret) => bearer === `Bearer ${secret}`)) return true;

  return Boolean(
    env.newsSyncSecret &&
      request.headers.get("x-news-sync-secret") === env.newsSyncSecret,
  );
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await syncCompanyEventIntelligence({
      sourceIds: ["oslobors"],
      limit: 40,
    });

    return NextResponse.json({ job: "scheduled-company-event-sync", data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke kjore planlagt selskapshendelse-sync.",
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
