"use server";

import { WorkspaceMemberRole, WorkspaceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import {
  acceptWorkspaceInvitation,
  createTeamWorkspace,
  declineWorkspaceInvitation,
  inviteWorkspaceMember,
  removeWorkspaceMember,
  switchWorkspace,
  updateWorkspaceStatus,
} from "@/server/services/workspace-service";

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2),
});

const switchWorkspaceSchema = z.object({
  workspaceId: z.string().min(1),
});

const inviteSchema = z.object({
  workspaceId: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER"]),
});

const invitationActionSchema = z.object({
  invitationId: z.string().min(1),
  workspaceId: z.string().optional(),
});

const removeMemberSchema = z.object({
  workspaceId: z.string().min(1),
  memberUserId: z.string().min(1),
});

const workspaceStatusSchema = z.object({
  workspaceId: z.string().min(1),
});

function buildDashboardUrl(workspaceId?: string | null, notice?: string, error?: string) {
  const params = new URLSearchParams();

  if (workspaceId) {
    params.set("workspace", workspaceId);
  }

  if (notice) {
    params.set("notice", notice);
  }

  if (error) {
    params.set("error", error);
  }

  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

async function requireAuthenticatedUserId() {
  const session = await safeAuth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  return userId;
}

export async function createTeamWorkspaceAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createWorkspaceSchema.parse({
      name: formData.get("name"),
    });

    const workspace = await createTeamWorkspace(userId, values.name);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(workspace.id, "Teamet ble opprettet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Kunne ikke opprette workspace.";
    redirect(buildDashboardUrl(null, undefined, message) as never);
  }
}

export async function switchWorkspaceAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = switchWorkspaceSchema.parse({
      workspaceId: formData.get("workspaceId"),
    });

    await switchWorkspace(userId, values.workspaceId);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Workspace byttet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Kunne ikke bytte workspace.";
    redirect(buildDashboardUrl(null, undefined, message) as never);
  }
}

export async function inviteWorkspaceMemberAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = inviteSchema.parse({
      workspaceId: formData.get("workspaceId"),
      email: formData.get("email"),
      role: formData.get("role"),
    });

    await inviteWorkspaceMember(userId, values.workspaceId, values.email, values.role as WorkspaceMemberRole);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Invitasjonen ble sendt.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke sende invitasjon.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function acceptWorkspaceInvitationAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = invitationActionSchema.parse({
      invitationId: formData.get("invitationId"),
      workspaceId: formData.get("workspaceId") ?? undefined,
    });

    const workspaceId = await acceptWorkspaceInvitation(userId, values.invitationId);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(workspaceId, "Invitasjonen ble akseptert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke akseptere invitasjonen.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function declineWorkspaceInvitationAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = invitationActionSchema.parse({
      invitationId: formData.get("invitationId"),
      workspaceId: formData.get("workspaceId") ?? undefined,
    });

    await declineWorkspaceInvitation(userId, values.invitationId);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId ?? null, "Invitasjonen ble avslått.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke avslå invitasjonen.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function archiveWorkspaceAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = workspaceStatusSchema.parse({
      workspaceId: formData.get("workspaceId"),
    });

    await updateWorkspaceStatus(userId, values.workspaceId, WorkspaceStatus.ARCHIVED);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(null, "Workspace ble arkivert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke arkivere workspace.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function reopenWorkspaceAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = workspaceStatusSchema.parse({
      workspaceId: formData.get("workspaceId"),
    });

    await updateWorkspaceStatus(userId, values.workspaceId, WorkspaceStatus.ACTIVE);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Workspace ble gjenåpnet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke gjenåpne workspace.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function removeWorkspaceMemberAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = removeMemberSchema.parse({
      workspaceId: formData.get("workspaceId"),
      memberUserId: formData.get("memberUserId"),
    });

    await removeWorkspaceMember(userId, values.workspaceId, values.memberUserId);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Medlemmet ble fjernet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke fjerne medlemmet.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}
