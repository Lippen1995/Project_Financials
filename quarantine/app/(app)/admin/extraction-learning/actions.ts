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
import { exportUnitScaleDataset, serializeDatasetAsJsonl } from "@/server/services/training-data-export-service";
import {
  applyModelVersion,
  ModelVersionStateError,
  rejectModelVersion,
} from "@/server/services/ml-model-version-service";

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

/**
 * Triggers a training-data export for the unit-scale task. The export writes
 * three JSONL strings (train/val/test) to disk under output/ml-datasets/ so
 * the Python trainer can read them. Does NOT train a model — that's a
 * separate, slower step run from the command line.
 */
export async function exportUnitScaleTrainingDataAction(): Promise<void> {
  await requireReviewerOrRedirect();

  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const dataset = await exportUnitScaleDataset();
    const { trainJsonl, validationJsonl, testJsonl } = serializeDatasetAsJsonl(dataset);
    const outDir = join(process.cwd(), "output", "ml-datasets", "unit-scale");
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "train.jsonl"), trainJsonl, "utf8");
    await writeFile(join(outDir, "validation.jsonl"), validationJsonl, "utf8");
    await writeFile(join(outDir, "test.jsonl"), testJsonl, "utf8");
    await writeFile(
      join(outDir, "manifest.json"),
      JSON.stringify(
        {
          taskType: dataset.taskType,
          generatedAt: dataset.generatedAt,
          totalExamples: dataset.totalExamples,
          labelDistribution: dataset.labelDistribution,
          trainSize: dataset.train.length,
          validationSize: dataset.validation.length,
          testSize: dataset.test.length,
        },
        null,
        2,
      ),
      "utf8",
    );

    revalidatePath("/admin/extraction-learning");
    const message = `Treningsdata eksportert (${dataset.totalExamples} eksempler) til output/ml-datasets/unit-scale/. Kjør trenings-skriptet for å bygge modellen.`;
    redirect(buildPath(message) as never);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Ukjent feil under eksport av treningsdata.";
    redirect(buildPath(message, "error") as never);
  }
}

export async function applyModelProposalAction(formData: FormData): Promise<void> {
  const reviewer = await requireReviewerOrRedirect();
  const versionId = String(formData.get("versionId") ?? "");
  try {
    const applied = await applyModelVersion({ versionId, appliedByUserId: reviewer.id });
    revalidatePath("/admin/extraction-learning");
    redirect(buildPath(`Modell v${applied.taskVersion} (${applied.taskType}) er nå aktiv.`) as never);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message =
      error instanceof ModelVersionStateError
        ? error.message
        : "Kunne ikke aktivere modellen.";
    redirect(buildPath(message, "error") as never);
  }
}

export async function rejectModelProposalAction(formData: FormData): Promise<void> {
  const reviewer = await requireReviewerOrRedirect();
  const versionId = String(formData.get("versionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  try {
    const rejected = await rejectModelVersion({
      versionId,
      rejectedByUserId: reviewer.id,
      reason,
    });
    revalidatePath("/admin/extraction-learning");
    redirect(buildPath(`Modell v${rejected.taskVersion} (${rejected.taskType}) avvist.`) as never);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    const message =
      error instanceof ModelVersionStateError ? error.message : "Kunne ikke avvise modellen.";
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
