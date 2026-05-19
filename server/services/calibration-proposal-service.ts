/**
 * Calibration Proposal Service
 *
 * Bridges the existing confidence-calibration analysis (which produces a JSON
 * report on disk) and the new database-backed threshold version system. When
 * a calibration run identifies threshold changes that would have caught past
 * review mistakes, this service writes them as a PROPOSED version awaiting
 * human approval and notifies admins.
 *
 * For reviewers (business view):
 *  - Running calibration is non-destructive — it never changes the active
 *    thresholds on its own. It only records a proposal.
 *  - A proposal is created only when the underlying calibration analysis
 *    suggests at least one adjustment. Running again with no new data is a
 *    no-op.
 *  - Each proposal carries: the new threshold values, the calibration report
 *    that produced them, a one-line summary, and an "impact estimate" the
 *    UI can show to help the reviewer judge the proposal.
 */
import {
  type AnnualReportUnifiedConfidenceCalibrationInput,
  type AnnualReportUnifiedConfidenceCalibrationReport,
  buildUnifiedConfidenceThresholdCalibrationReport,
} from "@/server/services/annual-report-unified-confidence-calibration-service";
import { createAdminNotificationIfMissing } from "@/server/services/admin-notification-service";
import {
  type ConfidenceThresholdVersionSummary,
  proposeThresholdVersion,
} from "@/server/services/confidence-threshold-version-service";

export type CalibrationProposalResult = {
  /** Did the calibration actually propose any change? */
  proposalCreated: boolean;
  /** The newly created proposal (null if no change was warranted). */
  proposal: ConfidenceThresholdVersionSummary | null;
  /** The full calibration report — useful for the UI to surface details. */
  report: AnnualReportUnifiedConfidenceCalibrationReport;
};

/**
 * Builds a one-paragraph human summary of what changed between the before
 * and after thresholds. Returned to reviewers in the bell notification and
 * on the calibration page so they don't have to read the raw JSON.
 */
function summariseAdjustments(report: AnnualReportUnifiedConfidenceCalibrationReport): string {
  if (report.thresholdAdjustments.length === 0) {
    return "Ingen endringer i tersklene foreslås på dette grunnlaget.";
  }
  const parts = report.thresholdAdjustments
    .slice(0, 4)
    .map((adj) => `${adj.key}: ${adj.currentValue} → ${adj.proposedValue}`);
  if (report.thresholdAdjustments.length > parts.length) {
    parts.push(`+${report.thresholdAdjustments.length - parts.length} flere endringer`);
  }
  return parts.join(" · ");
}

/**
 * Computes a small impact estimate the UI can display so reviewers see
 * concrete effects instead of abstract threshold numbers.
 */
function buildImpactEstimate(report: AnnualReportUnifiedConfidenceCalibrationReport) {
  const before = report.thresholdBehavior.before.distribution;
  const after = report.thresholdBehavior.after.distribution;
  const beforeTotal = before.PASS + before.WARN + before.FAIL + before.INSUFFICIENT_DATA;
  const afterTotal = after.PASS + after.WARN + after.FAIL + after.INSUFFICIENT_DATA;

  const pctPass = (count: number, total: number) =>
    total === 0 ? null : Math.round((count / total) * 1000) / 10;

  return {
    sampleSize: report.evidenceUsed.reviewedCandidates,
    autoPublishRateBefore: pctPass(before.PASS, beforeTotal),
    autoPublishRateAfter: pctPass(after.PASS, afterTotal),
    manualReviewRateBefore: pctPass(before.WARN, beforeTotal),
    manualReviewRateAfter: pctPass(after.WARN, afterTotal),
    falsePassRate: report.metrics.falsePassRate,
    falsePassCount: report.metrics.falsePassCount,
    highSeverityMissCount: report.metrics.highSeverityMissCount,
  };
}

/**
 * Decides whether the calibration's verdict is meaningful enough to create
 * a proposal. We require at least one threshold adjustment AND enough
 * reviewed evidence — a calibration based on 3 reviews is too noisy.
 */
function shouldCreateProposal(report: AnnualReportUnifiedConfidenceCalibrationReport): boolean {
  const MIN_EVIDENCE = 20;
  return (
    report.thresholdAdjustments.length > 0 &&
    report.evidenceUsed.reviewedCandidates >= MIN_EVIDENCE
  );
}

export type RunCalibrationOptions = {
  /** Input to forward to buildUnifiedConfidenceThresholdCalibrationReport. */
  calibrationInput?: AnnualReportUnifiedConfidenceCalibrationInput;
  /** Skip notification creation (useful in tests). */
  skipNotification?: boolean;
};

/**
 * Runs a fresh calibration analysis and, if it suggests meaningful changes,
 * records a PROPOSED threshold version in the database and notifies admins.
 *
 * This is the entry point the UI "Run calibration" button calls. It is also
 * suitable for a scheduled cron job in the future.
 */
export async function runCalibrationAndProposeIfChanged(
  options: RunCalibrationOptions = {},
): Promise<CalibrationProposalResult> {
  const report = await buildUnifiedConfidenceThresholdCalibrationReport(
    options.calibrationInput ?? {},
  );

  if (!shouldCreateProposal(report)) {
    return { proposalCreated: false, proposal: null, report };
  }

  const summary = summariseAdjustments(report);
  const impactEstimate = buildImpactEstimate(report);

  const proposal = await proposeThresholdVersion({
    configBlob: report.thresholdBehavior.after.gateConfig,
    derivedFromReport: {
      version: report.version,
      generatedAt: report.generatedAt,
      sourceRunId: report.sourceRun.runId,
      evidenceUsed: report.evidenceUsed,
      metrics: report.metrics,
      adjustments: report.thresholdAdjustments,
    },
    impactEstimate,
    summary,
  });

  if (!options.skipNotification) {
    await createAdminNotificationIfMissing({
      type: "CALIBRATION_PROPOSED",
      recipientRole: "ADMIN",
      title: `Ny kalibreringsforslag v${proposal.version}`,
      body: summary,
      linkPath: `/admin/extraction-learning?proposalId=${proposal.id}`,
      // Dedupe per proposal — the same proposal cannot generate two notifications.
      dedupeKey: `calibration-proposal:${proposal.id}`,
      metadata: {
        proposalId: proposal.id,
        version: proposal.version,
        adjustmentCount: report.thresholdAdjustments.length,
        evidenceCount: report.evidenceUsed.reviewedCandidates,
      },
    }).catch((error) => {
      // Notification failure must never lose the proposal — it is already saved.
      console.warn("[calibration-proposal-service] notification failed", error);
    });
  }

  return { proposalCreated: true, proposal, report };
}
