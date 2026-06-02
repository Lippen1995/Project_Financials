import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { updateKeyConfig } from "@/server/services/presentation-node-service";

const configSchema = z
  .object({
    metricKey: z.string().min(1),
    valueMode: z.enum(["NOMINAL", "ABSOLUTE"]).optional(),
    operation: z.enum(["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "MATCH"]).optional(),
  })
  .refine((data) => data.valueMode !== undefined || data.operation !== undefined, {
    message: "Minst ett felt må oppdateres.",
  });

export async function PATCH(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await updateKeyConfig(parsed.data);
    return NextResponse.json({ data: parsed.data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke oppdatere nøkkelkonfigurasjon." },
      { status: 400 },
    );
  }
}
