import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  isValidShadowRoute,
  runPdfParserRouteShadowExecution,
  VALID_SHADOW_ROUTES,
} from "@/server/services/pdf-parser-route-shadow-execution-service";

const bodySchema = z.object({
  annualReportId: z.string().trim().min(1).max(64),
  routes: z
    .array(z.string())
    .min(1, "At least one route is required.")
    .refine(
      (routes) => routes.every(isValidShadowRoute),
      { message: `Each route must be one of: ${VALID_SHADOW_ROUTES.join(", ")}.` },
    ),
  reason: z.string().trim().min(1).max(500).optional(),
  runId: z.string().trim().min(1).max(128).optional(),
});

export async function POST(request: NextRequest) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await runPdfParserRouteShadowExecution({
      annualReportId: parsed.data.annualReportId,
      requestedRoutes: parsed.data.routes as never,
      reason: parsed.data.reason ?? "api-request",
      source: "API",
      runId: parsed.data.runId,
      requestedBy: user.id,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    const isNotFound = message.includes("not found");
    return NextResponse.json(
      { error: isNotFound ? message : "Could not run PDF parser route shadow execution." },
      { status: isNotFound ? 404 : 500 },
    );
  }
}
