import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { assignKey } from "@/server/services/presentation-node-service";

const assignSchema = z.object({
  metricKey: z.string().min(1),
  nodeId: z.string().min(1).nullable(),
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

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await assignKey(parsed.data);
    return NextResponse.json({ data: parsed.data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke tilordne nøkkel." },
      { status: 400 },
    );
  }
}
