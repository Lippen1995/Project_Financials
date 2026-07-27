import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { getCompaniesForKey } from "@/server/services/canonical-key-service";

const querySchema = z
  .object({
    key: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
  })
  .strict();

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const query = querySchema.safeParse({
    key: request.nextUrl.searchParams.get("key") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Mangler 'key'-parameter." }, { status: 400 });
  }

  const companies = await getCompaniesForKey(query.data.key);
  return NextResponse.json({ data: { companies } });
}
