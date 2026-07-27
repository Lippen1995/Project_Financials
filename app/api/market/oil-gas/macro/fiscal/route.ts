import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPetroleumFiscalSnapshots } from "@/server/services/petroleum-market-macro-service";

const querySchema = z
  .object({
    jurisdiction: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .default("NO"),
  })
  .strict();

export async function GET(request: NextRequest) {
  const query = querySchema.safeParse({
    jurisdiction: new URL(request.url).searchParams.get("jurisdiction") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "Invalid jurisdiction" }, { status: 400 });
  }

  const data = await getPetroleumFiscalSnapshots(query.data.jurisdiction);
  return NextResponse.json({ data });
}
