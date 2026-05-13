"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  createUnifiedConfidenceReviewFeedback,
  UnifiedConfidenceReviewFeedbackActionValues,
  UnifiedConfidenceReviewTargetTypeValues,
  type UnifiedExtractionReviewFeedbackAction,
  type UnifiedExtractionReviewTargetType,
} from "@/server/services/annual-report-unified-confidence-review-feedback-service";

function parseJsonRecord(raw: FormDataEntryValue | null): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON must be an object.");
  }

  return parsed as Record<string, unknown>;
}

function buildDetailPath(filingId: string, message?: string, type: "ok" | "error" = "ok") {
  const params = new URLSearchParams();
  if (message) {
    params.set(type, message);
  }
  const query = params.toString();
  return `/admin/annual-report-unified-confidence/${filingId}${query ? `?${query}` : ""}`;
}

async function requireReviewerOrRedirect() {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    redirect("/dashboard");
  }
  return reviewer;
}

export async function acceptUnifiedConfidenceExtractionAction(formData: FormData) {
  const reviewer = await requireReviewerOrRedirect();
  const filingId = String(formData.get("filingId") ?? "");

  try {
    await createUnifiedConfidenceReviewFeedback(
      {
        filingId,
        action: UnifiedConfidenceReviewFeedbackActionValues.ACCEPT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
      reviewer.id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save review feedback.";
    redirect(buildDetailPath(filingId, message, "error") as never);
  }

  revalidatePath(`/admin/annual-report-unified-confidence/${filingId}`);
  redirect(buildDetailPath(filingId, "Machine extraction accepted.") as never);
}

export async function rejectUnifiedConfidenceExtractionAction(formData: FormData) {
  const reviewer = await requireReviewerOrRedirect();
  const filingId = String(formData.get("filingId") ?? "");

  try {
    await createUnifiedConfidenceReviewFeedback(
      {
        filingId,
        action: UnifiedConfidenceReviewFeedbackActionValues.REJECT_MACHINE_EXTRACTION,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
        reason: String(formData.get("reason") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
      reviewer.id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save rejection.";
    redirect(buildDetailPath(filingId, message, "error") as never);
  }

  revalidatePath(`/admin/annual-report-unified-confidence/${filingId}`);
  redirect(buildDetailPath(filingId, "Machine extraction rejected.") as never);
}

export async function markUnifiedConfidenceNeedsReviewAction(formData: FormData) {
  const reviewer = await requireReviewerOrRedirect();
  const filingId = String(formData.get("filingId") ?? "");

  try {
    await createUnifiedConfidenceReviewFeedback(
      {
        filingId,
        action: UnifiedConfidenceReviewFeedbackActionValues.MARK_NEEDS_REVIEW,
        targetType: UnifiedConfidenceReviewTargetTypeValues.FULL_EXTRACTION,
        reason: String(formData.get("reason") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
      reviewer.id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save review request.";
    redirect(buildDetailPath(filingId, message, "error") as never);
  }

  revalidatePath(`/admin/annual-report-unified-confidence/${filingId}`);
  redirect(buildDetailPath(filingId, "Marked for follow-up.") as never);
}

export async function addUnifiedConfidenceCorrectionAction(formData: FormData) {
  const reviewer = await requireReviewerOrRedirect();
  const filingId = String(formData.get("filingId") ?? "");

  try {
    const action = String(formData.get("action") ?? "") as UnifiedExtractionReviewFeedbackAction;
    const targetType = String(formData.get("targetType") ?? "") as UnifiedExtractionReviewTargetType;

    await createUnifiedConfidenceReviewFeedback(
      {
        filingId,
        action,
        targetType,
        targetRef: parseJsonRecord(formData.get("targetRefJson")),
        acceptedValue: parseJsonRecord(formData.get("acceptedValueJson")),
        reason: String(formData.get("reason") ?? "").trim() || null,
        notes: String(formData.get("notes") ?? "").trim() || null,
      },
      reviewer.id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save correction.";
    redirect(buildDetailPath(filingId, message, "error") as never);
  }

  revalidatePath(`/admin/annual-report-unified-confidence/${filingId}`);
  redirect(buildDetailPath(filingId, "Correction saved.") as never);
}
