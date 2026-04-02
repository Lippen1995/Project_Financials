import { WorkspaceStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCollaborationEntitlements } from "@/server/billing/subscription";
import { syncWorkspaceNotifications } from "@/server/services/workspace-collaboration-service";

export async function syncAllActiveWorkspaces() {
  const workspaces = await prisma.workspace.findMany({
    where: {
      status: WorkspaceStatus.ACTIVE,
    },
    include: {
      members: {
        include: {
          user: {
            include: {
              subscription: {
                select: {
                  status: true,
                  plan: true,
                },
              },
            },
          },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      },
    },
  });

  const results: Array<{
    workspaceId: string;
    workspaceName: string;
    skipped: boolean;
    reason?: string;
    createdNotifications: number;
    watchCount: number;
    monitorCount: number;
  }> = [];

  for (const workspace of workspaces) {
    const eligibleMember = workspace.members.find((member) => {
      const entitlements = getCollaborationEntitlements(
        member.user.subscription?.status,
        member.user.subscription?.plan,
      );

      return (
        entitlements.canUseWorkspaceWatches ||
        entitlements.canUseWorkspaceMonitors ||
        entitlements.canUseWorkspaceInbox
      );
    });

    if (!eligibleMember) {
      results.push({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        skipped: true,
        reason: "Ingen medlemmer med utvidet tilgang.",
        createdNotifications: 0,
        watchCount: 0,
        monitorCount: 0,
      });
      continue;
    }

    const result = await syncWorkspaceNotifications(eligibleMember.userId, workspace.id);
    results.push({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      skipped: false,
      createdNotifications: result.createdNotifications,
      watchCount: result.watchCount,
      monitorCount: result.monitorCount,
    });
  }

  return {
    workspaceCount: workspaces.length,
    syncedWorkspaceCount: results.filter((item) => !item.skipped).length,
    skippedWorkspaceCount: results.filter((item) => item.skipped).length,
    createdNotifications: results.reduce((sum, item) => sum + item.createdNotifications, 0),
    results,
  };
}
