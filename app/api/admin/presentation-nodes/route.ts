import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  buildNodeMappingModel,
  createNode,
} from "@/server/services/presentation-node-service";

export async function GET() {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const model = await buildNodeMappingModel();
  return NextResponse.json({ data: model });
}

const createSchema = z.object({
  label: z.string().min(1).max(200),
  kind: z.enum(["LINE", "SUBTOTAL"]).optional(),
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
    const node = await createNode({ ...parsed.data, userId: user!.id });
    return NextResponse.json({ data: node }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke opprette node." },
      { status: 400 },
    );
  }
}
