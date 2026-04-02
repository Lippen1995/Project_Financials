"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import { createDdPostComment } from "@/server/services/dd-comment-service";
import { createDdPost } from "@/server/services/dd-post-service";

const createPostSchema = z.object({
  roomId: z.string().min(1),
  content: z.string().trim().min(2),
});

const createPostCommentSchema = z.object({
  roomId: z.string().min(1),
  postId: z.string().min(1),
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

export async function createDdPostAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createPostSchema.parse({
      roomId: formData.get("roomId"),
      content: formData.get("content"),
    });

    await createDdPost(userId, values.roomId, values.content);
    revalidatePath(`/dd/${values.roomId}`);
    redirect(
      buildRoomUrl(
        values.roomId,
        "Innlegget ble publisert i rommet.",
        undefined,
        String(formData.get("workstream") ?? "") || null,
      ) as never,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const roomId = String(formData.get("roomId") ?? "");
    const workstream = String(formData.get("workstream") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke publisere innlegget.";
    redirect(buildRoomUrl(roomId, undefined, message, workstream || null) as never);
  }
}

export async function createDdPostCommentAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createPostCommentSchema.parse({
      roomId: formData.get("roomId"),
      postId: formData.get("postId"),
      content: formData.get("content"),
      parentCommentId: formData.get("parentCommentId") ?? undefined,
    });

    await createDdPostComment(userId, values.postId, {
      content: values.content,
      parentCommentId: values.parentCommentId || null,
    });

    revalidatePath(`/dd/${values.roomId}`);
    redirect(
      buildRoomUrl(
        values.roomId,
        "Kommentaren ble lagt til innlegget.",
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
