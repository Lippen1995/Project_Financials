import fs from "node:fs/promises";
import path from "node:path";

import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import type { AnnualReportExtractionFixReport } from "@/server/services/annual-report-extraction-fix-report-service";
import { readLatestAnnualReportExtractionFixReport } from "@/server/services/annual-report-extraction-fix-report-service";
import type { AnnualReportManualReviewRound } from "@/server/services/annual-report-manual-review-round-service";
import { readLatestAnnualReportManualReviewRound } from "@/server/services/annual-report-manual-review-round-service";
import type { AnnualReportUnifiedConfidenceCalibrationReport } from "@/server/services/annual-report-unified-confidence-calibration-service";
import { readLatestUnifiedConfidenceThresholdCalibrationReport } from "@/server/services/annual-report-unified-confidence-calibration-service";
import type { AnnualReportUnifiedFailureTaxonomyReport } from "@/server/services/annual-report-unified-failure-taxonomy-service";
import { readLatestAnnualReportUnifiedFailureTaxonomyReport } from "@/server/services/annual-report-unified-failure-taxonomy-service";
import {
  getAnnualReportUnifiedShadowConfigFromEnv,
  type AnnualReportUnifiedShadowConfig,
} from "@/server/services/annual-report-unified-shadow-config";

const READINESS_OUTPUT_DIR = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-go-no-go-readiness",
);

const LATEST_GOLD_SET_SHADOW_RUN_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-gold-set-shadow-runs",
  "latest.json",
);

const LATEST_MANUAL_REVIEW_ROUND_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-manual-review-rounds",
  "latest.json",
);

const LATEST_CALIBRATION_REPORT_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-unified-confidence-calibration",
  "latest.json",
);

const LATEST_FAILURE_TAXONOMY_REPORT_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-unified-failure-taxonomy",
  "latest.json",
);

const LATEST_EXTRACTION_FIX_REPORT_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-extraction-fixes",
  "latest.json",
);

export type AnnualReportGoNoGoDecision = "GO" | "CONDITIONAL_GO" | "NO_GO";
export type AnnualReportReadinessCriterionStatus = "PASS" | "WARNING" | "FAIL" | "UNKNOWN";

export type AnnualReportReadinessCriterion = {
  key: string;
  title: string;
  status: AnnualReportReadinessCriterionStatus;
  blocker: boolean;
  summary: string;
  evidence: string[];
};

export type AnnualReportReadinessMetric = {
  label: string;
  value: string;
  status: AnnualReportReadinessCriterionStatus;
  note?: string | null;
};

export type AnnualReportGoNoGoReadinessReport = {
  version: "annual-report-go-no-go-readiness-v1";
  generatedAt: string;
  decision: AnnualReportGoNoGoDecision;
  executiveSummary: string;
  evidenceUsed: {
    goldSetShadowRunPath: string | null;
    manualReviewRoundPath: string | null;
    calibrationReportPath: string | null;
    failureTaxonomyReportPath: string | null;
    extractionFixReportPath: string | null;
  };
  criteria: AnnualReportReadinessCriterion[];
  blockers: string[];
  warnings: string[];
  metricTable: AnnualReportReadinessMetric[];
  residualRisks: string[];
  recommendedNextActions: {
    pr81ReadinessWorkflow: string[];
    pr82ShadowCanary: string[];
  };
  output: {
    jsonPath: string;
    markdownPath: string;
  };
  safety: {
    publishSourceOfTruth: "LEGACY";
    unifiedMode: "SHADOW_ONLY";
    canUseForProductionRouting: false;
    productionRoutingChanged: false;
    publishAffected: false;
  };
};

export type AnnualReportGoNoGoReadinessServiceDeps = {
  now?: () => Date;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  readLatestGoldSetRun?: () => Promise<AnnualReportGoldSetShadowRun | null>;
  readLatestManualReviewRound?: () => Promise<AnnualReportManualReviewRound | null>;
  readLatestCalibrationReport?: () => Promise<AnnualReportUnifiedConfidenceCalibrationReport | null>;
  readLatestTaxonomyReport?: () => Promise<AnnualReportUnifiedFailureTaxonomyReport | null>;
  readLatestExtractionFixReport?: () => Promise<AnnualReportExtractionFixReport | null>;
  inspectRuntime?: typeof inspectOpenDataLoaderRuntime;
  getShadowConfig?: () => AnnualReportUnifiedShadowConfig;
  readFile?: typeof fs.readFile;
};

async function readLatestGoldSetShadowRun(
  deps: Pick<AnnualReportGoNoGoReadinessServiceDeps, "readFile"> = {},
): Promise<AnnualReportGoldSetShadowRun | null> {
  const readFile = deps.readFile ?? fs.readFile;

  try {
    const raw = await readFile(LATEST_GOLD_SET_SHADOW_RUN_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<AnnualReportGoldSetShadowRun>;
    if (
      parsed &&
      parsed.version === "annual-report-gold-set-shadow-run-v1" &&
      typeof parsed.runId === "string"
    ) {
      return parsed as AnnualReportGoldSetShadowRun;
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function criterion(
  key: string,
  title: string,
  status: AnnualReportReadinessCriterionStatus,
  summary: string,
  evidence: string[],
  options?: { blocker?: boolean },
): AnnualReportReadinessCriterion {
  return {
    key,
    title,
    status,
    blocker: options?.blocker ?? status === "FAIL",
    summary,
    evidence,
  };
}

function renderPercent(value: number | null) {
  return value === null ? "Ukjent" : `${Math.round(value * 100)}%`;
}

function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? "Ukjent" : value.toLocaleString("nb-NO");
}

function hasCriticalMissingArtifacts(round: AnnualReportManualReviewRound | null) {
  if (!round) {
    return false;
  }

  const counts = round.summary.missingArtifactCounts;
  return (
    (counts.structured_document_json ?? 0) > 0 ||
    (counts.legacy_extraction ?? 0) > 0 ||
    (counts.unified_extraction ?? 0) > 0
  );
}

function listTopIssueClasses(taxonomyReport: AnnualReportUnifiedFailureTaxonomyReport | null) {
  if (!taxonomyReport) {
    return [];
  }
  return taxonomyReport.summary.issueClassCounts.slice(0, 3).map((item) => item.issueClass);
}

function buildOutputPaths(now: Date) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return {
    jsonPath: path.join(READINESS_OUTPUT_DIR, `pr80-go-no-go-readiness-${stamp}.json`),
    markdownPath: path.join(READINESS_OUTPUT_DIR, `pr80-go-no-go-readiness-${stamp}.md`),
  };
}

function decide(criteria: AnnualReportReadinessCriterion[]): AnnualReportGoNoGoDecision {
  if (criteria.some((item) => item.status === "FAIL" && item.blocker)) {
    return "NO_GO";
  }
  if (criteria.some((item) => item.status === "UNKNOWN" && item.blocker)) {
    return "NO_GO";
  }
  if (criteria.some((item) => item.status === "WARNING" || item.status === "UNKNOWN")) {
    return "CONDITIONAL_GO";
  }
  return "GO";
}

function buildExecutiveSummary(
  decision: AnnualReportGoNoGoDecision,
  blockers: string[],
  warnings: string[],
) {
  if (decision === "GO") {
    return "Unified-ekstraksjonen har nok samlet evidens til å gå videre til readiness workflow og shadow-only canary-forberedelser, uten at publish safety er svekket.";
  }
  if (decision === "CONDITIONAL_GO") {
    return blockers.length > 0
      ? `Readiness er delvis på plass, men ${blockers.length} blokkerere må lukkes før vi trygt kan gå videre.`
      : `Readiness kan gå videre med tydelige forbehold. ${warnings.length} varsler må følges opp før neste steg.`;
  }
  return blockers.length > 0
    ? `Unified-ekstraksjonen er ikke klar for neste go-live-steg. ${blockers.length} blokkerere er fortsatt åpne.`
    : "Unified-ekstraksjonen er ikke klar for neste go-live-steg basert på tilgjengelig evidens.";
}

export async function buildAnnualReportGoNoGoReadinessReport(
  deps: AnnualReportGoNoGoReadinessServiceDeps = {},
): Promise<AnnualReportGoNoGoReadinessReport> {
  const now = deps.now?.() ?? new Date();
  const readLatestGoldSetRun =
    deps.readLatestGoldSetRun ?? (() => readLatestGoldSetShadowRun({ readFile: deps.readFile }));
  const readLatestManualReviewRound =
    deps.readLatestManualReviewRound ?? readLatestAnnualReportManualReviewRound;
  const readLatestCalibrationReport =
    deps.readLatestCalibrationReport ?? readLatestUnifiedConfidenceThresholdCalibrationReport;
  const readLatestTaxonomyReport =
    deps.readLatestTaxonomyReport ?? readLatestAnnualReportUnifiedFailureTaxonomyReport;
  const readLatestExtractionFixReport =
    deps.readLatestExtractionFixReport ?? readLatestAnnualReportExtractionFixReport;
  const inspectRuntime = deps.inspectRuntime ?? inspectOpenDataLoaderRuntime;
  const getShadowConfig = deps.getShadowConfig ?? getAnnualReportUnifiedShadowConfigFromEnv;

  const [
    latestGoldSetRun,
    latestManualReviewRound,
    latestCalibrationReport,
    latestTaxonomyReport,
    latestExtractionFixReport,
    runtime,
  ] = await Promise.all([
    readLatestGoldSetRun(),
    readLatestManualReviewRound(),
    readLatestCalibrationReport(),
    readLatestTaxonomyReport(),
    readLatestExtractionFixReport(),
    inspectRuntime(resolveOpenDataLoaderConfig()),
  ]);

  const shadowConfig = getShadowConfig();
  const criteria: AnnualReportReadinessCriterion[] = [];

  const requiredTags = [
    "digital_simple",
    "digital_note_heavy",
    "multi_page_balance",
    "supplementary_present",
    "unit_scale_sensitive",
    "scan_or_ocr",
    "ocr_token_noise",
    "formatting_edge",
    "manual_review_expected",
    "degraded_ambiguous",
    "continuation_complex",
  ];
  const coverageByTag = latestGoldSetRun?.manifest.validation.coverageByTag ?? {};
  const missingCoverageTags = requiredTags.filter((tag) => (coverageByTag[tag] ?? 0) <= 0);
  const unavailableEntries =
    latestGoldSetRun?.manifest.validation.evidenceQualitySummary.unavailable ?? 0;

  criteria.push(
    !latestGoldSetRun
      ? criterion(
          "gold-set-coverage",
          "Gold-set er representativt nok",
          "UNKNOWN",
          "Ingen persisted gold-set shadow run ble funnet.",
          [],
          { blocker: true },
        )
      : latestGoldSetRun.manifest.validation.productionReady &&
          missingCoverageTags.length === 0 &&
          unavailableEntries === 0
        ? criterion(
            "gold-set-coverage",
            "Gold-set er representativt nok",
            "PASS",
            "Gold-set dekker de forventede rapportklassene uten unavailable entries.",
            [
              `Coverage tags: ${requiredTags.length}`,
              `Unavailable entries: ${unavailableEntries}`,
            ],
          )
        : criterion(
            "gold-set-coverage",
            "Gold-set er representativt nok",
            "FAIL",
            "Gold-set har fortsatt coverage-hull eller unavailable entries som svekker readiness-evidensen.",
            [
              `Missing tags: ${missingCoverageTags.length > 0 ? missingCoverageTags.join(", ") : "ingen"}`,
              `Unavailable entries: ${unavailableEntries}`,
              ...latestGoldSetRun.manifest.validation.warnings,
            ],
            { blocker: true },
          ),
  );

  const reviewCandidateCount = latestManualReviewRound?.summary.reviewCandidateCount ?? 0;
  const reviewedCount = latestManualReviewRound?.summary.reviewedCount ?? 0;
  const pendingCount = latestManualReviewRound?.summary.pendingCount ?? 0;
  criteria.push(
    !latestManualReviewRound
      ? criterion(
          "manual-review-completed",
          "Manuell review-runde er gjennomført",
          "UNKNOWN",
          "Ingen persisted manual review round ble funnet.",
          [],
          { blocker: true },
        )
      : reviewCandidateCount === 0
        ? criterion(
            "manual-review-completed",
            "Manuell review-runde er gjennomført",
            "WARNING",
            "Ingen kandidater krevde review i siste runde.",
            ["Review candidate count: 0"],
          )
        : pendingCount === 0 && reviewedCount > 0
          ? criterion(
              "manual-review-completed",
              "Manuell review-runde er gjennomført",
              "PASS",
              "Alle review-kandidater har fått en filing-nivå beslutning.",
              [
                `Reviewed: ${reviewedCount}`,
                `Pending: ${pendingCount}`,
              ],
            )
          : reviewedCount === 0
            ? criterion(
                "manual-review-completed",
                "Manuell review-runde er gjennomført",
                "FAIL",
                "Manual review round finnes, men ingen kandidater er faktisk reviewet ennå.",
                [
                  `Review candidates: ${reviewCandidateCount}`,
                  `Pending: ${pendingCount}`,
                ],
                { blocker: true },
              )
            : criterion(
                "manual-review-completed",
                "Manuell review-runde er gjennomført",
                "WARNING",
                "Review-runden er startet, men det finnes fortsatt åpne kandidater.",
                [
                  `Reviewed: ${reviewedCount}`,
                  `Pending: ${pendingCount}`,
                ],
              ),
  );

  criteria.push(
    !latestManualReviewRound || !latestGoldSetRun
      ? criterion(
          "artifact-coverage",
          "Artifact-dekning har ingen kritiske hull",
          "UNKNOWN",
          "Manglende run- eller review-data gjør artifact-dekning usikker.",
          [],
          { blocker: true },
        )
      : hasCriticalMissingArtifacts(latestManualReviewRound) || unavailableEntries > 0
        ? criterion(
            "artifact-coverage",
            "Artifact-dekning har ingen kritiske hull",
            "FAIL",
            "Det finnes fortsatt kritiske mangler i structured document eller andre nøkkel-artifacts.",
            [
              `Missing structured_document_json: ${latestManualReviewRound.summary.missingArtifactCounts.structured_document_json ?? 0}`,
              `Missing legacy_extraction: ${latestManualReviewRound.summary.missingArtifactCounts.legacy_extraction ?? 0}`,
              `Missing unified_extraction: ${latestManualReviewRound.summary.missingArtifactCounts.unified_extraction ?? 0}`,
              `Unavailable gold-set entries: ${unavailableEntries}`,
            ],
            { blocker: true },
          )
        : criterion(
            "artifact-coverage",
            "Artifact-dekning har ingen kritiske hull",
            "PASS",
            "Gold-set og review-runde viser ingen kritiske mangler i nøkkel-artifacts.",
            [
              `Unavailable gold-set entries: ${unavailableEntries}`,
            ],
          ),
  );

  criteria.push(
    !latestCalibrationReport
      ? criterion(
          "false-auto-pass",
          "Ingen høyalvorlige false auto-pass er kjent",
          "UNKNOWN",
          "Kalibreringsrapport mangler.",
          [],
          { blocker: true },
        )
      : latestCalibrationReport.metrics.falsePassCount > 0 ||
          latestCalibrationReport.metrics.highSeverityMissCount > 0
        ? criterion(
            "false-auto-pass",
            "Ingen høyalvorlige false auto-pass er kjent",
            "FAIL",
            "Kalibreringen fant saker som passerte automatisk uten å være trygge nok.",
            [
              `False pass count: ${latestCalibrationReport.metrics.falsePassCount}`,
              `High severity miss count: ${latestCalibrationReport.metrics.highSeverityMissCount}`,
            ],
            { blocker: true },
          )
        : latestCalibrationReport.metrics.totalReviewedCases === 0
          ? criterion(
              "false-auto-pass",
              "Ingen høyalvorlige false auto-pass er kjent",
              "WARNING",
              "Kalibreringen har ingen reviewed cases og kan derfor ikke bevise at auto-pass er trygge.",
              [
                `Calibration status: ${latestCalibrationReport.thresholdBehavior.after.status}`,
                `Reviewed cases: ${latestCalibrationReport.metrics.totalReviewedCases}`,
              ],
            )
          : criterion(
              "false-auto-pass",
              "Ingen høyalvorlige false auto-pass er kjent",
              "PASS",
              "Kalibreringen fant ingen false pass eller høyalvorlige PASS-misser i reviewed data.",
              [
                `Reviewed cases: ${latestCalibrationReport.metrics.totalReviewedCases}`,
              ],
            ),
  );

  const unitScaleIssues =
    latestTaxonomyReport?.summary.issueClassCounts
      .filter((item) => item.issueClass === "UNIT_SCALE_UNKNOWN" || item.issueClass === "UNIT_SCALE_MISMATCH")
      .reduce((sum, item) => sum + item.count, 0) ?? 0;
  criteria.push(
    !latestCalibrationReport
      ? criterion(
          "unit-scale-safety",
          "Enhetsskala blir blokkert eller sendt til review",
          "UNKNOWN",
          "Kalibreringsrapport mangler, så unit-scale-policy kan ikke verifiseres.",
          [],
          { blocker: true },
        )
      : latestCalibrationReport.thresholdBehavior.after.policy.unitScaleAmbiguityDecision === "FAIL" &&
          unitScaleIssues === 0
        ? criterion(
            "unit-scale-safety",
            "Enhetsskala blir blokkert eller sendt til review",
            "PASS",
            "Gjeldende gate-policy blokkerer usikker skala, og siste taxonomy viser ingen åpne unit-scale-problemer.",
            [
              `Policy: ${latestCalibrationReport.thresholdBehavior.after.policy.unitScaleAmbiguityDecision}`,
            ],
          )
        : latestCalibrationReport.thresholdBehavior.after.policy.unitScaleAmbiguityDecision === "FAIL"
          ? criterion(
              "unit-scale-safety",
              "Enhetsskala blir blokkert eller sendt til review",
              "WARNING",
              "Gate-policyen blokkerer usikker skala, men taxonomy viser fortsatt saker som må følges opp.",
              [
                `Policy: ${latestCalibrationReport.thresholdBehavior.after.policy.unitScaleAmbiguityDecision}`,
                `Open unit-scale issues: ${unitScaleIssues}`,
              ],
            )
          : criterion(
              "unit-scale-safety",
              "Enhetsskala blir blokkert eller sendt til review",
              "FAIL",
              "Gjeldende policy blokkerer ikke unit-scale ambiguity strengt nok.",
              [
                `Policy: ${latestCalibrationReport.thresholdBehavior.after.policy.unitScaleAmbiguityDecision}`,
              ],
              { blocker: true },
            ),
  );

  const primaryStatementIssues =
    latestTaxonomyReport?.summary.issueClassCounts
      .filter(
        (item) =>
          item.issueClass === "PRIMARY_INCOME_STATEMENT_MISSING" ||
          item.issueClass === "PRIMARY_BALANCE_SHEET_MISSING",
      )
      .reduce((sum, item) => sum + item.count, 0) ?? 0;
  criteria.push(
    !latestTaxonomyReport
      ? criterion(
          "primary-statements",
          "Primæroppstillinger blir funnet eller trygt reviewet",
          "UNKNOWN",
          "Failure taxonomy mangler, så coverage for resultatregnskap og balanse er ukjent.",
          [],
          { blocker: true },
        )
      : primaryStatementIssues === 0
        ? criterion(
            "primary-statements",
            "Primæroppstillinger blir funnet eller trygt reviewet",
            "PASS",
            "Taxonomy viser ingen åpne funn for manglende primæroppstillinger.",
            [],
          )
        : pendingCount > 0
          ? criterion(
              "primary-statements",
              "Primæroppstillinger blir funnet eller trygt reviewet",
              "FAIL",
              "Det finnes fortsatt åpne funn for manglende resultatregnskap eller balanse, og review-runden er ikke lukket.",
              [
                `Open primary statement issues: ${primaryStatementIssues}`,
                `Pending review candidates: ${pendingCount}`,
              ],
              { blocker: true },
            )
          : criterion(
              "primary-statements",
              "Primæroppstillinger blir funnet eller trygt reviewet",
              "WARNING",
              "Det finnes fortsatt taxonomy-funn for manglende primæroppstillinger som må forklares før videre utrulling.",
              [`Open primary statement issues: ${primaryStatementIssues}`],
            ),
  );

  const unresolvedHighSeverityIssueClasses =
    latestTaxonomyReport?.summary.issueClassCounts.filter(
      (item) =>
        item.severity === "HIGH" &&
        !latestExtractionFixReport?.targetedIssueClasses.includes(
          item.issueClass as AnnualReportExtractionFixReport["targetedIssueClasses"][number],
        ),
    ) ?? [];
  criteria.push(
    !latestTaxonomyReport || !latestExtractionFixReport
      ? criterion(
          "remediation-plan",
          "Toppfeilene har en tydelig utbedringsplan",
          "UNKNOWN",
          "Taxonomy eller extraction-fix report mangler.",
          [],
          { blocker: true },
        )
      : unresolvedHighSeverityIssueClasses.length === 0 &&
          latestExtractionFixReport.remainingBlockers.length === 0
        ? criterion(
            "remediation-plan",
            "Toppfeilene har en tydelig utbedringsplan",
            "PASS",
            "Høyrisiko-feilene i taxonomy er dekket av extraction-fix scope eller har ingen åpne PR79-blokkere.",
            [`Targeted issue classes: ${latestExtractionFixReport.targetedIssueClasses.join(", ")}`],
          )
        : criterion(
            "remediation-plan",
            "Toppfeilene har en tydelig utbedringsplan",
            unresolvedHighSeverityIssueClasses.some(
              (item) =>
                item.issueClass === "STRUCTURED_DOCUMENT_MISSING" ||
                item.issueClass === "PARSER_RUNTIME_UNAVAILABLE",
            )
              ? "FAIL"
              : "WARNING",
            "Noen høyrisiko-feil står fortsatt uten lukket utbedringsløp eller akseptabel residual risiko.",
            [
              `Unresolved high-severity classes: ${unresolvedHighSeverityIssueClasses.map((item) => item.issueClass).join(", ") || "ingen"}`,
              ...latestExtractionFixReport.remainingBlockers,
            ],
            {
              blocker: unresolvedHighSeverityIssueClasses.some(
                (item) =>
                  item.issueClass === "STRUCTURED_DOCUMENT_MISSING" ||
                  item.issueClass === "PARSER_RUNTIME_UNAVAILABLE",
              ),
            },
          ),
  );

  const shadowSkipCount = latestGoldSetRun?.summary.skipCount ?? null;
  const shadowFailCount = latestGoldSetRun?.summary.failCount ?? null;
  criteria.push(
    !latestGoldSetRun
      ? criterion(
          "shadow-runtime",
          "Shadow batch kjører uten runtime-blokkere",
          "UNKNOWN",
          "Ingen persisted shadow batch ble funnet.",
          [],
          { blocker: true },
        )
      : !runtime.liveHybridBenchmarkReady || (shadowSkipCount ?? 0) > 0 || (shadowFailCount ?? 0) > 0
        ? criterion(
            "shadow-runtime",
            "Shadow batch kjører uten runtime-blokkere",
            "FAIL",
            "Siste shadow batch viser skips/failures eller runtime er ikke helt klar for representativ kjøring.",
            [
              `Shadow skip count: ${shadowSkipCount ?? "unknown"}`,
              `Shadow fail count: ${shadowFailCount ?? "unknown"}`,
              `Hybrid runtime ready: ${runtime.liveHybridBenchmarkReady ? "ja" : "nei"}`,
              runtime.liveHybridBenchmarkReason ?? "Ingen runtime-begrunnelse registrert.",
            ],
            { blocker: true },
          )
        : criterion(
            "shadow-runtime",
            "Shadow batch kjører uten runtime-blokkere",
            "PASS",
            "Siste shadow batch fullførte uten skip/fail, og runtime er klar.",
            [
              `Shadow skip count: ${shadowSkipCount ?? 0}`,
              `Shadow fail count: ${shadowFailCount ?? 0}`,
            ],
          ),
  );

  const publishSafetySignals = [
    latestCalibrationReport?.safety,
    latestTaxonomyReport?.safety,
    latestExtractionFixReport?.safety,
  ].filter((value): value is NonNullable<typeof value> => value !== undefined);
  const publishSafetyChanged = publishSafetySignals.some(
    (item) =>
      item.canUseForProductionRouting ||
      item.productionRoutingChanged ||
      item.productionFactsMutated ||
      item.publishAffected,
  );
  criteria.push(
    publishSafetyChanged
      ? criterion(
          "publish-safety",
          "Legacy er fortsatt publish-safe kilde",
          "FAIL",
          "Minst ett readiness-input signaliserer at publish safety eller production routing er påvirket.",
          [],
          { blocker: true },
        )
      : criterion(
          "publish-safety",
          "Legacy er fortsatt publish-safe kilde",
          "PASS",
          "Alle rapporter og konfigurasjoner viser at legacy fortsatt er eneste publish-safe source of truth.",
          [
            "Legacy remains publish-safe source of truth.",
            "Unified remains shadow/evaluation-only.",
          ],
        ),
  );

  criteria.push(
    shadowConfig.mode === "DISABLED" ||
      shadowConfig.mode === "DRY_RUN" ||
      shadowConfig.mode === "PERSIST_ARTIFACTS"
      ? criterion(
          "shadow-only-mode",
          "Unified er fortsatt shadow-only",
          "PASS",
          "Unified-kjøring er fortsatt begrenset til shadow/evaluation-modus.",
          [`Shadow mode: ${shadowConfig.mode}`],
        )
      : criterion(
          "shadow-only-mode",
          "Unified er fortsatt shadow-only",
          "FAIL",
          "Shadow-konfigurasjonen er ikke gjenkjent som en trygg, shadow-only modus.",
          [`Shadow mode: ${shadowConfig.mode}`],
          { blocker: true },
        ),
  );

  const blockers = criteria
    .filter((item) => item.status === "FAIL" && item.blocker)
    .map((item) => `${item.title}: ${item.summary}`);
  const warnings = criteria
    .filter((item) => item.status === "WARNING" || item.status === "UNKNOWN")
    .map((item) => `${item.title}: ${item.summary}`);
  const decision = decide(criteria);
  const output = buildOutputPaths(now);

  const metricTable: AnnualReportReadinessMetric[] = [
    {
      label: "Gold-set filings",
      value: formatCount(latestManualReviewRound?.summary.totalFilings ?? latestGoldSetRun?.batch.manifest.entries.length),
      status: latestGoldSetRun ? "PASS" : "UNKNOWN",
    },
    {
      label: "Unavailable gold-set entries",
      value: formatCount(unavailableEntries),
      status: unavailableEntries > 0 ? "FAIL" : "PASS",
    },
    {
      label: "Manual review completion",
      value:
        reviewCandidateCount > 0
          ? `${reviewedCount}/${reviewCandidateCount}`
          : latestManualReviewRound
            ? "0/0"
            : "Ukjent",
      status:
        !latestManualReviewRound
          ? "UNKNOWN"
          : pendingCount === 0 && reviewedCount > 0
            ? "PASS"
            : reviewedCount > 0
              ? "WARNING"
              : "FAIL",
    },
    {
      label: "High severity false auto-pass",
      value: formatCount(latestCalibrationReport?.metrics.highSeverityMissCount ?? null),
      status:
        latestCalibrationReport === null
          ? "UNKNOWN"
          : (latestCalibrationReport.metrics.highSeverityMissCount ?? 0) > 0
            ? "FAIL"
            : latestCalibrationReport.metrics.totalReviewedCases === 0
              ? "WARNING"
              : "PASS",
    },
    {
      label: "Shadow skip count",
      value: formatCount(shadowSkipCount),
      status:
        shadowSkipCount === null ? "UNKNOWN" : shadowSkipCount > 0 ? "FAIL" : "PASS",
    },
    {
      label: "Top failure class",
      value: latestTaxonomyReport?.summary.issueClassCounts[0]?.issueClass ?? "Ukjent",
      status:
        latestTaxonomyReport === null
          ? "UNKNOWN"
          : latestTaxonomyReport.summary.highSeverityIssueCount > 0
            ? "WARNING"
            : "PASS",
      note:
        latestTaxonomyReport === null
          ? "Ingen persisted taxonomy-rapport funnet."
          : `High severity issues: ${latestTaxonomyReport.summary.highSeverityIssueCount}`,
    },
    {
      label: "Readiness blockers",
      value: formatCount(blockers.length),
      status: blockers.length > 0 ? "FAIL" : "PASS",
    },
    {
      label: "Publish safety mode",
      value: "Legacy-only publish",
      status: "PASS",
    },
  ];

  const residualRisks = [
    ...(latestGoldSetRun?.manifest.validation.warnings ?? []),
    ...(latestExtractionFixReport?.recommendationsForPr80 ?? []),
  ];

  const recommendedNextActions = {
    pr81ReadinessWorkflow:
      decision === "GO"
        ? [
            "Bygg readiness workflow/CI guard med utgangspunkt i denne rapporten og blokkér nye endringer når sentrale readiness-kriterier faller ut.",
            "Bruk readiness-rapporten som baseline for automatiske sjekker i PR81.",
          ]
        : [
            "Ikke start PR81 som håndhevbar guard før manual review-runden er ferdig og readiness-blokkere er lukket.",
            "Bruk blokkeringene i denne rapporten som eksplisitte inngangskrav til PR81.",
          ],
    pr82ShadowCanary:
      decision === "GO" || decision === "CONDITIONAL_GO"
        ? [
            "Hold unified shadow-only og bruk readiness-rapporten som kontrolliste før canary-forberedelser.",
            "Verifiser at canary fortsatt ikke påvirker publish safety eller production routing.",
          ]
        : [
            "Ikke gå videre til PR82 canary-forberedelser før shadow skips, artifact coverage og manual review er avklart.",
            "Kjør ny persisted shadow batch etter at blokkerne er lukket.",
          ],
  };

  return {
    version: "annual-report-go-no-go-readiness-v1",
    generatedAt: now.toISOString(),
    decision,
    executiveSummary: buildExecutiveSummary(decision, blockers, warnings),
    evidenceUsed: {
      goldSetShadowRunPath: latestGoldSetRun ? LATEST_GOLD_SET_SHADOW_RUN_PATH : null,
      manualReviewRoundPath: latestManualReviewRound ? LATEST_MANUAL_REVIEW_ROUND_PATH : null,
      calibrationReportPath: latestCalibrationReport ? LATEST_CALIBRATION_REPORT_PATH : null,
      failureTaxonomyReportPath: latestTaxonomyReport ? LATEST_FAILURE_TAXONOMY_REPORT_PATH : null,
      extractionFixReportPath: latestExtractionFixReport ? LATEST_EXTRACTION_FIX_REPORT_PATH : null,
    },
    criteria,
    blockers,
    warnings,
    metricTable,
    residualRisks,
    recommendedNextActions,
    output,
    safety: {
      publishSourceOfTruth: "LEGACY",
      unifiedMode: "SHADOW_ONLY",
      canUseForProductionRouting: false,
      productionRoutingChanged: false,
      publishAffected: false,
    },
  };
}

export function renderAnnualReportGoNoGoReadinessMarkdown(
  report: AnnualReportGoNoGoReadinessReport,
) {
  const lines = [
    "# PR80 go/no-go readiness report",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Decision: ${report.decision}`,
    `- Executive summary: ${report.executiveSummary}`,
    "",
    "## Evidence used",
    "",
    `- Gold-set shadow run: ${report.evidenceUsed.goldSetShadowRunPath ?? "missing"}`,
    `- Manual review round: ${report.evidenceUsed.manualReviewRoundPath ?? "missing"}`,
    `- Calibration report: ${report.evidenceUsed.calibrationReportPath ?? "missing"}`,
    `- Failure taxonomy report: ${report.evidenceUsed.failureTaxonomyReportPath ?? "missing"}`,
    `- Extraction fix report: ${report.evidenceUsed.extractionFixReportPath ?? "missing"}`,
    "",
    "## Criteria",
    "",
    ...report.criteria.flatMap((item) => [
      `### ${item.title}`,
      "",
      `- Status: ${item.status}`,
      `- Blocker: ${item.blocker ? "yes" : "no"}`,
      `- Summary: ${item.summary}`,
      ...item.evidence.map((evidence) => `- Evidence: ${evidence}`),
      "",
    ]),
    "## Key metrics",
    "",
    ...report.metricTable.map(
      (item) =>
        `- ${item.label}: ${item.value} [${item.status}]${item.note ? ` (${item.note})` : ""}`,
    ),
    "",
    "## Blockers",
    "",
    ...(report.blockers.length > 0 ? report.blockers.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Warnings",
    "",
    ...(report.warnings.length > 0 ? report.warnings.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Residual risks",
    "",
    ...(report.residualRisks.length > 0
      ? report.residualRisks.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Recommended next actions for PR81",
    "",
    ...report.recommendedNextActions.pr81ReadinessWorkflow.map((item) => `- ${item}`),
    "",
    "## Recommended next actions for PR82",
    "",
    ...report.recommendedNextActions.pr82ShadowCanary.map((item) => `- ${item}`),
    "",
  ];

  return lines.join("\n");
}

export async function persistAnnualReportGoNoGoReadinessArtifacts(
  report: AnnualReportGoNoGoReadinessReport,
  deps: AnnualReportGoNoGoReadinessServiceDeps = {},
) {
  const mkdir = deps.mkdir ?? fs.mkdir;
  const writeFile = deps.writeFile ?? fs.writeFile;
  const json = JSON.stringify(report, null, 2);
  const markdown = renderAnnualReportGoNoGoReadinessMarkdown(report);

  await mkdir(READINESS_OUTPUT_DIR, { recursive: true });
  await writeFile(report.output.jsonPath, json, "utf8");
  await writeFile(report.output.markdownPath, markdown, "utf8");
  await writeFile(path.join(READINESS_OUTPUT_DIR, "latest.json"), json, "utf8");
  await writeFile(path.join(READINESS_OUTPUT_DIR, "latest.md"), markdown, "utf8");
}

export async function readLatestAnnualReportGoNoGoReadinessReport(
  deps: AnnualReportGoNoGoReadinessServiceDeps = {},
) {
  const readFile = deps.readFile ?? fs.readFile;
  try {
    const raw = await readFile(path.join(READINESS_OUTPUT_DIR, "latest.json"), "utf8");
    const parsed = JSON.parse(raw) as AnnualReportGoNoGoReadinessReport;
    return parsed.version === "annual-report-go-no-go-readiness-v1" ? parsed : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
