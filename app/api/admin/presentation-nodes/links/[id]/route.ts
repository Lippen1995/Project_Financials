import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { deleteLink, updateLink } from "@/server/services/presentation-node-service";

const updateSchema = z.object({ operation: z.enum(["ADD", "SUBTRACT"]) });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const { id } = await params;

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
    const link = await updateLink({ id, operation: parsed.data.operation });
    return NextResponse.json({ data: link });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Fant ikke koblingen." }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke oppdatere kobling." },
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

  const { id } = await params;

  try {
    await deleteLink(id);
    return NextResponse.json({ data: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Fant ikke koblingen." }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke slette kobling." },
      { status: 500 },
    );
  }
}
