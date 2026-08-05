"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import {
  saveAnnualReportManualReviewDecision,
  type AnnualReportManualReviewDecisionValue,
  type AnnualReportManualReviewSeverity,
} from "@/server/services/annual-report-manual-review-round-service";

function buildDetailPath(candidateId: string, runId: string, message?: string, type: "ok" | "error" = "ok") {
  const params = new URLSearchParams({ runId });
  if (message) {
    params.set(type, message);
  }
  return `/admin/annual-report-reviews/gold-set/${candidateId}?${params.toString()}`;
}

async function requireReviewerOrRedirect() {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    redirect("/dashboard");
  }
  return reviewer;
}

export async function saveGoldSetManualReviewDecisionAction(formData: FormData) {
  const reviewer = await requireReviewerOrRedirect();
  const runId = String(formData.get("runId") ?? "");
  const candidateId = String(formData.get("candidateId") ?? "");
  const decision = String(formData.get("decision") ?? "") as AnnualReportManualReviewDecisionValue;
  const severityOverrideRaw = String(formData.get("severityOverride") ?? "").trim();
  const issueClasses = formData
    .getAll("issueClasses")
    .map((value) => String(value).trim())
    .filter(Boolean);

  try {
    await saveAnnualReportManualReviewDecision({
      runId,
      candidateId,
      decision,
      issueClasses,
      reviewerNotes: String(formData.get("reviewerNotes") ?? "").trim() || null,
      reviewedBy: reviewer.id,
      reviewedByRole: reviewer.appRole,
      severityOverride:
        severityOverrideRaw === ""
          ? null
          : (severityOverrideRaw as AnnualReportManualReviewSeverity),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save decision.";
    redirect(buildDetailPath(candidateId, runId, message, "error") as never);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/annual-report-reviews");
  revalidatePath(`/admin/annual-report-reviews/gold-set/${candidateId}`);
  redirect(buildDetailPath(candidateId, runId, "Decision saved.") as never);
}

