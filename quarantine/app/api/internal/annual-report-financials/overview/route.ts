import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import env from "@/lib/env";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { getAnnualReportPipelineOverview } from "@/server/services/annual-report-financials-service";

const querySchema = z.object({
  orgNumbers: z.array(norwegianOrganizationNumberSchema).max(100),
  sampleLimit: z.coerce.number().int().min(1).max(200),
});

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

function readListParam(request: NextRequest, key: string) {
  return request.nextUrl.searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    orgNumbers: readListParam(request, "org"),
    sampleLimit: request.nextUrl.searchParams.get("limit") ?? "20",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Ugyldige oversiktsparametere." }, { status: 400 });
  }

  try {
    const data = await getAnnualReportPipelineOverview(parsed.data);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Kunne ikke hente annual-report overview.",
      },
      { status: 500 },
    );
  }
}
