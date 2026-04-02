"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import { createDdFindingComment, createDdTaskComment } from "@/server/services/dd-comment-service";

const createTaskCommentSchema = z.object({
  roomId: z.string().min(1),
  taskId: z.string().min(1),
  content: z.string().trim().min(2),
  parentCommentId: z.string().optional(),
});

const createFindingCommentSchema = z.object({
  roomId: z.string().min(1),
  findingId: z.string().min(1),
  content: z.string().trim().min(2),
  parentCommentId: z.string().optional(),
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

export async function createDdTaskCommentAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createTaskCommentSchema.parse({
      roomId: formData.get("roomId"),
      taskId: formData.get("taskId"),
      content: formData.get("content"),
      parentCommentId: formData.get("parentCommentId") ?? undefined,
    });

    await createDdTaskComment(userId, values.taskId, {
      content: values.content,
      parentCommentId: values.parentCommentId || null,
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(
      buildRoomUrl(
        values.roomId,
        "Kommentaren ble lagt til pa oppgaven.",
        undefined,
        String(formData.get("workstream") ?? "") || null,
      ) as never,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke legge til kommentaren.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function createDdFindingCommentAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createFindingCommentSchema.parse({
      roomId: formData.get("roomId"),
      findingId: formData.get("findingId"),
      content: formData.get("content"),
      parentCommentId: formData.get("parentCommentId") ?? undefined,
    });

    await createDdFindingComment(userId, values.findingId, {
      content: values.content,
      parentCommentId: values.parentCommentId || null,
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(
      buildRoomUrl(
        values.roomId,
        "Kommentaren ble lagt til pa funnet.",
        undefined,
        String(formData.get("workstream") ?? "") || null,
      ) as never,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke legge til kommentaren.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}
