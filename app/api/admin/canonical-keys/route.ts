import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  CanonicalKeyError,
  deleteCanonicalKey,
  getCanonicalKeyUsage,
  reassignCanonicalKey,
} from "@/server/services/canonical-key-service";

export async function GET() {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const keys = await getCanonicalKeyUsage();
  return NextResponse.json({ data: { keys } });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    from: z.string().min(1),
    to: z.string().min(1).max(200),
  }),
  z.object({
    action: z.literal("reassign"),
    from: z.string().min(1),
    to: z.string().min(1).max(200),
    companyIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    action: z.literal("delete"),
    key: z.string().min(1),
  }),
]);

export async function POST(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON." }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig forespørsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.action === "delete") {
      await deleteCanonicalKey(parsed.data.key);
      return NextResponse.json({ data: { ok: true } });
    }

    const result = await reassignCanonicalKey({
      from: parsed.data.from,
      to: parsed.data.to,
      companyIds: parsed.data.action === "reassign" ? parsed.data.companyIds : null,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof CanonicalKeyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Operasjonen feilet." },
      { status: 500 },
    );
  }
}
