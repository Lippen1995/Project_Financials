"use server";

import {
  CompanyStatus,
  WorkspaceWatchIntensity,
  WorkspaceMonitorStatus,
  WorkspaceWatchStatus,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import {
  createWorkspaceMonitor,
  createWorkspaceIndustryWatch,
  createWorkspaceWatch,
  createWorkspaceWatchGroup,
  markAllWorkspaceNotificationsRead,
  markWorkspaceNotificationRead,
  promoteWorkspaceWatchGroupMember,
  refreshWorkspaceWatchGroup,
  syncWorkspaceNotifications,
  updateWorkspaceMonitorStatus,
  updateWorkspaceIndustryWatchStatus,
  updateWorkspaceWatchStatus,
  updateWorkspaceWatchGroupStatus,
  updateWorkspaceWatchlistItemIntensity,
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

const companyWatchActionSchema = z.object({
  orgNumber: norwegianOrganizationNumberSchema,
  workspaceId: z.string().trim().min(1).max(128),
  slug: z.string().trim().min(1).max(200).optional(),
});

const watchlistCompanyStatusSchema = z.object({
  watchId: z.string().min(1),
});

const industryWatchSchema = z.object({
  workspaceId: z.string().min(1),
  industryCodePrefix: z.string().trim().min(2),
  intensity: z.nativeEnum(WorkspaceWatchIntensity).optional(),
});

const industryWatchStatusSchema = z.object({
  industryWatchId: z.string().min(1),
});

const watchGroupSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(2),
  query: z.string().trim().min(2),
  intensity: z.nativeEnum(WorkspaceWatchIntensity).optional(),
  matchLimit: z.string().trim().optional(),
});

const watchGroupStatusSchema = z.object({
  groupId: z.string().min(1),
});

const promoteGroupMemberSchema = z.object({
  memberId: z.string().min(1),
});

const watchlistIntensitySchema = z.object({
  targetType: z.enum(["company", "industry", "group"]),
  targetId: z.string().min(1),
  intensity: z.nativeEnum(WorkspaceWatchIntensity),
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

function buildWatchlistUrl(notice?: string, error?: string) {
  const params = new URLSearchParams();
  if (notice) {
    params.set("notice", notice);
  }
  if (error) {
    params.set("error", error);
  }
  const query = params.toString();
  return query ? `/watchlist?${query}` : "/watchlist";
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

export async function watchCompanyAction(_prevState: unknown, formData: FormData): Promise<void> {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = companyWatchActionSchema.parse({
      orgNumber: formData.get("orgNumber"),
      workspaceId: formData.get("workspaceId"),
      slug: formData.get("slug"),
    });
    if (!values.slug) return;
    await createWorkspaceWatch(userId, values.workspaceId, {
      companyReference: values.orgNumber,
    });
    revalidatePath(`/companies/${values.slug}`);
  } catch {
    // swallow — page stays unchanged
  }
}

export async function addToWatchlistAction(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  const userId = await requireAuthenticatedUserId();
  const parsed = companyWatchActionSchema.safeParse({
    orgNumber: formData.get("orgNumber"),
    workspaceId: formData.get("workspaceId"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Mangler selskap eller workspace." };
  }
  try {
    await createWorkspaceWatch(userId, parsed.data.workspaceId, {
      companyReference: parsed.data.orgNumber,
    });
    revalidatePath("/watchlist");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Kunne ikke legge til selskapet.",
    };
  }
}

export async function createIndustryWatchAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = industryWatchSchema.parse({
      workspaceId: formData.get("workspaceId"),
      industryCodePrefix: formData.get("industryCodePrefix"),
      intensity: formData.get("intensity") || undefined,
    });
    await createWorkspaceIndustryWatch(userId, values.workspaceId, {
      industryCodePrefix: values.industryCodePrefix,
      intensity: values.intensity ?? WorkspaceWatchIntensity.BALANCED,
    });
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Bransjen ble lagt til watchlist.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(
      buildWatchlistUrl(
        undefined,
        error instanceof Error ? error.message : "Kunne ikke legge til bransjen.",
      ) as never,
    );
  }
}

export async function createWatchGroupAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = watchGroupSchema.parse({
      workspaceId: formData.get("workspaceId"),
      name: formData.get("name"),
      query: formData.get("query"),
      intensity: formData.get("intensity") || undefined,
      matchLimit: formData.get("matchLimit") ?? undefined,
    });
    await createWorkspaceWatchGroup(userId, values.workspaceId, {
      name: values.name,
      query: values.query,
      intensity: values.intensity ?? WorkspaceWatchIntensity.BALANCED,
      matchLimit: parseOptionalInt(values.matchLimit) ?? 50,
    });
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Bolken ble lagt til watchlist.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(
      buildWatchlistUrl(
        undefined,
        error instanceof Error ? error.message : "Kunne ikke legge til bolken.",
      ) as never,
    );
  }
}

export async function updateWatchlistIntensityAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = watchlistIntensitySchema.parse({
      targetType: formData.get("targetType"),
      targetId: formData.get("targetId"),
      intensity: formData.get("intensity"),
    });
    await updateWorkspaceWatchlistItemIntensity(userId, values);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Watch-intensitet ble oppdatert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(
      buildWatchlistUrl(
        undefined,
        error instanceof Error ? error.message : "Kunne ikke oppdatere intensitet.",
      ) as never,
    );
  }
}

export async function archiveWatchlistCompanyAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = watchlistCompanyStatusSchema.parse({ watchId: formData.get("watchId") });
    await updateWorkspaceWatchStatus(userId, values.watchId, WorkspaceWatchStatus.ARCHIVED);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Selskapet ble arkivert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke arkivere selskapet.") as never);
  }
}

export async function reopenWatchlistCompanyAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = watchlistCompanyStatusSchema.parse({ watchId: formData.get("watchId") });
    await updateWorkspaceWatchStatus(userId, values.watchId, WorkspaceWatchStatus.ACTIVE);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Selskapet ble gjenåpnet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke gjenåpne selskapet.") as never);
  }
}

export async function archiveIndustryWatchAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = industryWatchStatusSchema.parse({ industryWatchId: formData.get("industryWatchId") });
    await updateWorkspaceIndustryWatchStatus(userId, values.industryWatchId, WorkspaceWatchStatus.ARCHIVED);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Bransjen ble arkivert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke arkivere bransjen.") as never);
  }
}

export async function reopenIndustryWatchAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = industryWatchStatusSchema.parse({ industryWatchId: formData.get("industryWatchId") });
    await updateWorkspaceIndustryWatchStatus(userId, values.industryWatchId, WorkspaceWatchStatus.ACTIVE);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Bransjen ble gjenåpnet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke gjenåpne bransjen.") as never);
  }
}

export async function archiveWatchGroupAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = watchGroupStatusSchema.parse({ groupId: formData.get("groupId") });
    await updateWorkspaceWatchGroupStatus(userId, values.groupId, WorkspaceWatchStatus.ARCHIVED);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Bolken ble arkivert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke arkivere bolken.") as never);
  }
}

export async function reopenWatchGroupAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = watchGroupStatusSchema.parse({ groupId: formData.get("groupId") });
    await updateWorkspaceWatchGroupStatus(userId, values.groupId, WorkspaceWatchStatus.ACTIVE);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Bolken ble gjenåpnet.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke gjenåpne bolken.") as never);
  }
}

export async function refreshWatchGroupAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = watchGroupStatusSchema.parse({ groupId: formData.get("groupId") });
    await refreshWorkspaceWatchGroup(userId, values.groupId);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Bolken ble oppdatert fra Brreg-søk.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke oppdatere bolken.") as never);
  }
}

export async function promoteGroupMemberAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();
  try {
    const values = promoteGroupMemberSchema.parse({ memberId: formData.get("memberId") });
    await promoteWorkspaceWatchGroupMember(userId, values.memberId);
    revalidatePath("/watchlist");
    redirect(buildWatchlistUrl("Selskapet ble lagt til som egen watch.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    redirect(buildWatchlistUrl(undefined, error instanceof Error ? error.message : "Kunne ikke følge selskapet.") as never);
  }
}

export async function unwatchCompanyAction(_prevState: unknown, formData: FormData): Promise<void> {
  const userId = await requireAuthenticatedUserId();
  try {
    const watchId = String(formData.get("watchId") ?? "");
    const slug = String(formData.get("slug") ?? "");
    if (!watchId || !slug) return;
    await updateWorkspaceWatchStatus(userId, watchId, WorkspaceWatchStatus.ARCHIVED);
    revalidatePath(`/companies/${slug}`);
  } catch {
    // swallow
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
