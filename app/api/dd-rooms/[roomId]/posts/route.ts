import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { createDdPost, getRoomPosts } from "@/server/services/dd-post-service";

const createPostSchema = z.object({
  content: z.string().trim().min(2),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await context.params;
    const posts = await getRoomPosts(session.user.id, roomId);
    return NextResponse.json({ data: posts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente poster." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { roomId } = await context.params;
    const body = await request.json();
    const values = createPostSchema.parse(body);
    const post = await createDdPost(session.user.id, roomId, values.content);
    return NextResponse.json({ data: post });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette innlegget." },
      { status: 400 },
    );
  }
}
