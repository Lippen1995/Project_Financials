import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import {
  createAnnouncementComment,
  getAnnouncementCommentThread,
} from "@/server/services/dd-comment-service";

const querySchema = z.object({
  announcementId: z.string().min(1),
  announcementSourceId: z.string().min(1),
  announcementSourceSystem: z.string().min(1),
  announcementPublishedAt: z.string().optional(),
});

const createCommentSchema = querySchema.extend({
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
      announcementId: url.searchParams.get("announcementId"),
      announcementSourceId: url.searchParams.get("announcementSourceId"),
      announcementSourceSystem: url.searchParams.get("announcementSourceSystem"),
      announcementPublishedAt: url.searchParams.get("announcementPublishedAt") ?? undefined,
    });

    const data = await getAnnouncementCommentThread(session.user.id, roomId, values);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente kommentartråd." },
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
    const data = await createAnnouncementComment(session.user.id, roomId, {
      announcementId: values.announcementId,
      announcementSourceId: values.announcementSourceId,
      announcementSourceSystem: values.announcementSourceSystem,
      announcementPublishedAt: values.announcementPublishedAt
        ? new Date(values.announcementPublishedAt)
        : null,
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
