import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { createDdPostComment } from "@/server/services/dd-comment-service";

const createCommentSchema = z.object({
  content: z.string().trim().min(2),
  parentCommentId: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { postId } = await context.params;
    const body = await request.json();
    const values = createCommentSchema.parse(body);
    const thread = await createDdPostComment(session.user.id, postId, {
      content: values.content,
      parentCommentId: values.parentCommentId || null,
    });
    return NextResponse.json({ data: thread });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette kommentaren." },
      { status: 400 },
    );
  }
}
