"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  isCompanyEventFeedbackAction,
  recordCompanyEventFeedback,
} from "@/server/news/company-event-feedback-service";

function buildReturnPath(path: string, message: string, tone: "success" | "error") {
  const url = new URL(path.startsWith("http") ? path : `http://fjord.local${path}`);
  url.searchParams.set("message", message);
  url.searchParams.set("tone", tone);
  return `${url.pathname}${url.search}`;
}

export async function reviewCompanyEventAction(formData: FormData) {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    redirect("/dashboard");
  }

  const eventId = String(formData.get("eventId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const returnPath = String(formData.get("returnPath") ?? "/admin/company-events").trim();

  if (!eventId || !isCompanyEventFeedbackAction(action)) {
    redirect(buildReturnPath(returnPath, "Ugyldig review-forespørsel.", "error") as never);
  }

  try {
    await recordCompanyEventFeedback({
      eventId,
      userId: reviewer.id,
      action,
      notes: notes || null,
      actorRole: reviewer.appRole,
    });
    revalidatePath("/admin/company-events");
    redirect(buildReturnPath(returnPath, "Event vurdert.", "success") as never);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke lagre vurdering.";
    redirect(buildReturnPath(returnPath, message, "error") as never);
  }
}
