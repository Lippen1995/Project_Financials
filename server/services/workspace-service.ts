import {
  WorkspaceInvitationStatus,
  WorkspaceMemberRole,
  WorkspaceStatus,
  WorkspaceType,
} from "@prisma/client";
import { randomUUID } from "crypto";

import {
  CurrentWorkspaceSummary,
  DdRoomSummary,
  WorkspaceCapabilitySet,
  WorkspaceInvitationSummary,
  WorkspaceMemberSummary,
  WorkspaceSummary,
} from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { getCollaborationEntitlements } from "@/server/billing/subscription";
import {
  listWorkspaceMonitors,
  listWorkspaceNotifications,
  listWorkspaceWatches,
} from "@/server/services/workspace-collaboration-service";

const INVITATION_TTL_DAYS = 14;

type DashboardWorkspaceHome = {
  currentWorkspace: CurrentWorkspaceSummary;
  workspaces: WorkspaceSummary[];
  incomingInvitations: WorkspaceInvitationSummary[];
};

type SessionWorkspaceContext = {
  currentWorkspaceId: string | null;
  currentWorkspaceName: string | null;
  currentWorkspaceType: WorkspaceType | null;
  currentWorkspaceStatus: WorkspaceStatus | null;
  currentWorkspaceRole: WorkspaceMemberRole | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildPersonalWorkspaceName(user: { name: string | null; email: string }) {
  const base = user.name?.trim() || user.email;
  return `${base} sitt workspace`;
}

function getWorkspaceCapabilities(
  role: WorkspaceMemberRole,
  status: WorkspaceStatus,
  type: WorkspaceType,
  entitlements: ReturnType<typeof getCollaborationEntitlements>,
): WorkspaceCapabilitySet {
  const active = status === WorkspaceStatus.ACTIVE;
  const canManageWorkspace = active && (role === WorkspaceMemberRole.OWNER || role === WorkspaceMemberRole.ADMIN);
  const canInviteMembers =
    canManageWorkspace && type === WorkspaceType.TEAM && entitlements.canUseTeamWorkspaces;
  const canRemoveMembers = canInviteMembers;

  return {
    canManageWorkspace,
    canInviteMembers,
    canRemoveMembers,
    canCreateDdRoom: active && entitlements.canUseDdRooms,
    canManageWatches: active && entitlements.canUseWorkspaceWatches,
    canManageMonitors: active && entitlements.canUseWorkspaceMonitors,
    canManageNotifications: active && entitlements.canUseWorkspaceInbox,
    canPostToDdRoom: active && entitlements.canUseDdRooms,
  };
}

export function resolveWorkspaceCapabilities(
  role: WorkspaceMemberRole,
  status: WorkspaceStatus,
  type: WorkspaceType,
  entitlements: ReturnType<typeof getCollaborationEntitlements>,
) {
  return getWorkspaceCapabilities(role, status, type, entitlements);
}

export async function getUserWorkspaceCapabilities(
  userId: string,
  role: WorkspaceMemberRole,
  status: WorkspaceStatus,
  type: WorkspaceType,
) {
  const subscription = await prisma.subscription.findUnique({
    where: {
      userId,
    },
    select: {
      status: true,
      plan: true,
    },
  });

  return getWorkspaceCapabilities(
    role,
    status,
    type,
    getCollaborationEntitlements(subscription?.status, subscription?.plan),
  );
}

function isManager(role: WorkspaceMemberRole) {
  return role === WorkspaceMemberRole.OWNER || role === WorkspaceMemberRole.ADMIN;
}

function toDdRoomSummary(room: {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
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
    industryCode: {
      code: string;
      title: string;
    } | null;
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

async function expireInvitationsForEmail(email: string) {
  await prisma.workspaceInvitation.updateMany({
    where: {
      email,
      status: WorkspaceInvitationStatus.PENDING,
      expiresAt: {
        lt: new Date(),
      },
    },
    data: {
      status: WorkspaceInvitationStatus.EXPIRED,
      respondedAt: new Date(),
    },
  });
}

export async function ensureUserWorkspaceState(userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        personalWorkspace: {
          select: {
            id: true,
          },
        },
        workspaceMemberships: {
          include: {
            workspace: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new Error("Brukeren finnes ikke.");
    }

    let personalWorkspaceId = user.personalWorkspace?.id ?? null;

    if (!personalWorkspaceId) {
      const workspace = await tx.workspace.create({
        data: {
          name: buildPersonalWorkspaceName(user),
          type: WorkspaceType.PERSONAL,
          personalOwnerId: user.id,
          members: {
            create: {
              userId: user.id,
              role: WorkspaceMemberRole.OWNER,
            },
          },
        },
        select: {
          id: true,
        },
      });

      personalWorkspaceId = workspace.id;
    } else {
      await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: personalWorkspaceId,
            userId: user.id,
          },
        },
        update: {
          role: WorkspaceMemberRole.OWNER,
        },
        create: {
          workspaceId: personalWorkspaceId,
          userId: user.id,
          role: WorkspaceMemberRole.OWNER,
        },
      });
    }

    const memberships = await tx.workspaceMember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: [{ workspace: { type: "asc" } }, { createdAt: "asc" }],
    });

    const accessibleWorkspaceIds = memberships.map((membership) => membership.workspaceId);
    const activeWorkspaceIds = memberships
      .filter((membership) => membership.workspace.status === WorkspaceStatus.ACTIVE)
      .map((membership) => membership.workspaceId);

    const preferredWorkspaceId =
      (user.lastWorkspaceId && activeWorkspaceIds.includes(user.lastWorkspaceId) && user.lastWorkspaceId) ||
      (personalWorkspaceId && activeWorkspaceIds.includes(personalWorkspaceId) ? personalWorkspaceId : null) ||
      activeWorkspaceIds[0] ||
      personalWorkspaceId ||
      accessibleWorkspaceIds[0] ||
      null;

    if (preferredWorkspaceId && user.lastWorkspaceId !== preferredWorkspaceId) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          lastWorkspaceId: preferredWorkspaceId,
        },
      });
    }

    return {
      personalWorkspaceId,
      currentWorkspaceId: preferredWorkspaceId,
    };
  });
}

function toWorkspaceSummary(
  membership: {
    role: WorkspaceMemberRole;
    workspace: {
      id: string;
      name: string;
      type: WorkspaceType;
      status: WorkspaceStatus;
      members: { id: string }[];
      ddRooms: { status: "ACTIVE" | "ARCHIVED" }[];
      watches: { status: "ACTIVE" | "ARCHIVED" }[];
      notifications: { id: string }[];
    };
  },
): WorkspaceSummary {
  const activeDdRoomCount = membership.workspace.ddRooms.filter((room) => room.status === "ACTIVE").length;
  const archivedDdRoomCount = membership.workspace.ddRooms.length - activeDdRoomCount;
  const activeWatchCount = membership.workspace.watches.filter((watch) => watch.status === "ACTIVE").length;
  const archivedWatchCount = membership.workspace.watches.length - activeWatchCount;

  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    type: membership.workspace.type,
    status: membership.workspace.status,
    role: membership.role,
    memberCount: membership.workspace.members.length,
    activeDdRoomCount,
    archivedDdRoomCount,
    activeWatchCount,
    archivedWatchCount,
    unreadNotificationCount: membership.workspace.notifications.length,
  };
}

function toWorkspaceMemberSummary(
  member: {
    id: string;
    userId: string;
    role: WorkspaceMemberRole;
    joinedAt: Date;
    user: {
      name: string | null;
      email: string;
    };
  },
  currentUserId: string,
): WorkspaceMemberSummary {
  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    joinedAt: member.joinedAt,
    isCurrentUser: member.userId === currentUserId,
  };
}

function toInvitationSummary(invitation: {
  id: string;
  email: string;
  role: WorkspaceMemberRole;
  status: WorkspaceInvitationStatus;
  expiresAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
  invitedBy: {
    name: string | null;
    email: string;
  };
}): WorkspaceInvitationSummary {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    respondedAt: invitation.respondedAt,
    createdAt: invitation.createdAt,
    invitedByName: invitation.invitedBy.name,
    invitedByEmail: invitation.invitedBy.email,
  };
}

export async function getDashboardWorkspaceHome(
  userId: string,
  requestedWorkspaceId?: string | null,
): Promise<DashboardWorkspaceHome> {
  const setup = await ensureUserWorkspaceState(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      lastWorkspaceId: true,
    },
  });

  if (!user) {
    throw new Error("Brukeren finnes ikke.");
  }

  await expireInvitationsForEmail(normalizeEmail(user.email));

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
    },
    include: {
      workspace: {
        include: {
          members: {
            select: {
              id: true,
            },
          },
          ddRooms: {
            select: {
              status: true,
            },
          },
          watches: {
            select: {
              status: true,
            },
          },
          notifications: {
            where: {
              readAt: null,
            },
            select: {
              id: true,
            },
          },
        },
      },
    },
    orderBy: [{ workspace: { type: "asc" } }, { workspace: { name: "asc" } }],
  });

  if (memberships.length === 0) {
    throw new Error("Brukeren har ingen tilgjengelige workspaces.");
  }

  const accessibleWorkspaceIds = memberships.map((membership) => membership.workspaceId);
  const activeWorkspaceIds = memberships
    .filter((membership) => membership.workspace.status === WorkspaceStatus.ACTIVE)
    .map((membership) => membership.workspaceId);

  const resolvedWorkspaceId =
    (requestedWorkspaceId && accessibleWorkspaceIds.includes(requestedWorkspaceId) && requestedWorkspaceId) ||
    (user.lastWorkspaceId && activeWorkspaceIds.includes(user.lastWorkspaceId) && user.lastWorkspaceId) ||
    (setup.personalWorkspaceId && activeWorkspaceIds.includes(setup.personalWorkspaceId) && setup.personalWorkspaceId) ||
    activeWorkspaceIds[0] ||
    accessibleWorkspaceIds[0];

  if (user.lastWorkspaceId !== resolvedWorkspaceId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastWorkspaceId: resolvedWorkspaceId,
      },
    });
  }

  const workspaceSummaries = memberships.map(toWorkspaceSummary);
  const currentWorkspaceMembership = memberships.find((membership) => membership.workspaceId === resolvedWorkspaceId);

  if (!currentWorkspaceMembership) {
    throw new Error("Kunne ikke finne valgt workspace.");
  }

  const currentWorkspace = await prisma.workspace.findUnique({
    where: {
      id: resolvedWorkspaceId,
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
      invitations: {
        where: {
          status: {
            in: [
              WorkspaceInvitationStatus.PENDING,
              WorkspaceInvitationStatus.ACCEPTED,
              WorkspaceInvitationStatus.DECLINED,
              WorkspaceInvitationStatus.EXPIRED,
            ],
          },
        },
        include: {
          invitedBy: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: 12,
      },
      ddRooms: {
        include: {
          primaryCompany: {
            include: {
              industryCode: {
                select: {
                  code: true,
                  title: true,
                },
              },
            },
          },
          _count: {
            select: {
              posts: true,
              commentThreads: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
      },
      watches: {
        include: {
          company: {
            include: {
              industryCode: {
                select: {
                  code: true,
                  title: true,
                },
              },
            },
          },
        },
      },
      notifications: {
        include: {
          company: {
            include: {
              industryCode: {
                select: {
                  code: true,
                  title: true,
                },
              },
            },
          },
          watch: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
        take: 60,
      },
      monitors: {
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      },
    },
  });

  if (!currentWorkspace) {
    throw new Error("Workspace finnes ikke.");
  }

  const currentSummary = workspaceSummaries.find((workspace) => workspace.id === currentWorkspace.id);

  if (!currentSummary) {
    throw new Error("Workspace-sammendrag mangler.");
  }

  const incomingInvitations = await prisma.workspaceInvitation.findMany({
    where: {
      email: normalizeEmail(user.email),
      status: {
        in: [WorkspaceInvitationStatus.PENDING, WorkspaceInvitationStatus.EXPIRED],
      },
    },
    include: {
      invitedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const [workspaceWatches, workspaceNotifications, workspaceMonitors] = await Promise.all([
    listWorkspaceWatches(userId, currentWorkspace.id),
    listWorkspaceNotifications(userId, currentWorkspace.id),
    listWorkspaceMonitors(userId, currentWorkspace.id),
  ]);

  return {
    currentWorkspace: {
      ...currentSummary,
      capabilities: await getUserWorkspaceCapabilities(
        userId,
        currentWorkspaceMembership.role,
        currentWorkspace.status,
        currentWorkspace.type,
      ),
      members: currentWorkspace.members.map((member) => toWorkspaceMemberSummary(member, userId)),
      invitations: currentWorkspace.invitations.map(toInvitationSummary),
      activeDdRooms: currentWorkspace.ddRooms.filter((room) => room.status === "ACTIVE").map(toDdRoomSummary),
      archivedDdRooms: currentWorkspace.ddRooms
        .filter((room) => room.status === "ARCHIVED")
        .map(toDdRoomSummary),
      activeWatches: workspaceWatches.filter((watch) => watch.status === "ACTIVE"),
      archivedWatches: workspaceWatches.filter((watch) => watch.status === "ARCHIVED"),
      unreadNotifications: workspaceNotifications.filter((notification) => !notification.readAt),
      readNotifications: workspaceNotifications.filter((notification) => Boolean(notification.readAt)),
      activeMonitors: workspaceMonitors.filter((monitor) => monitor.status === "ACTIVE"),
      archivedMonitors: workspaceMonitors.filter((monitor) => monitor.status === "ARCHIVED"),
    },
    workspaces: workspaceSummaries,
    incomingInvitations: incomingInvitations.map(toInvitationSummary),
  };
}

export async function getSessionWorkspaceContext(userId: string): Promise<SessionWorkspaceContext> {
  const setup = await ensureUserWorkspaceState(userId);

  if (!setup.currentWorkspaceId) {
    return {
      currentWorkspaceId: null,
      currentWorkspaceName: null,
      currentWorkspaceType: null,
      currentWorkspaceStatus: null,
      currentWorkspaceRole: null,
    };
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: setup.currentWorkspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    return {
      currentWorkspaceId: null,
      currentWorkspaceName: null,
      currentWorkspaceType: null,
      currentWorkspaceStatus: null,
      currentWorkspaceRole: null,
    };
  }

  return {
    currentWorkspaceId: membership.workspaceId,
    currentWorkspaceName: membership.workspace.name,
    currentWorkspaceType: membership.workspace.type,
    currentWorkspaceStatus: membership.workspace.status,
    currentWorkspaceRole: membership.role,
  };
}

export async function requireWorkspaceMembership(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    include: {
      workspace: true,
    },
  });

  if (!membership) {
    throw new Error("Du har ikke tilgang til dette workspace-et.");
  }

  return membership;
}

export async function createTeamWorkspace(userId: string, name: string) {
  const trimmedName = name.trim();
  if (trimmedName.length < 2) {
    throw new Error("Teamnavn må være minst 2 tegn.");
  }

  await ensureUserWorkspaceState(userId);
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { status: true, plan: true },
  });
  const entitlements = getCollaborationEntitlements(subscription?.status, subscription?.plan);
  if (!entitlements.canUseTeamWorkspaces) {
    throw new Error("Team-workspaces krever utvidet tilgang.");
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: trimmedName,
      type: WorkspaceType.TEAM,
      members: {
        create: {
          userId,
          role: WorkspaceMemberRole.OWNER,
        },
      },
    },
    select: {
      id: true,
    },
  });

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastWorkspaceId: workspace.id,
    },
  });

  return workspace;
}

export async function switchWorkspace(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(userId, workspaceId);

  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      lastWorkspaceId: workspaceId,
    },
  });
}

export async function inviteWorkspaceMember(
  actorUserId: string,
  workspaceId: string,
  email: string,
  role: WorkspaceMemberRole,
) {
  const normalizedEmail = normalizeEmail(email);
  const membership = await requireWorkspaceMembership(actorUserId, workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );

  if (!isManager(membership.role) || !capabilities.canInviteMembers) {
    throw new Error("Du kan ikke invitere medlemmer til dette workspace-et.");
  }

  if (membership.workspace.type !== WorkspaceType.TEAM) {
    throw new Error("Personlige workspaces kan ikke invitere flere medlemmer.");
  }

  if (membership.workspace.status !== WorkspaceStatus.ACTIVE) {
    throw new Error("Arkiverte workspaces kan ikke sende nye invitasjoner.");
  }

  const actor = await prisma.user.findUnique({
    where: {
      id: actorUserId,
    },
    select: {
      email: true,
    },
  });

  if (!actor) {
    throw new Error("Brukeren finnes ikke.");
  }

  if (normalizeEmail(actor.email) === normalizedEmail) {
    throw new Error("Du er allerede medlem av dette workspace-et.");
  }

  const existingMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      user: {
        email: normalizedEmail,
      },
    },
  });

  if (existingMember) {
    throw new Error("Denne brukeren er allerede medlem.");
  }

  const existingInvitation = await prisma.workspaceInvitation.findFirst({
    where: {
      workspaceId,
      email: normalizedEmail,
      status: WorkspaceInvitationStatus.PENDING,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existingInvitation && existingInvitation.expiresAt > new Date()) {
    return existingInvitation;
  }

  if (existingInvitation) {
    await prisma.workspaceInvitation.update({
      where: { id: existingInvitation.id },
      data: {
        status: WorkspaceInvitationStatus.EXPIRED,
        respondedAt: new Date(),
      },
    });
  }

  return prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      email: normalizedEmail,
      role,
      token: randomUUID(),
      status: WorkspaceInvitationStatus.PENDING,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      invitedByUserId: actorUserId,
    },
  });
}

export async function acceptWorkspaceInvitation(userId: string, invitationId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new Error("Brukeren finnes ikke.");
    }

    const invitation = await tx.workspaceInvitation.findUnique({
      where: {
        id: invitationId,
      },
      include: {
        workspace: true,
      },
    });

    if (!invitation) {
      throw new Error("Invitasjonen finnes ikke.");
    }

    if (invitation.status !== WorkspaceInvitationStatus.PENDING) {
      throw new Error("Invitasjonen er ikke lenger tilgjengelig.");
    }

    if (invitation.expiresAt < new Date()) {
      await tx.workspaceInvitation.update({
        where: {
          id: invitation.id,
        },
        data: {
          status: WorkspaceInvitationStatus.EXPIRED,
          respondedAt: new Date(),
        },
      });

      throw new Error("Invitasjonen har utløpt.");
    }

    if (normalizeEmail(invitation.email) !== normalizeEmail(user.email)) {
      throw new Error("Invitasjonen er sendt til en annen e-postadresse.");
    }

    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invitation.workspaceId,
          userId,
        },
      },
      update: {
        role: invitation.role,
      },
      create: {
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      },
    });

    await tx.workspaceInvitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: WorkspaceInvitationStatus.ACCEPTED,
        respondedAt: new Date(),
        acceptedByUserId: userId,
      },
    });

    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        lastWorkspaceId: invitation.workspaceId,
      },
    });

    return invitation.workspaceId;
  });
}

export async function declineWorkspaceInvitation(userId: string, invitationId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      email: true,
    },
  });

  if (!user) {
    throw new Error("Brukeren finnes ikke.");
  }

  const invitation = await prisma.workspaceInvitation.findUnique({
    where: {
      id: invitationId,
    },
  });

  if (!invitation) {
    throw new Error("Invitasjonen finnes ikke.");
  }

  if (normalizeEmail(invitation.email) !== normalizeEmail(user.email)) {
    throw new Error("Invitasjonen tilhører en annen bruker.");
  }

  if (invitation.status !== WorkspaceInvitationStatus.PENDING) {
    throw new Error("Invitasjonen er allerede behandlet.");
  }

  await prisma.workspaceInvitation.update({
    where: {
      id: invitation.id,
    },
    data: {
      status: WorkspaceInvitationStatus.DECLINED,
      respondedAt: new Date(),
    },
  });
}

export async function removeWorkspaceMember(actorUserId: string, workspaceId: string, memberUserId: string) {
  const membership = await requireWorkspaceMembership(actorUserId, workspaceId);
  const capabilities = await getUserWorkspaceCapabilities(
    actorUserId,
    membership.role,
    membership.workspace.status,
    membership.workspace.type,
  );
  if (!isManager(membership.role) || !capabilities.canRemoveMembers) {
    throw new Error("Du kan ikke fjerne medlemmer fra dette workspace-et.");
  }

  if (memberUserId === actorUserId) {
    throw new Error("Du kan ikke fjerne deg selv i denne versjonen.");
  }

  const targetMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: memberUserId,
      },
    },
  });

  if (!targetMembership) {
    throw new Error("Medlemmet finnes ikke i workspace-et.");
  }

  await prisma.workspaceMember.delete({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: memberUserId,
      },
    },
  });

  await prisma.user.updateMany({
    where: {
      id: memberUserId,
      lastWorkspaceId: workspaceId,
    },
    data: {
      lastWorkspaceId: null,
    },
  });
}

export async function updateWorkspaceStatus(actorUserId: string, workspaceId: string, status: WorkspaceStatus) {
  const membership = await requireWorkspaceMembership(actorUserId, workspaceId);

  if (!isManager(membership.role)) {
    throw new Error("Du kan ikke endre status på dette workspace-et.");
  }

  if (membership.workspace.type === WorkspaceType.PERSONAL) {
    throw new Error("Personlige workspaces kan ikke arkiveres.");
  }

  await prisma.workspace.update({
    where: {
      id: workspaceId,
    },
    data: {
      status,
      archivedAt: status === WorkspaceStatus.ARCHIVED ? new Date() : null,
    },
  });

  if (status === WorkspaceStatus.ARCHIVED) {
    await prisma.user.updateMany({
      where: {
        lastWorkspaceId: workspaceId,
      },
      data: {
        lastWorkspaceId: null,
      },
    });
  }
}
