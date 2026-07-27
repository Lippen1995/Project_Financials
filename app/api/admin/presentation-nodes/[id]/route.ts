import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { tryParseRouteIds } from "@/lib/api-input";
import { deleteNode, updateNode } from "@/server/services/presentation-node-service";

const updateSchema = z
  .object({
    label: z.string().min(1).max(200).optional(),
    kind: z.enum(["LINE", "SUBTOTAL"]).optional(),
    positionX: z.number().optional(),
    positionY: z.number().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Ingen felter å oppdatere.",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const routeIds = tryParseRouteIds(await params, ["id"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid node identifier." }, { status: 400 });
  }
  const { id } = routeIds;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const node = await updateNode({ id, ...parsed.data });
    return NextResponse.json({ data: node });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Fant ikke noden." }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke oppdatere node." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const routeIds = tryParseRouteIds(await params, ["id"] as const);
  if (!routeIds) {
    return NextResponse.json({ error: "Invalid node identifier." }, { status: 400 });
  }
  const { id } = routeIds;

  try {
    await deleteNode(id);
    return NextResponse.json({ data: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Fant ikke noden." }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke slette node." },
      { status: 500 },
    );
  }
}
