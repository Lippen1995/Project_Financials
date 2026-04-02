"use server";

import {
  CompanyStatus,
  WorkspaceMonitorStatus,
  WorkspaceWatchStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import {
  createWorkspaceMonitor,
  createWorkspaceWatch,
  markAllWorkspaceNotificationsRead,
  markWorkspaceNotificationRead,
  syncWorkspaceNotifications,
  updateWorkspaceMonitorStatus,
  updateWorkspaceWatchStatus,
} from "@/server/services/workspace-collaboration-service";

const createWatchSchema = z.object({
  workspaceId: z.string().min(1),
  companyReference: z.string().trim().min(1),
  watchAnnouncements: z.string().optional(),
  watchFinancialStatements: z.string().optional(),
  watchStatusChanges: z.string().optional(),
});

const watchStatusSchema = z.object({
  watchId: z.string().min(1),
  workspaceId: z.string().min(1),
});

const notificationSchema = z.object({
  notificationId: z.string().min(1),
});

const markAllSchema = z.object({
  workspaceId: z.string().min(1),
});

const syncSchema = z.object({
  workspaceId: z.string().min(1),
});

const createMonitorSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(2),
  industryCodePrefix: z.string().trim().optional(),
  minEmployees: z.string().trim().optional(),
  maxEmployees: z.string().trim().optional(),
  minRevenue: z.string().trim().optional(),
  maxRevenue: z.string().trim().optional(),
  companyStatus: z.nativeEnum(CompanyStatus).optional(),
  minimumDaysInStatus: z.string().trim().optional(),
});

const monitorStatusSchema = z.object({
  monitorId: z.string().min(1),
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

function parseOptionalInt(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function createWorkspaceWatchAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createWatchSchema.parse({
      workspaceId: formData.get("workspaceId"),
      companyReference: formData.get("companyReference"),
      watchAnnouncements: formData.get("watchAnnouncements") ?? undefined,
      watchFinancialStatements: formData.get("watchFinancialStatements") ?? undefined,
      watchStatusChanges: formData.get("watchStatusChanges") ?? undefined,
    });

    await createWorkspaceWatch(userId, values.workspaceId, {
      companyReference: values.companyReference,
      watchAnnouncements: values.watchAnnouncements === "on",
      watchFinancialStatements: values.watchFinancialStatements === "on",
      watchStatusChanges: values.watchStatusChanges === "on",
    });

    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Abonnementet ble lagret.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke lagre abonnementet.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function archiveWorkspaceWatchAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = watchStatusSchema.parse({
      watchId: formData.get("watchId"),
      workspaceId: formData.get("workspaceId"),
    });

    await updateWorkspaceWatchStatus(userId, values.watchId, WorkspaceWatchStatus.ARCHIVED);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Abonnementet ble arkivert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke arkivere abonnementet.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function reopenWorkspaceWatchAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = watchStatusSchema.parse({
      watchId: formData.get("watchId"),
      workspaceId: formData.get("workspaceId"),
    });

    await updateWorkspaceWatchStatus(userId, values.watchId, WorkspaceWatchStatus.ACTIVE);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Abonnementet ble gjenåpnet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke gjenåpne abonnementet.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function markWorkspaceNotificationReadAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = notificationSchema.parse({
      notificationId: formData.get("notificationId"),
    });

    const workspaceId = await markWorkspaceNotificationRead(userId, values.notificationId);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(workspaceId, "Varslet ble markert som lest.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Kunne ikke markere varslet som lest.";
    redirect(buildDashboardUrl(null, undefined, message) as never);
  }
}

export async function markAllWorkspaceNotificationsReadAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = markAllSchema.parse({
      workspaceId: formData.get("workspaceId"),
    });

    await markAllWorkspaceNotificationsRead(userId, values.workspaceId);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Inboxen ble markert som lest.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke oppdatere inboxen.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function syncWorkspaceNotificationsAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = syncSchema.parse({
      workspaceId: formData.get("workspaceId"),
    });

    const result = await syncWorkspaceNotifications(userId, values.workspaceId);
    revalidatePath("/dashboard");
    redirect(
      buildDashboardUrl(
        values.workspaceId,
        `Sync fullført. ${result.createdNotifications} varsler ble opprettet.`,
      ) as never,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke synkronisere varsler.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function createWorkspaceMonitorAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createMonitorSchema.parse({
      workspaceId: formData.get("workspaceId"),
      name: formData.get("name"),
      industryCodePrefix: formData.get("industryCodePrefix") ?? undefined,
      minEmployees: formData.get("minEmployees") ?? undefined,
      maxEmployees: formData.get("maxEmployees") ?? undefined,
      minRevenue: formData.get("minRevenue") ?? undefined,
      maxRevenue: formData.get("maxRevenue") ?? undefined,
      companyStatus: formData.get("companyStatus") ?? undefined,
      minimumDaysInStatus: formData.get("minimumDaysInStatus") ?? undefined,
    });

    await createWorkspaceMonitor(userId, values.workspaceId, {
      name: values.name,
      industryCodePrefix: values.industryCodePrefix || null,
      minEmployees: parseOptionalInt(values.minEmployees),
      maxEmployees: parseOptionalInt(values.maxEmployees),
      minRevenue: parseOptionalInt(values.minRevenue),
      maxRevenue: parseOptionalInt(values.maxRevenue),
      companyStatus: values.companyStatus ?? null,
      minimumDaysInStatus: parseOptionalInt(values.minimumDaysInStatus),
    });

    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Monitoren ble opprettet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke opprette monitoren.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function archiveWorkspaceMonitorAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = monitorStatusSchema.parse({
      monitorId: formData.get("monitorId"),
      workspaceId: formData.get("workspaceId"),
    });

    await updateWorkspaceMonitorStatus(userId, values.monitorId, WorkspaceMonitorStatus.ARCHIVED);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Monitoren ble arkivert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke arkivere monitoren.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function reopenWorkspaceMonitorAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = monitorStatusSchema.parse({
      monitorId: formData.get("monitorId"),
      workspaceId: formData.get("workspaceId"),
    });

    await updateWorkspaceMonitorStatus(userId, values.monitorId, WorkspaceMonitorStatus.ACTIVE);
    revalidatePath("/dashboard");
    redirect(buildDashboardUrl(values.workspaceId, "Monitoren ble gjenåpnet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke gjenåpne monitoren.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}
