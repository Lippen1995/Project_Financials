import { WorkspaceStatus } from "@prisma/client";

import {
  CompanyFinancialMetricDiscussionSummary,
  DdCommentSummary,
  DdCommentThreadSummary,
  DdCommentThreadTargetType,
} from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/server/services/workspace-service";

type CommentThreadRecord = {
  id: string;
  roomId: string;
  targetType: DdCommentThreadTargetType;
  targetFinancialStatementId: string | null;
  targetFinancialMetricKey: string | null;
  targetPostId: string | null;
  targetFindingId: string | null;
  targetTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  comments: Array<{
    id: string;
    threadId: string;
    parentCommentId: string | null;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    author: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
};

function toUserSummary(user: { id: string; name: string | null; email: string }) {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
  };
}

function toCommentSummary(comment: CommentThreadRecord["comments"][number]): DdCommentSummary {
  return {
    id: comment.id,
    threadId: comment.threadId,
    parentCommentId: comment.parentCommentId,
    content: comment.content,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: toUserSummary(comment.author),
  };
}

export function toCommentThreadSummary(thread: CommentThreadRecord): DdCommentThreadSummary {
  const comments = thread.comments.map(toCommentSummary);

  return {
    id: thread.id,
    roomId: thread.roomId,
    targetType: thread.targetType,
    targetFinancialStatementId: thread.targetFinancialStatementId,
    targetFinancialMetricKey: thread.targetFinancialMetricKey,
    targetPostId: thread.targetPostId,
    targetFindingId: thread.targetFindingId,
    targetTaskId: thread.targetTaskId,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    createdBy: toUserSummary(thread.createdBy),
    commentCount: comments.length,
    latestCommentAt: comments.length ? comments[comments.length - 1].createdAt : null,
    comments,
  };
}

function ensureActiveRoomMutation(room: { status: "ACTIVE" | "ARCHIVED"; workspace: { status: WorkspaceStatus } }) {
  if (room.workspace.status !== "ACTIVE" || room.status !== "ACTIVE") {
    throw new Error("Kommentarer kan bare opprettes i aktive rom og aktive workspaces.");
  }
}

async function touchRoom(roomId: string) {
  await prisma.ddRoom.update({
    where: { id: roomId },
    data: { lastActivityAt: new Date() },
  });
}

async function getAuthorizedTask(actorUserId: string, taskId: string) {
  const task = await prisma.ddTask.findUnique({
    where: { id: taskId },
    include: {
      room: {
        include: {
          workspace: true,
        },
      },
    },
  });

  if (!task) {
    throw new Error("Oppgaven finnes ikke.");
  }

  await requireWorkspaceMembership(actorUserId, task.room.workspaceId);
  return task;
}

async function getAuthorizedFinding(actorUserId: string, findingId: string) {
  const finding = await prisma.ddFinding.findUnique({
    where: { id: findingId },
    include: {
      room: {
        include: {
          workspace: true,
        },
      },
    },
  });

  if (!finding) {
    throw new Error("Funnet finnes ikke.");
  }

  await requireWorkspaceMembership(actorUserId, finding.room.workspaceId);
  return finding;
}

async function getAuthorizedPost(actorUserId: string, postId: string) {
  const post = await prisma.ddPost.findUnique({
    where: { id: postId },
    include: {
      room: {
        include: {
          workspace: true,
        },
      },
    },
  });

  if (!post) {
    throw new Error("Innlegget finnes ikke.");
  }

  await requireWorkspaceMembership(actorUserId, post.room.workspaceId);
  return post;
}

async function getAuthorizedRoom(actorUserId: string, roomId: string) {
  const room = await prisma.ddRoom.findUnique({
    where: { id: roomId },
    include: {
      workspace: true,
      primaryCompany: true,
    },
  });

  if (!room) {
    throw new Error("DD-rommet finnes ikke.");
  }

  await requireWorkspaceMembership(actorUserId, room.workspaceId);
  return room;
}

async function getOrCreateThread(
  actorUserId: string,
  input:
    | { roomId: string; targetType: "ROOM_POST"; targetPostId: string }
    | { roomId: string; targetType: "TASK"; targetTaskId: string }
    | { roomId: string; targetType: "FINDING"; targetFindingId: string },
) {
  const where =
    input.targetType === "ROOM_POST"
      ? {
          roomId: input.roomId,
          targetType: "ROOM_POST" as const,
          targetPostId: input.targetPostId,
        }
      : input.targetType === "TASK"
      ? {
          roomId: input.roomId,
          targetType: "TASK" as const,
          targetTaskId: input.targetTaskId,
        }
      : {
          roomId: input.roomId,
          targetType: "FINDING" as const,
          targetFindingId: input.targetFindingId,
        };

  const existing = await prisma.ddCommentThread.findFirst({
    where,
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
  });

  if (existing) {
    return existing;
  }

  return prisma.ddCommentThread.create({
    data:
      input.targetType === "ROOM_POST"
        ? {
            roomId: input.roomId,
            targetType: "ROOM_POST",
            targetPostId: input.targetPostId,
            createdByUserId: actorUserId,
          }
        : input.targetType === "TASK"
        ? {
            roomId: input.roomId,
            targetType: "TASK",
            targetTaskId: input.targetTaskId,
            createdByUserId: actorUserId,
          }
        : {
            roomId: input.roomId,
            targetType: "FINDING",
            targetFindingId: input.targetFindingId,
            createdByUserId: actorUserId,
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
  });
}

async function createCommentForThread(
  actorUserId: string,
  thread: CommentThreadRecord,
  content: string,
  parentCommentId?: string | null,
) {
  const trimmedContent = content.trim();
  if (trimmedContent.length < 2) {
    throw new Error("Kommentaren ma inneholde minst to tegn.");
  }

  if (parentCommentId) {
    const parent = await prisma.ddComment.findUnique({
      where: { id: parentCommentId },
      select: { threadId: true },
    });

    if (!parent || parent.threadId !== thread.id) {
      throw new Error("Svar-kommentaren horer ikke til samme tråd.");
    }
  }

  await prisma.$transaction([
    prisma.ddComment.create({
      data: {
        threadId: thread.id,
        authorUserId: actorUserId,
        parentCommentId: parentCommentId ?? null,
        content: trimmedContent,
      },
    }),
    prisma.ddCommentThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() },
    }),
  ]);

  await touchRoom(thread.roomId);

  const updatedThread = await prisma.ddCommentThread.findUnique({
    where: { id: thread.id },
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
  });

  if (!updatedThread) {
    throw new Error("Kommentartraden kunne ikke hentes.");
  }

  return toCommentThreadSummary(updatedThread);
}

export async function getTaskCommentThread(actorUserId: string, taskId: string) {
  const task = await getAuthorizedTask(actorUserId, taskId);

  const thread = await prisma.ddCommentThread.findFirst({
    where: {
      roomId: task.roomId,
      targetType: "TASK",
      targetTaskId: task.id,
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
  });

  return thread ? toCommentThreadSummary(thread) : null;
}

export async function getFindingCommentThread(actorUserId: string, findingId: string) {
  const finding = await getAuthorizedFinding(actorUserId, findingId);

  const thread = await prisma.ddCommentThread.findFirst({
    where: {
      roomId: finding.roomId,
      targetType: "FINDING",
      targetFindingId: finding.id,
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
  });

  return thread ? toCommentThreadSummary(thread) : null;
}

export async function createDdTaskComment(
  actorUserId: string,
  taskId: string,
  input: { content: string; parentCommentId?: string | null },
) {
  const task = await getAuthorizedTask(actorUserId, taskId);
  ensureActiveRoomMutation({ status: task.room.status, workspace: task.room.workspace });

  const thread = await getOrCreateThread(actorUserId, {
    roomId: task.roomId,
    targetType: "TASK",
    targetTaskId: task.id,
  });

  return createCommentForThread(actorUserId, thread, input.content, input.parentCommentId);
}

export async function createDdFindingComment(
  actorUserId: string,
  findingId: string,
  input: { content: string; parentCommentId?: string | null },
) {
  const finding = await getAuthorizedFinding(actorUserId, findingId);
  ensureActiveRoomMutation({ status: finding.room.status, workspace: finding.room.workspace });

  const thread = await getOrCreateThread(actorUserId, {
    roomId: finding.roomId,
    targetType: "FINDING",
    targetFindingId: finding.id,
  });

  return createCommentForThread(actorUserId, thread, input.content, input.parentCommentId);
}

export async function createDdPostComment(
  actorUserId: string,
  postId: string,
  input: { content: string; parentCommentId?: string | null },
) {
  const post = await getAuthorizedPost(actorUserId, postId);
  ensureActiveRoomMutation({ status: post.room.status, workspace: post.room.workspace });

  const thread = await getOrCreateThread(actorUserId, {
    roomId: post.roomId,
    targetType: "ROOM_POST",
    targetPostId: post.id,
  });

  return createCommentForThread(actorUserId, thread, input.content, input.parentCommentId);
}

export async function getAnnouncementCommentThread(
  actorUserId: string,
  roomId: string,
  input: {
    announcementId: string;
    announcementSourceId: string;
    announcementSourceSystem: string;
  },
) {
  await getAuthorizedRoom(actorUserId, roomId);

  const thread = await prisma.ddCommentThread.findFirst({
    where: {
      roomId,
      targetType: "ANNOUNCEMENT",
      targetAnnouncementId: input.announcementId,
      targetAnnouncementSourceId: input.announcementSourceId,
      targetAnnouncementSourceSystem: input.announcementSourceSystem,
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
  });

  return thread ? toCommentThreadSummary(thread) : null;
}

export async function createAnnouncementComment(
  actorUserId: string,
  roomId: string,
  input: {
    announcementId: string;
    announcementSourceId: string;
    announcementSourceSystem: string;
    announcementPublishedAt?: Date | null;
    content: string;
    parentCommentId?: string | null;
  },
) {
  const room = await getAuthorizedRoom(actorUserId, roomId);
  ensureActiveRoomMutation({ status: room.status, workspace: room.workspace });

  const thread =
    (await prisma.ddCommentThread.findFirst({
      where: {
        roomId,
        targetType: "ANNOUNCEMENT",
        targetAnnouncementId: input.announcementId,
        targetAnnouncementSourceId: input.announcementSourceId,
        targetAnnouncementSourceSystem: input.announcementSourceSystem,
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
    })) ??
    (await prisma.ddCommentThread.create({
      data: {
        roomId,
        targetType: "ANNOUNCEMENT",
        targetCompanyId: room.primaryCompanyId,
        targetAnnouncementId: input.announcementId,
        targetAnnouncementSourceId: input.announcementSourceId,
        targetAnnouncementSourceSystem: input.announcementSourceSystem,
        targetAnnouncementPublishedAt: input.announcementPublishedAt ?? null,
        createdByUserId: actorUserId,
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
    }));

  return createCommentForThread(actorUserId, thread, input.content, input.parentCommentId);
}

export async function listFinancialStatementCommentThreads(actorUserId: string, roomId: string) {
  const room = await getAuthorizedRoom(actorUserId, roomId);

  const statements = await prisma.financialStatement.findMany({
    where: {
      companyId: room.primaryCompanyId,
    },
    orderBy: [{ fiscalYear: "desc" }],
    select: {
      id: true,
      fiscalYear: true,
      sourceSystem: true,
      sourceEntityType: true,
      sourceId: true,
      fetchedAt: true,
      normalizedAt: true,
    },
  });

  if (statements.length === 0) {
    return [];
  }

  const threads = await prisma.ddCommentThread.findMany({
    where: {
      roomId,
      targetType: "FINANCIAL_STATEMENT",
      targetFinancialStatementId: {
        in: statements.map((statement) => statement.id),
      },
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
  });

  const threadsByStatementId = new Map(
    threads
      .filter((thread) => thread.targetFinancialStatementId)
      .map((thread) => [thread.targetFinancialStatementId as string, toCommentThreadSummary(thread)]),
  );

  return statements.map((statement) => ({
    financialStatementId: statement.id,
    fiscalYear: statement.fiscalYear,
    sourceSystem: statement.sourceSystem,
    sourceEntityType: statement.sourceEntityType,
    sourceId: statement.sourceId,
    fetchedAt: statement.fetchedAt,
    normalizedAt: statement.normalizedAt,
    thread: threadsByStatementId.get(statement.id) ?? null,
  }));
}

export async function createFinancialStatementComment(
  actorUserId: string,
  roomId: string,
  financialStatementId: string,
  input: { content: string; parentCommentId?: string | null },
) {
  const room = await getAuthorizedRoom(actorUserId, roomId);
  ensureActiveRoomMutation({ status: room.status, workspace: room.workspace });

  const statement = await prisma.financialStatement.findUnique({
    where: { id: financialStatementId },
    select: {
      id: true,
      companyId: true,
    },
  });

  if (!statement || statement.companyId !== room.primaryCompanyId) {
    throw new Error("Valgt regnskap horer ikke til selskapet i dette DD-rommet.");
  }

  const thread =
    (await prisma.ddCommentThread.findFirst({
      where: {
        roomId,
        targetType: "FINANCIAL_STATEMENT",
        targetFinancialStatementId: financialStatementId,
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
    })) ??
    (await prisma.ddCommentThread.create({
      data: {
        roomId,
        targetType: "FINANCIAL_STATEMENT",
        targetCompanyId: room.primaryCompanyId,
        targetFinancialStatementId: financialStatementId,
        createdByUserId: actorUserId,
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
    }));

  return createCommentForThread(actorUserId, thread, input.content, input.parentCommentId);
}

export async function listFinancialMetricCommentThreads(
  actorUserId: string,
  roomId: string,
): Promise<CompanyFinancialMetricDiscussionSummary[]> {
  const room = await getAuthorizedRoom(actorUserId, roomId);

  const statements = await prisma.financialStatement.findMany({
    where: {
      companyId: room.primaryCompanyId,
    },
    select: {
      id: true,
      fiscalYear: true,
    },
  });

  if (statements.length === 0) {
    return [];
  }

  const fiscalYearByStatementId = new Map(statements.map((statement) => [statement.id, statement.fiscalYear]));

  const threads = await prisma.ddCommentThread.findMany({
    where: {
      roomId,
      targetType: "FINANCIAL_STATEMENT",
      targetFinancialStatementId: {
        in: statements.map((statement) => statement.id),
      },
      NOT: {
        targetFinancialMetricKey: null,
      },
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
  });

  return threads
    .filter(
      (thread): thread is typeof thread & {
        targetFinancialStatementId: string;
        targetFinancialMetricKey: string;
      } =>
        typeof thread.targetFinancialStatementId === "string" &&
        typeof thread.targetFinancialMetricKey === "string" &&
        fiscalYearByStatementId.has(thread.targetFinancialStatementId),
    )
    .map((thread) => ({
      financialStatementId: thread.targetFinancialStatementId,
      fiscalYear: fiscalYearByStatementId.get(thread.targetFinancialStatementId) ?? 0,
      metricKey: thread.targetFinancialMetricKey,
      thread: toCommentThreadSummary(thread),
    }));
}

export async function createFinancialMetricComment(
  actorUserId: string,
  roomId: string,
  input: {
    financialStatementId: string;
    financialMetricKey: string;
    content: string;
    parentCommentId?: string | null;
  },
) {
  const room = await getAuthorizedRoom(actorUserId, roomId);
  ensureActiveRoomMutation({ status: room.status, workspace: room.workspace });

  const metricKey = input.financialMetricKey.trim();
  if (metricKey.length < 1) {
    throw new Error("Finansiell rad mangler.");
  }

  const statement = await prisma.financialStatement.findUnique({
    where: { id: input.financialStatementId },
    select: {
      id: true,
      companyId: true,
    },
  });

  if (!statement || statement.companyId !== room.primaryCompanyId) {
    throw new Error("Valgt regnskap horer ikke til selskapet i dette DD-rommet.");
  }

  const thread =
    (await prisma.ddCommentThread.findFirst({
      where: {
        roomId,
        targetType: "FINANCIAL_STATEMENT",
        targetFinancialStatementId: input.financialStatementId,
        targetFinancialMetricKey: metricKey,
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
    })) ??
    (await prisma.ddCommentThread.create({
      data: {
        roomId,
        targetType: "FINANCIAL_STATEMENT",
        targetCompanyId: room.primaryCompanyId,
        targetFinancialStatementId: input.financialStatementId,
        targetFinancialMetricKey: metricKey,
        createdByUserId: actorUserId,
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
    }));

  return createCommentForThread(actorUserId, thread, input.content, input.parentCommentId);
}
