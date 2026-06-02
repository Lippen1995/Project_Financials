import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  buildMetricMappingModel,
  createAlias,
  MetricAliasConflictError,
} from "@/server/services/metric-mapping-service";

export async function GET() {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const model = await buildMetricMappingModel();
  return NextResponse.json({ data: model });
}

const createSchema = z.object({
  alias: z.string().min(1).max(200),
  metricKey: z.string().min(1),
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
    const alias = await createAlias({
      alias: parsed.data.alias,
      metricKey: parsed.data.metricKey,
      userId: user!.id,
    });
    return NextResponse.json({ data: alias }, { status: 201 });
  } catch (err) {
    if (err instanceof MetricAliasConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kunne ikke opprette alias." },
      { status: 400 },
    );
  }
}
