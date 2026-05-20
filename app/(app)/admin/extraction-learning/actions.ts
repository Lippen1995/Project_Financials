"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFinancialReviewerOrNull } from "@/lib/admin-auth";
import { runCalibrationAndProposeIfChanged } from "@/server/services/calibration-proposal-service";
import {
  ThresholdVersionStateError,
  applyThresholdVersion,
  rejectThresholdVersion,
} from "@/server/services/confidence-threshold-version-service";
import { runPatternAnalysis } from "@/server/services/extraction-pattern-analysis-service";

function buildPath(message?: string, type: "ok" | "error" = "ok") {
  const params = new URLSearchParams();
  if (message) params.set(type, message);
  const query = params.toString();
  return `/admin/extraction-learning${query ? `?${query}` : ""}`;
}

async function requireReviewerOrRedirect() {
  const reviewer = await getFinancialReviewerOrNull();
  if (!reviewer) {
    redirect("/dashboard");
  }
  return reviewer;
}

/**
 * Triggers a fresh calibration run and stores any proposed threshold change
 * as a PROPOSED version awaiting approval. Idempotent — running with no new
 * evidence is a no-op.
 */
export async function triggerCalibrationRunAction(): Promise<void> {
  const reviewer = await requireReviewerOrRedirect();

  try {
    const result = await runCalibrationAndProposeIfChanged({
      calibrationInput: { generatedBy: reviewer.email ?? reviewer.id },
    });
    revalidatePath("/admin/extraction-learning");
    const message = result.proposalCreated
      ? `Nytt forslag v${result.proposal?.version} opprettet — venter på godkjenning.`
      : "Kalibrering kjørt — ingen endringer foreslås på nåværende grunnlag.";
    redirect(buildPath(message) as never);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Ukjent feil under kalibrering.";
    redirect(buildPath(message, "error") as never);
  }
}

export async function applyThresholdProposalAction(formData: FormData): Promise<void> {
  const reviewer = await requireReviewerOrRedirect();
  const versionId = String(formData.get("versionId") ?? "");

  try {
    const applied = await applyThresholdVersion({
      versionId,
      appliedByUserId: reviewer.id,
    });
    revalidatePath("/admin/extraction-learning");
    redirect(buildPath(`v${applied.version} er nå aktiv.`) as never);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message =
      error instanceof ThresholdVersionStateError
        ? error.message
        : "Kunne ikke aktivere forslaget.";
    redirect(buildPath(message, "error") as never);
  }
}

/**
 * Re-runs the pattern analysis over the last N days and writes a new
 * ExtractionPatternReport. Safe to invoke repeatedly — it archives the
 * previous active report and creates a new one each time.
 */
export async function triggerPatternAnalysisAction(formData: FormData): Promise<void> {
  await requireReviewerOrRedirect();
  const rawLookback = formData.get("lookbackDays");
  const lookbackDays =
    typeof rawLookback === "string" && rawLookback.trim().length > 0
      ? Math.min(180, Math.max(7, Number(rawLookback)))
      : 30;

  try {
    const report = await runPatternAnalysis({ lookbackDays });
    revalidatePath("/admin/extraction-learning");
    const message = report
      ? `Mønsteranalyse fullført — ${report.patterns.length} signifikante mønstre i ${report.totalCorrections} korreksjoner.`
      : "Mønsteranalyse fullført — ingen korreksjoner i perioden.";
    redirect(buildPath(message) as never);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Ukjent feil under mønsteranalyse.";
    redirect(buildPath(message, "error") as never);
  }
}

export async function rejectThresholdProposalAction(formData: FormData): Promise<void> {
  const reviewer = await requireReviewerOrRedirect();
  const versionId = String(formData.get("versionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;

  try {
    const rejected = await rejectThresholdVersion({
      versionId,
      rejectedByUserId: reviewer.id,
      reason,
    });
    revalidatePath("/admin/extraction-learning");
    redirect(buildPath(`v${rejected.version} avvist.`) as never);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message =
      error instanceof ThresholdVersionStateError
        ? error.message
        : "Kunne ikke avvise forslaget.";
    redirect(buildPath(message, "error") as never);
  }
}
