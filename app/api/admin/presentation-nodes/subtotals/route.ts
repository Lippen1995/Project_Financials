import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  createSubtotal,
  NodeLinkError,
} from "@/server/services/presentation-node-service";

const createSchema = z.object({
  label: z.string().min(1).max(200),
  operands: z
    .array(
      z.object({
        nodeId: z.string().min(1),
        operation: z.enum(["ADD", "SUBTRACT"]),
      }),
    )
    .min(1),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
});

export async function POST(request: NextRequest) {
  const { user, error } = await requireFinancialReviewer();
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
    const node = await createSubtotal({ ...parsed.data, userId: user!.id });
    return NextResponse.json({ data: node }, { status: 201 });
  } catch (err) {
    if (err instanceof NodeLinkError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke opprette subtotal." },
      { status: 400 },
    );
  }
}
