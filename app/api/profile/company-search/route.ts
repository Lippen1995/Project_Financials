import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { searchCompaniesForProfile } from "@/server/services/user-profile-service";

const searchParamsSchema = z.object({
  q: z.string().trim().max(200),
});

export async function GET(request: Request) {
  const session = await safeAuth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsedParams = searchParamsSchema.safeParse({
    q: searchParams.get("q") ?? "",
  });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldige søkeparametere." }, { status: 400 });
  }

  const query = parsedParams.data.q;
  const results = await searchCompaniesForProfile(query);

  return NextResponse.json({
    results,
    manualEntryAllowed: true,
  });
}
