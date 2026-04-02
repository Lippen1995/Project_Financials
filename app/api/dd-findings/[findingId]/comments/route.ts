import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { createDdFindingComment, getFindingCommentThread } from "@/server/services/dd-comment-service";

const createCommentSchema = z.object({
  content: z.string().trim().min(2),
  parentCommentId: z.string().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { findingId } = await params;
    const thread = await getFindingCommentThread(session.user.id, findingId);
    return NextResponse.json({ data: thread });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente kommentartråd." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { findingId } = await params;
    const body = await request.json();
    const values = createCommentSchema.parse(body);
    const data = await createDdFindingComment(session.user.id, findingId, {
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
