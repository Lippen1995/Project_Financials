import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  deleteAlias,
  MetricAliasConflictError,
  updateAlias,
} from "@/server/services/metric-mapping-service";

const updateSchema = z
  .object({
    alias: z.string().min(1).max(200).optional(),
    metricKey: z.string().min(1).optional(),
  })
  .refine((data) => data.alias !== undefined || data.metricKey !== undefined, {
    message: "Ingen felter å oppdatere.",
  });

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
    const alias = await updateAlias({ id, ...parsed.data });
    return NextResponse.json({ data: alias });
  } catch (err) {
    if (err instanceof MetricAliasConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Fant ikke aliaset." }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke oppdatere alias." },
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
    await deleteAlias(id);
    return NextResponse.json({ data: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Fant ikke aliaset." }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke slette alias." },
      { status: 500 },
    );
  }
}
