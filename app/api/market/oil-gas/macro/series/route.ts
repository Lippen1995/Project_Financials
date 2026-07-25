import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPetroleumMarketSeriesTimeseries } from "@/server/services/petroleum-market-macro-service";

const querySchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
      .optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const query = querySchema.safeParse({
    slug: new URL(request.url).searchParams.get("slug") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Invalid series slug" }, { status: 400 });
  }
  const { slug } = query.data;
  if (!slug) {
    return NextResponse.json({ data: [] });
  }

  const data = await getPetroleumMarketSeriesTimeseries(slug);
  return NextResponse.json({ data });
}
