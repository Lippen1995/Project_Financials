import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchRegistrySubunits } from "@/server/registry/subunit-search-service";

const searchParamsSchema = z.object({
  query: z.string().trim().max(200),
  limit: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z
      .string()
      .regex(/^\d+$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
  ),
  activeOnly: z.preprocess(
    (value) => (value === null || value === "" ? undefined : value),
    z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  ),
  nace: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
    z
      .string()
      .regex(/^\d{1,2}(?:\.\d{1,3})?$/)
      .optional(),
  ),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsedParams = searchParamsSchema.safeParse({
    query: searchParams.get("query") ?? "",
    limit: searchParams.get("limit"),
    activeOnly: searchParams.get("activeOnly"),
    nace: searchParams.get("nace"),
  });
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldige søkeparametere." }, { status: 400 });
  }

  const { query, limit, activeOnly = false, nace: nacePrefix } = parsedParams.data;

  const results = await searchRegistrySubunits(query, {
    nacePrefix,
    activeOnly,
    limit,
  });

  return NextResponse.json({ data: results });
}
