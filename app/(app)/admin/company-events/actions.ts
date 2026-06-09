"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  isCompanyEventFeedbackAction,
  recordCompanyEventFeedback,
  recordCompanyEventExposureFeedback,
} from "@/server/news/company-event-feedback-service";

function buildReturnPath(path: string, message: string, tone: "success" | "error") {
  const url = new URL(path.startsWith("http") ? path : `http://fjord.local${path}`);
  url.searchParams.set("message", message);
  url.searchParams.set("tone", tone);
  return `${url.pathname}${url.search}`;
}

export async function reviewCompanyEventExposureAction(formData: FormData) {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) redirect("/dashboard");

  const exposureId = String(formData.get("exposureId") ?? "").trim();
  const returnPath = String(formData.get("returnPath") ?? "/admin/company-events").trim();
  const relevanceScore = Number(formData.get("relevanceScore"));
  const investorValueScore = Number(formData.get("investorValueScore"));
  const notes = String(formData.get("notes") ?? "").trim();
  const issueTags = String(formData.get("issueTags") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  try {
    if (
      !exposureId ||
      !Number.isFinite(relevanceScore) ||
      relevanceScore < 0 ||
      relevanceScore > 100 ||
      !Number.isFinite(investorValueScore) ||
      investorValueScore < 0 ||
      investorValueScore > 100
    ) {
      throw new Error("Ugyldig eksponeringsvurdering.");
    }
    await recordCompanyEventExposureFeedback({
      exposureId,
      userId: reviewer.id,
      relevanceScore,
      investorValueScore,
      notes,
      issueTags,
    });
    revalidatePath("/admin/company-events");
    redirect(buildReturnPath(returnPath, "Eksponering vurdert.", "success") as never);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunne ikke lagre eksponeringsvurdering.";
    redirect(buildReturnPath(returnPath, message, "error") as never);
  }
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
  const relevanceScore = Number(formData.get("relevanceScore"));
  const investorValueScore = Number(formData.get("investorValueScore"));
  const previousRelevanceScore = Number(formData.get("previousRelevanceScore"));
  const previousInvestorValueScore = Number(formData.get("previousInvestorValueScore"));

  if (!eventId || !isCompanyEventFeedbackAction(action)) {
    redirect(buildReturnPath(returnPath, "Ugyldig review-forespørsel.", "error") as never);
  }

  try {
    if (
      action === "rated" &&
      (
        !Number.isFinite(relevanceScore) ||
        relevanceScore < 0 ||
        relevanceScore > 100 ||
        !Number.isFinite(investorValueScore) ||
        investorValueScore < 0 ||
        investorValueScore > 100
      )
    ) {
      throw new Error("Relevans og investorverdi må være mellom 0 og 100.");
    }

    await recordCompanyEventFeedback({
      eventId,
      userId: reviewer.id,
      action,
      previousValue:
        action === "rated"
          ? {
              relevanceScore: previousRelevanceScore,
              investorValueScore: previousInvestorValueScore,
            }
          : undefined,
      correctedValue:
        action === "rated"
          ? {
              relevanceScore,
              investorValueScore,
            }
          : undefined,
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
