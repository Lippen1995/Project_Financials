import { type AppRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AdminUserRoleOption = {
  value: AppRole;
  label: string;
  description: string;
};

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  appRole: AppRole;
  roleLabel: string;
  createdAt: string;
  emailVerified: boolean;
  subscriptionLabel: string;
  lastWorkspaceLabel: string;
  isCurrentUser: boolean;
};

export type UserRoleChangeAuditRow = {
  id: string;
  actorName: string;
  actorEmail: string;
  targetName: string;
  targetEmail: string;
  fromRole: AppRole;
  toRole: AppRole;
  fromRoleLabel: string;
  toRoleLabel: string;
  createdAt: string;
};

export type AdminUsersPageModel = {
  currentUserId: string;
  query: string;
  roleFilter: AppRole | "ALL";
  roleOptions: AdminUserRoleOption[];
  stats: Array<{
    role: AppRole;
    label: string;
    count: number;
  }>;
  rows: AdminUserRow[];
  recentChanges: UserRoleChangeAuditRow[];
};

const ROLE_LABELS: Record<AppRole, string> = {
  USER: "Bruker",
  ADMIN: "Admin",
  FINANCIAL_REVIEWER: "Financial reviewer",
};

const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  USER: "Vanlig bruker uten admin-tilgang.",
  ADMIN: "Full tilgang til admin og rolleforvaltning.",
  FINANCIAL_REVIEWER: "Tilgang til kontrollflater for kvalitet og review.",
};

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Ikke registrert";
  }

  return value.toLocaleString("nb-NO");
}

function formatSubscription(plan: string | null | undefined, status: string | null | undefined) {
  if (!plan && !status) {
    return "Ikke registrert";
  }

  const planLabel = plan ? plan.toUpperCase() : "UKJENT PLAN";
  const statusLabel = status ? status.replaceAll("_", " ") : "UKJENT STATUS";
  return `${planLabel} · ${statusLabel}`;
}

function formatWorkspaceLabel(
  workspace:
    | {
        name: string;
        type: string;
        status: string;
      }
    | null
    | undefined,
) {
  if (!workspace) {
    return "Ingen valgt workspace";
  }

  const typeLabel = workspace.type === "TEAM" ? "Team" : "Personlig";
  const statusLabel = workspace.status === "ACTIVE" ? "aktivt" : "arkivert";
  return `${workspace.name} · ${typeLabel.toLowerCase()} · ${statusLabel}`;
}

function roleOptions(): AdminUserRoleOption[] {
  return (["USER", "FINANCIAL_REVIEWER", "ADMIN"] as AppRole[]).map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
  }));
}

export async function buildAdminUsersPageModel(input: {
  currentUserId: string;
  query?: string;
  roleFilter?: AppRole | "ALL";
}): Promise<AdminUsersPageModel> {
  const trimmedQuery = input.query?.trim() ?? "";
  const roleFilter = input.roleFilter ?? "ALL";

  const userWhere = {
    ...(roleFilter !== "ALL" ? { appRole: roleFilter } : {}),
    ...(trimmedQuery
      ? {
          OR: [
            {
              name: {
                contains: trimmedQuery,
                mode: "insensitive" as const,
              },
            },
            {
              email: {
                contains: trimmedQuery,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };

  const [users, groupedCounts, recentChanges] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      orderBy: [{ appRole: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        email: true,
        appRole: true,
        createdAt: true,
        emailVerified: true,
        subscription: {
          select: {
            plan: true,
            status: true,
          },
        },
        lastWorkspace: {
          select: {
            name: true,
            type: true,
            status: true,
          },
        },
      },
    }),
    prisma.user.groupBy({
      by: ["appRole"],
      _count: { _all: true },
      orderBy: { appRole: "asc" },
    }),
    prisma.userRoleChangeAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        actor: {
          select: {
            name: true,
            email: true,
          },
        },
        target: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  return {
    currentUserId: input.currentUserId,
    query: trimmedQuery,
    roleFilter,
    roleOptions: roleOptions(),
    stats: (["ADMIN", "FINANCIAL_REVIEWER", "USER"] as AppRole[]).map((role) => ({
      role,
      label: ROLE_LABELS[role],
      count: groupedCounts.find((item) => item.appRole === role)?._count._all ?? 0,
    })),
    rows: users.map((user) => ({
      id: user.id,
      name: user.name ?? null,
      email: user.email,
      appRole: user.appRole,
      roleLabel: ROLE_LABELS[user.appRole],
      createdAt: formatDate(user.createdAt),
      emailVerified: Boolean(user.emailVerified),
      subscriptionLabel: formatSubscription(user.subscription?.plan, user.subscription?.status),
      lastWorkspaceLabel: formatWorkspaceLabel(user.lastWorkspace),
      isCurrentUser: user.id === input.currentUserId,
    })),
    recentChanges: recentChanges.map((item) => ({
      id: item.id,
      actorName: item.actor.name?.trim() || item.actor.email,
      actorEmail: item.actor.email,
      targetName: item.target.name?.trim() || item.target.email,
      targetEmail: item.target.email,
      fromRole: item.fromRole,
      toRole: item.toRole,
      fromRoleLabel: ROLE_LABELS[item.fromRole],
      toRoleLabel: ROLE_LABELS[item.toRole],
      createdAt: formatDate(item.createdAt),
    })),
  };
}

export async function updateAdminUserRole(input: {
  actorUserId: string;
  targetUserId: string;
  nextRole: AppRole;
  reason?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const [actor, target] = await Promise.all([
      tx.user.findUnique({
        where: { id: input.actorUserId },
        select: { id: true, appRole: true, email: true },
      }),
      tx.user.findUnique({
        where: { id: input.targetUserId },
        select: { id: true, appRole: true, email: true, name: true },
      }),
    ]);

    if (!actor || actor.appRole !== "ADMIN") {
      throw new Error("Du har ikke tilgang til å endre roller.");
    }

    if (!target) {
      throw new Error("Fant ikke brukeren du ville endre.");
    }

    if (
      actor.id === target.id &&
      target.appRole === "ADMIN" &&
      input.nextRole !== "ADMIN"
    ) {
      throw new Error("Du kan ikke fjerne din egen adminrolle fra denne siden.");
    }

    if (target.appRole === input.nextRole) {
      return {
        userId: target.id,
        appRole: target.appRole,
      };
    }

    await tx.user.update({
      where: { id: target.id },
      data: { appRole: input.nextRole },
    });

    await tx.userRoleChangeAudit.create({
      data: {
        actorUserId: actor.id,
        targetUserId: target.id,
        fromRole: target.appRole,
        toRole: input.nextRole,
        reason: input.reason ?? null,
      },
    });

    return {
      userId: target.id,
      appRole: input.nextRole,
    };
  });
}
