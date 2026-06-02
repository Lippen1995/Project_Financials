import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { createLink, NodeLinkError } from "@/server/services/presentation-node-service";

const createSchema = z.object({
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  operation: z.enum(["ADD", "SUBTRACT"]).optional(),
});

export async function POST(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const link = await createLink(parsed.data);
    return NextResponse.json({ data: link }, { status: 201 });
  } catch (err) {
    if (err instanceof NodeLinkError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke opprette kobling." },
      { status: 400 },
    );
  }
}
