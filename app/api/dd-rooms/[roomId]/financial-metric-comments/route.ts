import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import {
  createFinancialMetricComment,
  listFinancialMetricCommentThreads,
} from "@/server/services/dd-comment-service";

const querySchema = z.object({
  financialStatementId: z.string().optional(),
  financialMetricKey: z.string().optional(),
});

const createCommentSchema = z.object({
  financialStatementId: z.string().min(1),
  financialMetricKey: z.string().trim().min(1),
  content: z.string().trim().min(2),
  parentCommentId: z.string().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    const url = new URL(request.url);
    const values = querySchema.parse({
      financialStatementId: url.searchParams.get("financialStatementId") ?? undefined,
      financialMetricKey: url.searchParams.get("financialMetricKey") ?? undefined,
    });

    const items = await listFinancialMetricCommentThreads(session.user.id, roomId);
    const data =
      values.financialStatementId && values.financialMetricKey
        ? items.find(
            (item) =>
              item.financialStatementId === values.financialStatementId &&
              item.metricKey === values.financialMetricKey,
          )?.thread ?? null
        : items;

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente finansiell kommentartråd." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await params;
    const body = await request.json();
    const values = createCommentSchema.parse(body);
    const data = await createFinancialMetricComment(session.user.id, roomId, {
      financialStatementId: values.financialStatementId,
      financialMetricKey: values.financialMetricKey,
      content: values.content,
      parentCommentId: values.parentCommentId || null,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette kommentar." },
      { status: 400 },
    );
  }
}
