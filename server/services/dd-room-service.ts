import { DdRoomStatus, DdWorkstream, WorkspaceStatus } from "@prisma/client";

import { DdRoomActivityItem, DdRoomDetail, DdRoomSummary } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { getCompanyProfile } from "@/server/services/company-service";
import {
  buildFindingsSummary,
  getDdDecisionHistory,
  getDdConclusion,
  getDdMandate,
  getEvidenceContext,
  getRoomFindings,
} from "@/server/services/dd-investment-service";
import { getRoomPosts } from "@/server/services/dd-post-service";
import { buildWorkflowSummary, getRoomWorkflowTasks } from "@/server/services/dd-workflow-service";
import { getUserWorkspaceCapabilities, requireWorkspaceMembership } from "@/server/services/workspace-service";

function toDdRoomSummary(room: {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: DdRoomStatus;
  archivedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  primaryCompany: {
    id: string;
    orgNumber: string;
    slug: string;
    name: string;
    legalForm: string | null;
    status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
    industryCode: { code: string; title: string } | null;
  };
  _count: {
    posts: number;
    commentThreads: number;
  };
}): DdRoomSummary {
  return {
    id: room.id,
    workspaceId: room.workspaceId,
    name: room.name,
    description: room.description,
    status: room.status,
    archivedAt: room.archivedAt,
    lastActivityAt: room.lastActivityAt,
    createdAt: room.createdAt,
    primaryCompany: {
      id: room.primaryCompany.id,
      orgNumber: room.primaryCompany.orgNumber,
      slug: room.primaryCompany.slug,
      name: room.primaryCompany.name,
      legalForm: room.primaryCompany.legalForm,
      status: room.primaryCompany.status,
      industryCode: room.primaryCompany.industryCode
        ? {
            code: room.primaryCompany.industryCode.code,
            title: room.primaryCompany.industryCode.title,
          }
        : null,
    },
    postCount: room._count.posts,
    commentThreadCount: room._count.commentThreads,
  };
}

function buildActivity(room: DdRoomSummary, posts: DdRoomDetail["posts"]["items"]): DdRoomActivityItem[] {
  const items: DdRoomActivityItem[] = [
    {
      id: `${room.id}:created`,
      type: "ROOM_CREATED",
      occurredAt: room.createdAt,
      actorLabel: "System",
      message: `DD-rommet ble opprettet for ${room.primaryCompany.name}.`,
    },
  ];

  if (room.status === "ARCHIVED" && room.archivedAt) {
    items.unshift({
      id: `${room.id}:archived`,
      type: "ROOM_ARCHIVED",
      occurredAt: room.archivedAt,
      actorLabel: "System",
      message: "Rommet er arkivert og ligger na i inaktiv oversikt.",
    });
  }

  if (room.status === "ACTIVE" && room.archivedAt === null && room.lastActivityAt.getTime() !== room.createdAt.getTime()) {
    items.unshift({
      id: `${room.id}:reopened`,
      type: "ROOM_REOPENED",
      occurredAt: room.lastActivityAt,
      actorLabel: "System",
      message: "Rommet er aktivt og klart for videre samarbeid.",
    });
  }

  for (const post of posts.slice(0, 6)) {
    items.push({
      id: `${room.id}:post:${post.id}`,
      type: "ROOM_POSTED",
      occurredAt: post.createdAt,
      actorLabel: post.author.name ?? post.author.email,
      message: "La inn et rominnlegg i aktivitetsfeeden.",
    });
  }

  return items.sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
}

async function findPrimaryCompany(companyReference: string) {
  const reference = companyReference.trim();
  if (!reference) {
    throw new Error("Du ma oppgi organisasjonsnummer eller slug for selskapet.");
  }

  const profile = await getCompanyProfile(reference);
  if (!profile) {
    throw new Error("Fant ikke selskapet du prover a koble til DD-rommet.");
  }

  const company = await prisma.company.findUnique({
    where: { orgNumber: profile.company.orgNumber },
  });

  if (!company) {
    throw new Error("Selskapet kunne ikke lagres lokalt.");
  }

  return company;
}

export async function createDdRoom(
  actorUserId: string,
  workspaceId: string,
  input: { name?: string | null; description?: string | null; companyReference: string },
) {
  const membership = await requireWorkspaceMembership(actorUserId, workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canCreateDdRoom) {
    throw new Error("DD-rom krever utvidet tilgang og et aktivt workspace.");
  }
  if (membership.workspace.status !== WorkspaceStatus.ACTIVE) {
    throw new Error("Du kan ikke opprette DD-rom i et arkivert workspace.");
  }

  const company = await findPrimaryCompany(input.companyReference);
  const trimmedName = input.name?.trim();
  const trimmedDescription = input.description?.trim();

  return prisma.ddRoom.create({
    data: {
      workspaceId,
      primaryCompanyId: company.id,
      name: trimmedName && trimmedName.length >= 2 ? trimmedName : `DD - ${company.name}`,
      description: trimmedDescription ? trimmedDescription : null,
      status: DdRoomStatus.ACTIVE,
      lastActivityAt: new Date(),
    },
    select: { id: true },
  });
}

export async function updateDdRoomStatus(actorUserId: string, roomId: string, status: DdRoomStatus) {
  const room = await prisma.ddRoom.findUnique({
    where: { id: roomId },
    select: { id: true, workspaceId: true },
  });

  if (!room) {
    throw new Error("DD-rommet finnes ikke.");
  }

  const membership = await requireWorkspaceMembership(actorUserId, room.workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!capabilities.canManageWorkspace) {
    throw new Error("Du kan ikke endre status pa dette DD-rommet.");
  }

  if (membership.workspace.status !== WorkspaceStatus.ACTIVE && status === DdRoomStatus.ACTIVE) {
    throw new Error("Workspace-et ma vare aktivt for a gjenapne rom.");
  }

  await prisma.ddRoom.update({
    where: { id: roomId },
    data: {
      status,
      archivedAt: status === DdRoomStatus.ARCHIVED ? new Date() : null,
      lastActivityAt: new Date(),
    },
  });

  return room.workspaceId;
}

export async function getDdRoomDetail(
  userId: string,
  roomId: string,
  activeWorkstream: DdWorkstream | null = null,
): Promise<DdRoomDetail | null> {
  const room = await prisma.ddRoom.findUnique({
    where: { id: roomId },
    include: {
      primaryCompany: {
        include: {
          industryCode: {
            select: { code: true, title: true },
          },
        },
      },
      workspace: {
        include: {
          members: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
            orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
          },
        },
      },
      _count: {
        select: { posts: true, commentThreads: true },
      },
    },
  });

  if (!room) {
    return null;
  }

  const membership = room.workspace.members.find((member) => member.userId === userId);
  if (!membership) {
    throw new Error("Du har ikke tilgang til dette DD-rommet.");
  }

  const roomSummary = toDdRoomSummary(room);
  const capabilities = await getUserWorkspaceCapabilities(
    userId,
    membership.role,
    room.workspace.status,
    room.workspace.type,
  );

  const [workflowTasks, findings, posts, mandate, conclusion, decisionHistory, evidenceContext] = await Promise.all([
    getRoomWorkflowTasks(roomId),
    getRoomFindings(roomId),
    getRoomPosts(userId, roomId),
    getDdMandate(roomId),
    getDdConclusion(roomId),
    getDdDecisionHistory(roomId),
    getEvidenceContext(roomId),
  ]);

  return {
    room: roomSummary,
    workspace: {
      id: room.workspace.id,
      name: room.workspace.name,
      type: room.workspace.type,
      status: room.workspace.status,
      role: membership.role,
      capabilities,
      members: room.workspace.members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        joinedAt: member.joinedAt,
        isCurrentUser: member.userId === userId,
      })),
    },
    activity: buildActivity(roomSummary, posts),
    posts: {
      items: posts,
      totalCount: posts.length,
    },
    mandate,
    workflow: buildWorkflowSummary(workflowTasks, findings, activeWorkstream),
    findings: buildFindingsSummary(findings, activeWorkstream),
    conclusion,
    decisionHistory,
    evidenceContext,
  };
}
