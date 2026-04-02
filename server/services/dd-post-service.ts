import { WorkspaceStatus } from "@prisma/client";

import { DdPostSummary } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { toCommentThreadSummary } from "@/server/services/dd-comment-service";
import { requireWorkspaceMembership } from "@/server/services/workspace-service";

function toUserSummary(user: { id: string; name: string | null; email: string }) {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
  };
}

function ensureActiveRoomMutation(room: {
  status: "ACTIVE" | "ARCHIVED";
  workspace: { status: WorkspaceStatus };
}) {
  if (room.workspace.status !== "ACTIVE" || room.status !== "ACTIVE") {
    throw new Error("Poster kan bare opprettes i aktive rom og aktive workspaces.");
  }
}

async function touchRoom(roomId: string) {
  await prisma.ddRoom.update({
    where: { id: roomId },
    data: { lastActivityAt: new Date() },
  });
}

function toPostSummary(post: {
  id: string;
  roomId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null; email: string };
  commentThreads: Array<Parameters<typeof toCommentThreadSummary>[0]>;
}): DdPostSummary {
  const primaryThread = post.commentThreads[0] ?? null;

  return {
    id: post.id,
    roomId: post.roomId,
    content: post.content,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: toUserSummary(post.author),
    commentThread: primaryThread ? toCommentThreadSummary(primaryThread) : null,
  };
}

export async function getRoomPosts(actorUserId: string, roomId: string): Promise<DdPostSummary[]> {
  const room = await prisma.ddRoom.findUnique({
    where: { id: roomId },
    select: { workspaceId: true },
  });

  if (!room) {
    throw new Error("DD-rommet finnes ikke.");
  }

  await requireWorkspaceMembership(actorUserId, room.workspaceId);

  const posts = await prisma.ddPost.findMany({
    where: {
      roomId,
      deletedAt: null,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      commentThreads: {
        where: {
          targetType: "ROOM_POST",
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          comments: {
            where: { deletedAt: null },
            include: {
              author: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return posts.map(toPostSummary);
}

export async function createDdPost(actorUserId: string, roomId: string, content: string) {
  const room = await prisma.ddRoom.findUnique({
    where: { id: roomId },
    include: {
      workspace: true,
    },
  });

  if (!room) {
    throw new Error("DD-rommet finnes ikke.");
  }

  await requireWorkspaceMembership(actorUserId, room.workspaceId);
  ensureActiveRoomMutation(room);

  const trimmedContent = content.trim();
  if (trimmedContent.length < 2) {
    throw new Error("Innlegget må inneholde minst to tegn.");
  }

  const post = await prisma.ddPost.create({
    data: {
      roomId,
      authorUserId: actorUserId,
      content: trimmedContent,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      commentThreads: {
        where: {
          targetType: "ROOM_POST",
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          comments: {
            where: { deletedAt: null },
            include: {
              author: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  await touchRoom(roomId);
  return toPostSummary(post);
}
