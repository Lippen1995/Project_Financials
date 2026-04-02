"use server";

import { DdTaskPriority, DdTaskStage, DdTaskStatus, DdWorkstream } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import { createDdTask, updateDdTaskStatus } from "@/server/services/dd-workflow-service";

const createTaskSchema = z.object({
  roomId: z.string().min(1),
  title: z.string().trim().min(2),
  description: z.string().trim().optional(),
  stage: z.nativeEnum(DdTaskStage),
  workstream: z.nativeEnum(DdWorkstream),
  priority: z.nativeEnum(DdTaskPriority).optional(),
  dueAt: z.string().optional(),
  assigneeUserId: z.string().optional(),
});

const updateTaskStatusSchema = z.object({
  taskId: z.string().min(1),
  roomId: z.string().min(1),
  status: z.nativeEnum(DdTaskStatus),
});

function buildRoomUrl(roomId: string, notice?: string, error?: string, workstream?: string | null) {
  const params = new URLSearchParams();
  if (notice) {
    params.set("notice", notice);
  }
  if (error) {
    params.set("error", error);
  }
  if (workstream) {
    params.set("workstream", workstream);
  }
  const query = params.toString();
  return query ? `/dd/${roomId}?${query}` : `/dd/${roomId}`;
}

async function requireAuthenticatedUserId() {
  const session = await safeAuth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  return userId;
}

export async function createDdTaskAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createTaskSchema.parse({
      roomId: formData.get("roomId"),
      title: formData.get("title"),
      description: formData.get("description") ?? undefined,
      stage: formData.get("stage"),
      workstream: formData.get("workstream"),
      priority: formData.get("priority") ?? undefined,
      dueAt: formData.get("dueAt") ?? undefined,
      assigneeUserId: formData.get("assigneeUserId") ?? undefined,
    });

    await createDdTask(userId, values.roomId, {
      title: values.title,
      description: values.description,
      stage: values.stage,
      workstream: values.workstream,
      priority: values.priority,
      dueAt: values.dueAt ? new Date(values.dueAt) : null,
      assigneeUserId: values.assigneeUserId || null,
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildRoomUrl(values.roomId, "Oppgaven ble opprettet.", undefined, values.workstream) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke opprette oppgaven.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function updateDdTaskStatusAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = updateTaskStatusSchema.parse({
      taskId: formData.get("taskId"),
      roomId: formData.get("roomId"),
      status: formData.get("status"),
    });

    await updateDdTaskStatus(userId, values.taskId, values.status);
    revalidatePath(`/dd/${values.roomId}`);
    redirect(buildRoomUrl(values.roomId, "Oppgavestatus ble oppdatert.", undefined, String(formData.get("workstream") ?? "") || null) as never);
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke oppdatere oppgaven.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}
