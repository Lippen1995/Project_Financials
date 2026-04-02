"use server";

import { DdRoomStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import { createDdRoom, updateDdRoomStatus } from "@/server/services/dd-room-service";

const createDdRoomSchema = z.object({
  workspaceId: z.string().min(1),
  companyReference: z.string().trim().min(1),
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

const roomStatusSchema = z.object({
  roomId: z.string().min(1),
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

export async function createDdRoomAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createDdRoomSchema.parse({
      workspaceId: formData.get("workspaceId"),
      companyReference: formData.get("companyReference"),
      name: formData.get("name") ?? undefined,
      description: formData.get("description") ?? undefined,
    });

    const room = await createDdRoom(userId, values.workspaceId, values);
    revalidatePath("/dashboard");
    revalidatePath(`/dd/${room.id}`);
    redirect(`/dd/${room.id}` as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const workspaceId = String(formData.get("workspaceId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke opprette DD-rommet.";
    redirect(buildDashboardUrl(workspaceId || null, undefined, message) as never);
  }
}

export async function archiveDdRoomAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = roomStatusSchema.parse({
      roomId: formData.get("roomId"),
    });

    const workspaceId = await updateDdRoomStatus(userId, values.roomId, DdRoomStatus.ARCHIVED);
    revalidatePath("/dashboard");
    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildDashboardUrl(workspaceId, "DD-rommet ble arkivert.") as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Kunne ikke arkivere DD-rommet.";
    redirect(buildDashboardUrl(null, undefined, message) as never);
  }
}

export async function reopenDdRoomAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = roomStatusSchema.parse({
      roomId: formData.get("roomId"),
    });

    await updateDdRoomStatus(userId, values.roomId, DdRoomStatus.ACTIVE);
    revalidatePath("/dashboard");
    revalidatePath(`/dd/${values.roomId}`);
    redirect(`/dd/${values.roomId}?notice=${encodeURIComponent("DD-rommet ble gjenåpnet.")}` as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const message = error instanceof Error ? error.message : "Kunne ikke gjenåpne DD-rommet.";
    redirect(buildDashboardUrl(null, undefined, message) as never);
  }
}
