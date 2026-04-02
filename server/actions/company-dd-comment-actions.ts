"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { rethrowIfRedirectError } from "@/lib/redirect-error";
import { createFinancialStatementComment } from "@/server/services/dd-comment-service";

const createFinancialStatementCommentSchema = z.object({
  companySlug: z.string().min(1),
  roomId: z.string().min(1),
  financialStatementId: z.string().min(1),
  content: z.string().trim().min(2),
  parentCommentId: z.string().optional(),
});

function buildCompanyUrl(
  companySlug: string,
  tab: string,
  roomId?: string | null,
  notice?: string,
  error?: string,
) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (roomId) {
    params.set("ddRoom", roomId);
  }
  if (notice) {
    params.set("notice", notice);
  }
  if (error) {
    params.set("error", error);
  }
  return `/companies/${companySlug}?${params.toString()}`;
}

async function requireAuthenticatedUserId() {
  const session = await safeAuth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  return userId;
}

export async function createFinancialStatementCommentAction(formData: FormData) {
  const userId = await requireAuthenticatedUserId();

  try {
    const values = createFinancialStatementCommentSchema.parse({
      companySlug: formData.get("companySlug"),
      roomId: formData.get("roomId"),
      financialStatementId: formData.get("financialStatementId"),
      content: formData.get("content"),
      parentCommentId: formData.get("parentCommentId") ?? undefined,
    });

    await createFinancialStatementComment(userId, values.roomId, values.financialStatementId, {
      content: values.content,
      parentCommentId: values.parentCommentId || null,
    });

    revalidatePath(`/companies/${values.companySlug}`);
    redirect(
      buildCompanyUrl(
        values.companySlug,
        "regnskap",
        values.roomId,
        "Kommentaren ble lagt til pa regnskapet.",
      ) as never,
    );
  } catch (error) {
    rethrowIfRedirectError(error);
    const companySlug = String(formData.get("companySlug") ?? "");
    const roomId = String(formData.get("roomId") ?? "");
    const message = error instanceof Error ? error.message : "Kunne ikke legge til kommentaren.";
    redirect(buildCompanyUrl(companySlug, "regnskap", roomId, undefined, message) as never);
  }
}
