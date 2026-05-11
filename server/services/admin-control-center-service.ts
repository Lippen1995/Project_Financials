import fs from "node:fs/promises";
import path from "node:path";

import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import type { AnnualReportExtractionFixReport } from "@/server/services/annual-report-extraction-fix-report-service";
import { readLatestAnnualReportExtractionFixReport } from "@/server/services/annual-report-extraction-fix-report-service";
import type { AnnualReportManualReviewRound } from "@/server/services/annual-report-manual-review-round-service";
import type { AnnualReportUnifiedConfidenceCalibrationReport } from "@/server/services/annual-report-unified-confidence-calibration-service";
import { readLatestUnifiedConfidenceThresholdCalibrationReport } from "@/server/services/annual-report-unified-confidence-calibration-service";
import type { AnnualReportUnifiedFailureTaxonomyReport } from "@/server/services/annual-report-unified-failure-taxonomy-service";
import { readLatestAnnualReportUnifiedFailureTaxonomyReport } from "@/server/services/annual-report-unified-failure-taxonomy-service";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import type { OpenDataLoaderRuntimeSummary } from "@/server/document-understanding/opendataloader-runtime";
import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { getAnnualReportPipelineOverview } from "@/server/services/annual-report-financials-service";
import { readLatestAnnualReportManualReviewRound } from "@/server/services/annual-report-manual-review-round-service";
import { getAnnualReportUnifiedShadowConfigFromEnv } from "@/server/services/annual-report-unified-shadow-config";
import {
  listUnifiedConfidenceGateResultsForAdmin,
  type UnifiedConfidenceAdminRow,
} from "@/server/services/annual-report-unified-confidence-admin-service";
import { DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG } from "@/server/services/pdf-parser-route-canary-config-service";

const GOLD_SET_LATEST_RUN_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-gold-set-shadow-runs",
  "latest.json",
);

export type AdminControlCenterStatus =
  | "NOT_STARTED"
  | "HEALTHY"
  | "WARNING"
  | "FAILING"
  | "BLOCKED"
  | "UNKNOWN";

export type AdminVisualTone = "GREEN" | "YELLOW" | "RED" | "BLUE" | "PURPLE";

export type AdminAttentionSeverity = "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type AdminSummaryCard = {
  key: string;
  title: string;
  value: string;
  detail: string;
  status: AdminControlCenterStatus;
  tone: AdminVisualTone;
  href?: string;
};

export type AdminAttentionItem = {
  key: string;
  severity: AdminAttentionSeverity;
  title: string;
  description: string;
  href?: string;
};

export type AdminFlowHelpSection = {
  title: string;
  body: string;
};

export type AdminFlowDecisionPath = {
  label: string;
  description: string;
  targetStep: number;
};

export type AdminFlowNode = {
  key: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  status: AdminControlCenterStatus;
  tone: AdminVisualTone;
  metric: string;
  typicalStatus?: string;
  href?: string;
  linkLabel?: string;
  unavailableLabel?: string;
  helpSections?: AdminFlowHelpSection[];
  legacyNote?: string;
  unifiedNote?: string;
  decisionPaths?: AdminFlowDecisionPath[];
};

export type AdminFlowSection = {
  title: string;
  subtitle: string;
  nodes: AdminFlowNode[];
};

export type AdminOnboardingItem = {
  stepNumber: number;
  text: string;
};

export type AdminGlossaryItem = {
  term: string;
  definition: string;
};

export type AdminLegendItem = {
  colorLabel: string;
  tone: AdminVisualTone;
  description: string;
};

export type AdminControlCenterModel = {
  title: string;
  subtitle: string;
  generatedAt: string;
  summaryCards: AdminSummaryCard[];
  attentionTitle: string;
  attentionItems: AdminAttentionItem[];
  attentionEmptyState: string;
  mainFlow: AdminFlowSection;
  goLiveFlow: AdminFlowSection;
  onboardingTitle: string;
  onboardingItems: AdminOnboardingItem[];
  glossaryTitle: string;
  glossaryItems: AdminGlossaryItem[];
  legendTitle: string;
  legendItems: AdminLegendItem[];
  diagnostics: string[];
};

type PipelineOverview = Awaited<ReturnType<typeof getAnnualReportPipelineOverview>>;

export type AdminControlCenterServiceDeps = {
  getOverview?: typeof getAnnualReportPipelineOverview;
  listUnifiedConfidence?: typeof listUnifiedConfidenceGateResultsForAdmin;
  inspectRuntime?: typeof inspectOpenDataLoaderRuntime;
  readLatestGoldSetRun?: () => Promise<AnnualReportGoldSetShadowRun | null>;
  readLatestManualReviewRound?: () => Promise<AnnualReportManualReviewRound | null>;
  readLatestExtractionFixReport?: () => Promise<AnnualReportExtractionFixReport | null>;
  readLatestCalibrationReport?: () => Promise<AnnualReportUnifiedConfidenceCalibrationReport | null>;
  readLatestTaxonomyReport?: () => Promise<AnnualReportUnifiedFailureTaxonomyReport | null>;
  getShadowConfig?: typeof getAnnualReportUnifiedShadowConfigFromEnv;
  now?: () => Date;
};

function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? "Ukjent" : value.toLocaleString("nb-NO");
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Ingen data funnet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Ukjent";
  }

  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

function daysBetween(fromIso: string | null | undefined, now: Date) {
  if (!fromIso) {
    return null;
  }

  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) {
    return null;
  }

  return Math.floor((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function countGroup(
  groups: Array<{ status: string; _count?: { _all?: number } | boolean }>,
  status: string,
) {
  const match = groups.find((item) => item.status === status);
  if (!match || typeof match._count !== "object" || match._count === null) {
    return 0;
  }

  return match._count._all ?? 0;
}

function countStatuses(
  groups: Array<{ status: string; _count?: { _all?: number } | boolean }>,
  statuses: string[],
) {
  return statuses.reduce((sum, status) => sum + countGroup(groups, status), 0);
}

function buildHelpSections(
  sections: Array<[title: string, body: string]>,
): AdminFlowHelpSection[] {
  return sections.map(([title, body]) => ({ title, body }));
}

function deriveToneFromStatus(status: AdminControlCenterStatus): AdminVisualTone {
  switch (status) {
    case "HEALTHY":
      return "GREEN";
    case "WARNING":
      return "YELLOW";
    case "FAILING":
    case "BLOCKED":
      return "RED";
    case "NOT_STARTED":
    case "UNKNOWN":
    default:
      return "BLUE";
  }
}

function deriveGoldSetStatus(
  run: AnnualReportGoldSetShadowRun | null,
  now: Date,
): AdminControlCenterStatus {
  if (!run) {
    return "NOT_STARTED";
  }
  if (!run.manifest.validation.productionReady || run.summary.failCount > 0) {
    return "FAILING";
  }

  const ageDays = daysBetween(run.generatedAt, now);
  if (ageDays !== null && ageDays > 7) {
    return "WARNING";
  }
  if (run.summary.warnCount > 0 || run.summary.skipCount > 0) {
    return "WARNING";
  }

  return "HEALTHY";
}

function deriveConfidenceStatus(row: UnifiedConfidenceAdminRow | null): AdminControlCenterStatus {
  if (!row) {
    return "UNKNOWN";
  }
  if (row.status === "error" || row.gateVerdict === "FAIL") {
    return "FAILING";
  }
  if (
    row.gateVerdict === "WARN" ||
    row.gateVerdict === "INSUFFICIENT_DATA" ||
    row.status === "skipped"
  ) {
    return "WARNING";
  }
  if (row.gateVerdict === "PASS") {
    return "HEALTHY";
  }

  return "UNKNOWN";
}

function deriveRuntimeStatus(runtime: OpenDataLoaderRuntimeSummary | null): AdminControlCenterStatus {
  if (!runtime) {
    return "UNKNOWN";
  }
  if (!runtime.packageInstalled) {
    return "BLOCKED";
  }
  if (!runtime.localModeReady) {
    return "WARNING";
  }

  return "HEALTHY";
}

function formatGoldSetRunStatus(run: AnnualReportGoldSetShadowRun) {
  if (run.summary.failCount > 0) {
    return "FAIL";
  }
  if (run.summary.warnCount > 0 || run.summary.skipCount > 0) {
    return "WARN";
  }
  return "PASS";
}

async function tryLoad<T>(
  label: string,
  action: () => Promise<T>,
  diagnostics: string[],
): Promise<T | null> {
  try {
    return await action();
  } catch (error) {
    diagnostics.push(
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

export async function readLatestAnnualReportGoldSetShadowRun(): Promise<AnnualReportGoldSetShadowRun | null> {
  try {
    const raw = await fs.readFile(GOLD_SET_LATEST_RUN_PATH, "utf8");
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

function buildAttentionItems(input: {
  reviewQueueCount: number;
  sampleReviewQueue: PipelineOverview["reviewQueue"];
  latestConfidence: UnifiedConfidenceAdminRow | null;
  latestGoldSetRun: AnnualReportGoldSetShadowRun | null;
  latestManualReviewRound: AnnualReportManualReviewRound | null;
  latestExtractionFixReport: AnnualReportExtractionFixReport | null;
  latestCalibrationReport: AnnualReportUnifiedConfidenceCalibrationReport | null;
  latestTaxonomyReport: AnnualReportUnifiedFailureTaxonomyReport | null;
  incompleteCoverageCount: number;
  runtime: OpenDataLoaderRuntimeSummary | null;
  diagnostics: string[];
  now: Date;
}): AdminAttentionItem[] {
  const items: AdminAttentionItem[] = [];

  if (input.reviewQueueCount > 0) {
    items.push({
      key: "review-queue",
      severity: "HIGH",
      title: "Rapporter venter pÃ¥ manuell kontroll",
      description: `${input.reviewQueueCount} rapporter ligger i review-kÃ¸en. Manuell review er et sikkerhetsnett og bÃ¸r prioriteres fÃ¸r nye saker hoper seg opp.`,
      href: "/admin/annual-report-reviews",
    });
  }

  if (input.latestManualReviewRound?.summary.pendingCount) {
    items.push({
      key: "gold-set-manual-review-pending",
      severity: "HIGH",
      title: "Gold-set manual review har Ã¥pne kandidater",
      description: `${input.latestManualReviewRound.summary.pendingCount} kandidater venter fortsatt pÃ¥ manuell vurdering fra siste review-runde.`,
      href: "/admin/annual-report-reviews",
    });
  }

  if ((input.latestManualReviewRound?.summary.severityCounts.HIGH ?? 0) > 0) {
    items.push({
      key: "gold-set-high-severity",
      severity: "HIGH",
      title: "HÃ¸y-alvorlige gold-set-saker trenger avklaring",
      description: `${input.latestManualReviewRound?.summary.severityCounts.HIGH ?? 0} kandidater er klassifisert som HIGH severity i review-runden.`,
      href: "/admin/annual-report-reviews",
    });
  }

  if ((input.latestCalibrationReport?.metrics.highSeverityMissCount ?? 0) > 0) {
    items.push({
      key: "calibration-high-severity-miss",
      severity: "HIGH",
      title: "Kalibreringen fant hÃ¸y-alvorlige PASS-saker",
      description: `${input.latestCalibrationReport?.metrics.highSeverityMissCount ?? 0} reviewed saker gikk gjennom som PASS selv om de burde vÃ¦rt stoppet eller sendt til review.`,
    });
  }

  if ((input.latestTaxonomyReport?.summary.highSeverityIssueCount ?? 0) > 0) {
    const topIssue = input.latestTaxonomyReport?.summary.issueClassCounts[0];
    items.push({
      key: "taxonomy-high-severity",
      severity: "HIGH",
      title: "Failure taxonomy viser høyrisiko-feil",
      description: topIssue
        ? `${input.latestTaxonomyReport?.summary.highSeverityIssueCount ?? 0} høyalvorlige taxonomy-funn er registrert. Største klasse er ${topIssue.issueClass}.`
        : `${input.latestTaxonomyReport?.summary.highSeverityIssueCount ?? 0} høyalvorlige taxonomy-funn er registrert.`,
      href: "/admin/pdf-parser-remediation",
    });
  }

  if ((input.latestExtractionFixReport?.remainingBlockers.length ?? 0) > 0) {
    items.push({
      key: "pr79-post-fix-blockers",
      severity: "MEDIUM",
      title: "PR79 har fortsatt åpne valideringsblokkerere",
      description:
        input.latestExtractionFixReport?.remainingBlockers[0] ??
        "Det finnes fortsatt åpne blokkerere etter PR79-fiksene.",
      href: "/admin/pdf-parser-remediation",
    });
  }

  const highSeveritySample = input.sampleReviewQueue.find(
    (item) =>
      item.status === "REJECTED" ||
      item.status === "REPROCESS_REQUESTED" ||
      (item.qualityScore ?? 1) < 0.5 ||
      item.blockingRuleCodes.length >= 3,
  );
  if (highSeveritySample) {
    items.push({
      key: "high-severity-review",
      severity: "HIGH",
      title: "Minst Ã©n reviewsak ser alvorlig ut",
      description: "En eller flere saker i review-kÃ¸en ser ut til Ã¥ ha lav kvalitet, mange blokkeringer eller tidligere feil. Start med disse sakene fÃ¸rst.",
      href: "/admin/annual-report-reviews",
    });
  }

  if (input.incompleteCoverageCount > 0) {
    items.push({
      key: "missing-artifacts",
      severity: "MEDIUM",
      title: "Noen rapporter mangler komplett grunnlag",
      description: `${input.incompleteCoverageCount} selskaper har fortsatt delvis dekning, feil eller manuell oppfÃ¸lging i coverage-data. Dette kan bety manglende PDF eller mellomresultater.`,
      href: "/admin/annual-report-reviews",
    });
  }

  if (input.runtime && (!input.runtime.packageInstalled || !input.runtime.localModeReady)) {
    items.push({
      key: "runtime",
      severity: "HIGH",
      title: "Parser-runtime trenger oppfÃ¸lging",
      description: `Systemet melder at lesemotoren ikke er helt klar: ${input.runtime.localModeReason}`,
      href: "/admin/pdf-parser-route-quality",
    });
  }

  if (input.latestConfidence?.gateVerdict === "FAIL") {
    items.push({
      key: "confidence-fail",
      severity: "HIGH",
      title: "Siste quality-vurdering blokkerer ny motor",
      description: input.latestConfidence.blockingCheckCodes.length > 0
        ? `Siste confidence gate feilet pÃ¥: ${input.latestConfidence.blockingCheckCodes.join(", ")}.`
        : "Siste confidence gate er markert som FAIL og bÃ¸r undersÃ¸kes nÃ¦rmere.",
      href: `/admin/annual-report-unified-confidence/${input.latestConfidence.filingId}`,
    });
  }

  if (
    input.latestConfidence &&
    (input.latestConfidence.blockingCheckCodes.some((code) => code.includes("UNIT")) ||
      input.latestConfidence.warningCheckCodes.some((code) => code.includes("UNIT")))
  ) {
    items.push({
      key: "unit-scale",
      severity: "MEDIUM",
      title: "Ukjent eller usikker enhetsskala er oppdaget",
      description: "Minst Ã©n nylig vurdert rapport ser ut til Ã¥ ha usikker skala, for eksempel kroner versus tusen kroner. Dette bÃ¸r kontrolleres fÃ¸r man stoler pÃ¥ tallene.",
      href: `/admin/annual-report-unified-confidence/${input.latestConfidence.filingId}`,
    });
  }

  if (
    input.latestConfidence &&
    input.latestConfidence.blockingCheckCodes.some((code) => code.includes("MISMATCH"))
  ) {
    items.push({
      key: "mismatch",
      severity: "MEDIUM",
      title: "Stor forskjell mellom gammel og ny ekstraksjon",
      description: "Siste sammenligning viser et viktig avvik mellom dagens lÃ¸sning og den nye lÃ¸sningen. Sjekk de viktigste regnskapslinjene manuelt.",
      href: `/admin/annual-report-unified-confidence/${input.latestConfidence.filingId}`,
    });
  }

  if (!input.latestGoldSetRun) {
    items.push({
      key: "shadow-missing",
      severity: "INFO",
      title: "Ingen persisted shadow batch er funnet",
      description: "Det finnes forelÃ¸pig ingen lagret gold-set shadow batch Ã¥ sammenligne mot. Go-live-vurderingen blir derfor svakere.",
    });
  } else {
    const ageDays = daysBetween(input.latestGoldSetRun.generatedAt, input.now);
    if (ageDays !== null && ageDays > 7) {
      items.push({
        key: "shadow-stale",
        severity: "MEDIUM",
        title: "Shadow batchen begynner Ã¥ bli gammel",
        description: `Siste persisted shadow batch er ${ageDays} dager gammel. Vurder ny kjÃ¸ring fÃ¸r videre go-live-beslutninger.`,
      });
    }

    for (const error of input.latestGoldSetRun.manifest.validation.errors) {
      items.push({
        key: `goldset-error-${error}`,
        severity: "HIGH",
        title: "Go-live-testsettet har en blokkering",
        description: error,
      });
    }
  }

  for (const diagnostic of input.diagnostics) {
    items.push({
      key: `diagnostic-${diagnostic}`,
      severity: "INFO",
      title: "Noe statusdata kunne ikke lastes",
      description: diagnostic,
    });
  }

  const order: Record<AdminAttentionSeverity, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
    INFO: 3,
  };

  return items.sort((left, right) => order[left.severity] - order[right.severity]);
}

function buildMainFlow(input: {
  newReportsCount: number;
  approvedCount: number;
  failedCount: number;
  reviewQueueCount: number;
  completedRunsCount: number;
  incompleteCoverageCount: number;
  latestConfidence: UnifiedConfidenceAdminRow | null;
  runtime: OpenDataLoaderRuntimeSummary | null;
}): AdminFlowSection {
  const comparisonMatchRate = input.latestConfidence?.comparisonMatchRate;
  const comparisonStatus =
    comparisonMatchRate === null || comparisonMatchRate === undefined
      ? "UNKNOWN"
      : comparisonMatchRate >= 0.95
        ? "HEALTHY"
        : comparisonMatchRate >= 0.8
          ? "WARNING"
          : "FAILING";

  const runtimeStatus = deriveRuntimeStatus(input.runtime);
  const confidenceStatus = deriveConfidenceStatus(input.latestConfidence);

  return {
    title: "Fra Ã¥rsrapport til tall i databasen",
    subtitle:
      "Denne flyten viser hvordan systemet mottar en Ã¥rsrapport, leser innholdet, kontrollerer kvaliteten og lagrer godkjente tall i databasen.",
    nodes: [
      {
        key: "report-received",
        stepNumber: 1,
        title: "Rapport mottas",
        subtitle: "Systemet finner eller mottar en ny Ã¥rsrapport som skal behandles.",
        status: input.newReportsCount > 0 ? "HEALTHY" : "UNKNOWN",
        tone: input.newReportsCount > 0 ? "GREEN" : "BLUE",
        metric: `${formatCount(input.newReportsCount)} nye rapporter mottatt`,
        typicalStatus:
          "GrÃ¸nn hvis rapporten er registrert. Gul hvis rapporten mangler nÃ¸kkeldata. RÃ¸d hvis rapporten ikke kan behandles.",
        unavailableLabel: "Ingen egen side ennÃ¥",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "En Ã¥rsrapport registreres i systemet. Det kan vÃ¦re en ny rapport fra Regnskapsregisteret eller en rapport som allerede finnes i systemet og skal behandles pÃ¥ nytt.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er startpunktet for hele prosessen. Uten en registrert rapport har systemet ingen dokumenter Ã¥ lese og ingen tall Ã¥ hente ut.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Rapporten kan mangle, vÃ¦re registrert med feil Ã¥r, vÃ¦re koblet til feil selskap, eller systemet kan ha flere mulige rapporter for samme selskap og Ã¥r.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Sjekk at rapporten gjelder riktig selskap, riktig organisasjonsnummer og riktig regnskapsÃ¥r. Hvis rapporten mangler eller er feil, mÃ¥ saken markeres for ny innhenting eller manuell oppfÃ¸lging.",
          ],
        ]),
      },
      {
        key: "artifact-linking",
        stepNumber: 2,
        title: "Riktig dokument kobles til",
        subtitle: "Systemet finner riktig PDF og tilhÃ¸rende mellomresultater for akkurat denne rapporten.",
        status:
          input.incompleteCoverageCount > 0
            ? "WARNING"
            : input.completedRunsCount > 0
              ? "HEALTHY"
              : "UNKNOWN",
        tone:
          input.incompleteCoverageCount > 0
            ? "YELLOW"
            : input.completedRunsCount > 0
              ? "GREEN"
              : "BLUE",
        metric:
          input.incompleteCoverageCount > 0
            ? `${formatCount(input.incompleteCoverageCount)} saker mangler fortsatt komplett grunnlag`
            : "Ingen kjente koblingsproblemer i tilgjengelige data",
        typicalStatus:
          "GrÃ¸nn hvis riktig dokument er funnet. Gul hvis systemet mÃ¥tte bruke fallback. RÃ¸d hvis dokumentet mangler eller er uklart.",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet kobler rapporten til riktig PDF-fil og relevante lagrede filer, som kvalitetssjekk, strukturert dokument, tidligere uttrekk og sammenligningsresultater.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Systemet mÃ¥ vÃ¦re helt sikker pÃ¥ at det leser riktig dokument. En rapport for feil Ã¥r eller feil selskap kan gi feil regnskapstall i databasen.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Feil PDF kan bli koblet til rapporten, flere dokumenter kan ligne pÃ¥ hverandre, eller et nÃ¸dvendig mellomresultat kan mangle.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Ã…pne rapportdetaljene og kontroller at dokumentet gjelder riktig selskap og Ã¥r. Hvis dokumentet er feil eller mangler, send saken til ny behandling eller marker den som blokkert.",
          ],
        ]),
      },
      {
        key: "pdf-quality",
        stepNumber: 3,
        title: "PDF-en kvalitetssjekkes",
        subtitle: "Systemet sjekker om PDF-en er lesbar og egnet for automatisk behandling.",
        status: runtimeStatus,
        tone:
          runtimeStatus === "HEALTHY"
            ? "GREEN"
            : runtimeStatus === "WARNING"
              ? "YELLOW"
              : runtimeStatus === "BLOCKED"
                ? "RED"
                : "BLUE",
        metric: input.runtime?.localModeReason ?? "Ukjent PDF-kvalitetsstatus",
        typicalStatus:
          "GrÃ¸nn hvis PDF-en er godt lesbar. Gul hvis kvaliteten er usikker. RÃ¸d hvis PDF-en ikke kan leses trygt.",
        href: "/admin/pdf-parser-route-quality",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet vurderer dokumentkvalitet, tekstlag, sidetyper, tabeller, skanning/OCR-behov og om rapporten ser komplett ut.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Gode PDF-er kan ofte leses automatisk. DÃ¥rlige skannede dokumenter, Ã¸delagte tabeller eller manglende tekstlag krever mer forsiktighet og oftere manuell kontroll.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "PDF-en kan vÃ¦re skannet dÃ¥rlig, ha utydelige tall, mangle tekst, ha roterte sider, ha tabeller som gÃ¥r over flere sider, eller ha layout som gjÃ¸r tall vanskelige Ã¥ tolke.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Se pÃ¥ kvalitetsscoren og eventuelle blokkeringer. Hvis PDF-en er dÃ¥rlig, Ã¥pne dokumentet manuelt og vurder om saken skal sendes til OCR, reprosessering eller manuell review.",
          ],
        ]),
      },
      {
        key: "parser-choice",
        stepNumber: 4,
        title: "Systemet velger lesemetode",
        subtitle: "Systemet bestemmer hvordan rapporten best skal leses og tolkes.",
        status: runtimeStatus,
        tone:
          runtimeStatus === "HEALTHY"
            ? "GREEN"
            : runtimeStatus === "WARNING"
              ? "YELLOW"
              : runtimeStatus === "BLOCKED"
                ? "RED"
                : "BLUE",
        metric:
          input.runtime?.packageInstalled
            ? `Lesemotor tilgjengelig, pakkeversjon ${input.runtime.packageVersion ?? "ukjent"}`
            : "Ingen egnet lesemotor er bekreftet tilgjengelig",
        typicalStatus:
          "GrÃ¸nn hvis metode er valgt trygt. Gul hvis valget er usikkert. RÃ¸d hvis ingen egnet metode er tilgjengelig.",
        href: "/admin/pdf-parser-route-recommendation-v2",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Basert pÃ¥ kvalitetssjekken velger systemet hvilken parser eller metode som passer best. En enkel digital rapport kan leses direkte, mens en vanskelig rapport kan kreve OCR eller mer forsiktig behandling.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Forskjellige rapporter mÃ¥ behandles forskjellig. Riktig lesemetode Ã¸ker sjansen for at tallene blir hentet ut riktig.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Systemet kan velge en metode som ikke passer dokumentet, eller nÃ¸dvendig parser/OCR-runtime kan vÃ¦re utilgjengelig.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Sjekk hvilken lesemetode systemet valgte og om det finnes varsler. Hvis metoden virker feil, send rapporten til reprosessering eller manuell vurdering.",
          ],
        ]),
      },
      {
        key: "extract-values",
        stepNumber: 5,
        title: "Tall og tekst hentes ut",
        subtitle: "Systemet leser rapporten og forsÃ¸ker Ã¥ hente ut regnskapstall, styreberetning og revisorberetning.",
        status:
          input.completedRunsCount > 0
            ? confidenceStatus
            : "UNKNOWN",
        tone: "PURPLE",
        metric:
          input.completedRunsCount > 0
            ? `${formatCount(input.completedRunsCount)} ekstraksjonskjÃ¸ringer er registrert`
            : "Ingen kjente ekstraksjonskjÃ¸ringer ennÃ¥",
        typicalStatus:
          "GrÃ¸nn hvis uttrekket er komplett. Gul hvis enkelte linjer er usikre. RÃ¸d hvis sentrale regnskapslinjer mangler.",
        href: "/admin/annual-report-unified-confidence",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet henter ut resultatregnskap, balanse, kontantstrÃ¸m hvis tilgjengelig, noter der det er relevant, styreberetning og revisorberetning.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er steget der PDF-en begynner Ã¥ bli til strukturerte data. Kvaliteten pÃ¥ dette uttrekket avgjÃ¸r hvor godt resten av prosessen fungerer.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Tall kan havne i feil kolonne, negative tall kan tolkes feil, tusenskilletegn kan skape feil, eller systemet kan blande sammen noter og hovedregnskap.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Ved varsel eller lav kvalitet: Ã¥pne sammenligningen og kontroller de viktigste linjene som driftsinntekter, Ã¥rsresultat, sum eiendeler, sum egenkapital og sum gjeld.",
          ],
        ]),
        legacyNote:
          "Dagens produksjonsmotor leser rapporten med den etablerte lÃ¸sningen som fortsatt er trygg kilde for publisering.",
        unifiedNote:
          "Ny ekstraksjonsmotor leser rapporten i bakgrunnen. Den brukes til testing og sammenligning, ikke direkte publisering.",
      },
      {
        key: "compare-results",
        stepNumber: 6,
        title: "Resultatene sammenlignes",
        subtitle: "Systemet sammenligner tallene fra dagens lÃ¸sning og den nye lÃ¸sningen.",
        status: comparisonStatus,
        tone: "PURPLE",
        metric:
          comparisonMatchRate === null || comparisonMatchRate === undefined
            ? "Ingen sammenligningsdata funnet"
            : `${Math.round(comparisonMatchRate * 100)} % samsvar i siste tilgjengelige sammenligning`,
        typicalStatus:
          "GrÃ¸nn hvis tallene matcher. Gul hvis det finnes mindre eller forklarbare avvik. RÃ¸d hvis viktige tall er ulike eller mangler.",
        href: "/admin/annual-report-unified-confidence",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet sammenligner linje for linje og Ã¥r for Ã¥r. Det ser etter like tall, smÃ¥ avvik, store avvik, manglende linjer og forskjeller i enhetsskala.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Sammenligningen viser om den nye lÃ¸sningen gir samme resultat som dagens lÃ¸sning, eller om det finnes avvik som mÃ¥ undersÃ¸kes.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Samme regnskapslinje kan ha ulike navn, tall kan vÃ¦re oppgitt i kroner, tusen kroner eller millioner kroner, eller Ã©n lÃ¸sning kan finne en linje som den andre ikke finner.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Se etter store avvik og linjer markert som mismatch. Prioriter viktige linjer som inntekter, Ã¥rsresultat, eiendeler, egenkapital og gjeld.",
          ],
        ]),
      },
      {
        key: "quality-gate",
        stepNumber: 7,
        title: "Systemet vurderer kvaliteten",
        subtitle: "Systemet avgjÃ¸r om resultatet virker trygt nok, eller om det mÃ¥ undersÃ¸kes nÃ¦rmere.",
        status: confidenceStatus,
        tone:
          confidenceStatus === "HEALTHY"
            ? "GREEN"
            : confidenceStatus === "WARNING"
              ? "YELLOW"
              : confidenceStatus === "FAILING"
                ? "RED"
                : "BLUE",
        metric:
          input.latestConfidence
            ? `Siste quality gate: ${input.latestConfidence.gateVerdict ?? "UNKNOWN"}`
            : "Ingen quality gate funnet",
        typicalStatus:
          "GrÃ¸nn hvis kvaliteten er god. Gul hvis menneskelig kontroll anbefales. RÃ¸d hvis resultatet ikke er trygt.",
        href: "/admin/annual-report-unified-confidence",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet bruker regler og kvalitetssjekker for Ã¥ vurdere om uttrekket er pÃ¥litelig. Det ser blant annet pÃ¥ manglende tall, store avvik, ukjent enhetsskala og usikre dokumentseksjoner.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er sikkerhetskontrollen som hindrer usikre eller feilaktige data fra Ã¥ gÃ¥ videre uten menneskelig vurdering.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Systemet kan vÃ¦re for strengt og sende for mye til review, eller for svakt og slippe gjennom noe som burde vÃ¦rt kontrollert.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Se pÃ¥ hvorfor saken fikk pass, warning eller fail. Hvis begrunnelsen virker alvorlig, Ã¥pne saken i review-kÃ¸en.",
          ],
        ]),
      },
      {
        key: "manual-review-decision",
        stepNumber: 8,
        title: "MÃ¥ rapporten kontrolleres manuelt?",
        subtitle: "Systemet avgjÃ¸r om et menneske mÃ¥ kontrollere rapporten fÃ¸r tallene kan brukes.",
        status:
          input.reviewQueueCount > 0
            ? "WARNING"
            : input.latestConfidence
              ? "HEALTHY"
              : "UNKNOWN",
        tone: "PURPLE",
        metric:
          input.reviewQueueCount > 0
            ? `${formatCount(input.reviewQueueCount)} saker er sendt til manuell kontroll`
            : "Ingen Ã¥pne saker i review-kÃ¸en akkurat nÃ¥",
        typicalStatus:
          "GrÃ¸nn hvis de fleste saker gÃ¥r trygt videre. Gul hvis mange saker krever review. RÃ¸d hvis beslutningsgrunnlaget mangler.",
        href: "/admin/annual-report-reviews",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Dette er et beslutningspunkt. Hvis systemet er trygt pÃ¥ resultatet, kan rapporten gÃ¥ videre. Hvis systemet er usikkert, sendes rapporten til manuell kontroll.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Manuell kontroll er sikkerhetsnettet som gjÃ¸r at vi kan behandle mange rapporter automatisk uten Ã¥ slippe gjennom usikre data.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "For mange rapporter kan havne i manuell kontroll, eller en usikker rapport kan bli feilklassifisert som trygg.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "FÃ¸lg statusen. Hvis saken er sendt til manuell kontroll, Ã¥pne review-kÃ¸en og behandle den der. Hvis mange saker havner her, bÃ¸r mÃ¸nsteret brukes til kalibrering og feilretting.",
          ],
        ]),
        decisionPaths: [
          {
            label: "Nei, kvaliteten er god nok",
            description: "Rapporten kan gÃ¥ videre til lagring.",
            targetStep: 10,
          },
          {
            label: "Ja, systemet er usikkert",
            description: "Rapporten sendes til manuell kontroll.",
            targetStep: 9,
          },
        ],
      },
      {
        key: "manual-review",
        stepNumber: 9,
        title: "Manuell kontroll",
        subtitle: "En admin eller reviewer kontrollerer rapporter der systemet er usikkert.",
        status:
          input.reviewQueueCount === 0
            ? "HEALTHY"
            : input.reviewQueueCount >= 10
              ? "FAILING"
              : "WARNING",
        tone: "PURPLE",
        metric: `${formatCount(input.reviewQueueCount)} saker i review-kÃ¸en`,
        typicalStatus:
          "GrÃ¸nn hvis kÃ¸en er under kontroll. Gul hvis mange saker venter. RÃ¸d hvis hÃ¸y-alvorlige saker blokkerer videre behandling.",
        href: "/admin/annual-report-reviews",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Reviewer ser pÃ¥ originalrapporten, maskinens forslag, sammenligninger og varsler. Reviewer kan godkjenne, avvise, korrigere eller sende saken til ny behandling.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er stedet der menneskelig dÃ¸mmekraft brukes for Ã¥ hindre feil i databasen og samtidig lÃ¦re hva systemet bÃ¸r bli bedre pÃ¥.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Reviewer kan mangle nÃ¸dvendig dokumentasjon, saken kan vÃ¦re vanskelig Ã¥ tolke, eller flere feilÃ¥rsaker kan vÃ¦re blandet sammen.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Ã…pne saken, kontroller de viktigste tallene mot PDF-en, legg inn beslutning og noter hva som var feil eller usikkert.",
          ],
        ]),
      },
      {
        key: "store-approved",
        stepNumber: 10,
        title: "Godkjente tall lagres",
        subtitle: "NÃ¥r tallene er godkjent, lagres de som strukturerte data i databasen.",
        status:
          input.approvedCount > 0
            ? "HEALTHY"
            : input.failedCount > 0
              ? "WARNING"
              : "UNKNOWN",
        tone:
          input.approvedCount > 0
            ? "GREEN"
            : input.failedCount > 0
              ? "YELLOW"
              : "BLUE",
        metric: `${formatCount(input.approvedCount)} rapporter er publisert eller lagret ferdig`,
        typicalStatus:
          "GrÃ¸nn hvis tallene er lagret med sporbarhet. Gul hvis noe metadata mangler. RÃ¸d hvis lagring feiler.",
        unavailableLabel: "Ingen egen side ennÃ¥",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet lagrer godkjente regnskapstall med sporbarhet til rapport, dokument, uttrekk, kvalitetssjekker og eventuell manuell review.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette gjÃ¸r at tallene kan brukes trygt i produktet, samtidig som vi kan spore hvor de kom fra og hvordan de ble godkjent.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Lagring kan feile, duplikater kan oppstÃ¥, eller tall kan mangle nÃ¸dvendig sporbarhet.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Sjekk om saken er markert som lagret og godkjent. Hvis lagring feiler, send saken til teknisk oppfÃ¸lging eller reprosessering.",
          ],
        ]),
      },
      {
        key: "available-in-product",
        stepNumber: 11,
        title: "Tallene blir tilgjengelige i produktet",
        subtitle: "Godkjente regnskapstall kan brukes i sÃ¸k, selskapsvisninger, analyser og andre produktflater.",
        status:
          input.approvedCount > 0
            ? "HEALTHY"
            : "UNKNOWN",
        tone:
          input.approvedCount > 0
            ? "GREEN"
            : "BLUE",
        metric:
          input.approvedCount > 0
            ? `${formatCount(input.approvedCount)} rapporter har tall som kan brukes videre`
            : "Ingen bekreftet publiserte tall funnet",
        typicalStatus:
          "GrÃ¸nn hvis tallene er synlige og brukbare. Gul hvis publisering eller indeksering mangler. RÃ¸d hvis dataene ikke vises der de skal.",
        unavailableLabel: "Ingen egen side ennÃ¥",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "NÃ¥r dataene er lagret, kan de vises pÃ¥ selskapssider, brukes i sÃ¸k, filtrering, analyser, rapporter og investeringsrelaterte arbeidsflyter.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er sluttverdien av hele prosessen: en ustrukturert Ã¥rsrapport blir til sÃ¸kbare og analyserbare regnskapstall.",
          ],
          [
            "Hva kan gÃ¥ galt?",
            "Data kan vÃ¦re lagret, men ikke indeksert, ikke synlig i UI, eller koblet feil til selskapssiden.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Kontroller at tallene vises riktig pÃ¥ selskapssiden eller i relevant analyseflate. Hvis tallene ikke vises, sjekk indeksering, kobling og publiseringsstatus.",
          ],
        ]),
      },
    ],
  };
}

function buildGoLiveFlow(input: {
  latestGoldSetRun: AnnualReportGoldSetShadowRun | null;
  latestExtractionFixReport: AnnualReportExtractionFixReport | null;
  latestCalibrationReport: AnnualReportUnifiedConfidenceCalibrationReport | null;
  latestTaxonomyReport: AnnualReportUnifiedFailureTaxonomyReport | null;
  reviewQueueCount: number;
  runtime: OpenDataLoaderRuntimeSummary | null;
}): AdminFlowSection {
  const goldSetStatus = deriveGoldSetStatus(input.latestGoldSetRun, new Date());
  const runtimeStatus = deriveRuntimeStatus(input.runtime);
  const canaryMode = DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.mode;
  const calibrationStatus = input.latestCalibrationReport
    ? input.latestCalibrationReport.thresholdBehavior.after.status === "STABLE"
      ? "HEALTHY"
      : input.latestCalibrationReport.thresholdBehavior.after.status === "REVIEW_REQUIRED"
        ? "WARNING"
        : "BLOCKED"
    : "NOT_STARTED";
  const calibrationTone =
    calibrationStatus === "HEALTHY"
      ? "GREEN"
      : calibrationStatus === "WARNING"
        ? "YELLOW"
        : calibrationStatus === "BLOCKED"
          ? "RED"
          : "BLUE";
  const calibrationMetric = input.latestCalibrationReport
    ? `Status: ${input.latestCalibrationReport.thresholdBehavior.after.status}. Review rate: ${
        input.latestCalibrationReport.metrics.manualReviewRate === null
          ? "Ukjent"
          : `${Math.round(input.latestCalibrationReport.metrics.manualReviewRate * 100)}%`
      }`
    : "Ingen kalibreringsrapport funnet";
  const taxonomyStatus = input.latestTaxonomyReport
    ? input.latestTaxonomyReport.summary.highSeverityIssueCount > 0
      ? "WARNING"
      : "HEALTHY"
    : "NOT_STARTED";
  const taxonomyTone =
    taxonomyStatus === "HEALTHY"
      ? "GREEN"
      : taxonomyStatus === "WARNING"
        ? "YELLOW"
        : "BLUE";
  const taxonomyMetric = input.latestTaxonomyReport
    ? `Top issue class: ${
        input.latestTaxonomyReport.summary.issueClassCounts[0]?.issueClass ?? "ingen"
      }. High severity: ${input.latestTaxonomyReport.summary.highSeverityIssueCount}`
    : "Ingen taxonomy-rapport funnet";
  const extractionFixStatus = input.latestExtractionFixReport
    ? input.latestExtractionFixReport.status === "REGRESSION_VERIFIED"
      ? "HEALTHY"
      : input.latestExtractionFixReport.status === "TARGETED_FIXES_APPLIED"
        ? "WARNING"
        : input.latestExtractionFixReport.status === "POST_FIX_VALIDATION_PENDING"
          ? "WARNING"
          : "UNKNOWN"
    : "NOT_STARTED";
  const extractionFixTone =
    extractionFixStatus === "HEALTHY"
      ? "GREEN"
      : extractionFixStatus === "WARNING"
        ? "PURPLE"
        : "BLUE";
  const extractionFixMetric = input.latestExtractionFixReport
    ? `Status: ${input.latestExtractionFixReport.status}. Målrettede klasser: ${input.latestExtractionFixReport.targetedIssueClasses.slice(0, 3).join(", ")}`
    : "Ingen PR79-rapport funnet";

  return {
    title: "Veien mot go-live for ny ekstraksjonsmotor",
    subtitle:
      "Denne flyten viser hvordan vi tester, kontrollerer og gradvis ruller ut den nye ekstraksjonslÃ¸sningen pÃ¥ en trygg mÃ¥te.",
    nodes: [
      {
        key: "gold-set",
        stepNumber: 1,
        title: "Bygg representativt testsett",
        subtitle: "Velg rapporter som dekker de viktigste typene Ã¥rsrapporter systemet mÃ¥ hÃ¥ndtere.",
        status: input.latestGoldSetRun ? "HEALTHY" : "NOT_STARTED",
        tone: "PURPLE",
        metric: input.latestGoldSetRun ? "Gold-set finnes lokalt" : "Ingen persisted gold-set funnet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Vi lager et gold-set med representative rapporter: enkle digitale rapporter, note-tunge rapporter, skannede rapporter, rapporter med ulike enhetsskalaer og rapporter som forventes Ã¥ kreve review.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Vi kan ikke vurdere go-live pÃ¥ tilfeldige eller for enkle rapporter. Testsettet mÃ¥ ligne virkeligheten.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Sjekk at testsettet dekker nok ulike rapporttyper og at ingen viktige kategorier mangler.",
          ],
        ]),
      },
      {
        key: "shadow-batch",
        stepNumber: 2,
        title: "KjÃ¸r shadow batch",
        subtitle: "Den nye lÃ¸sningen kjÃ¸res i bakgrunnen uten Ã¥ pÃ¥virke produksjonsdata.",
        status: goldSetStatus,
        tone: "PURPLE",
        metric: input.latestGoldSetRun
          ? `Siste kjÃ¸ring: ${formatGoldSetRunStatus(input.latestGoldSetRun)}`
          : "Ingen persisted shadow batch funnet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet kjÃ¸rer gammel og ny ekstraksjonsmotor pÃ¥ de samme rapportene og lagrer resultatene for sammenligning.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette lar oss teste den nye lÃ¸sningen trygt uten at brukere eller produksjonsdata pÃ¥virkes.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Sjekk om kjÃ¸ringen er fullfÃ¸rt, hvor mange rapporter som passerte, og hvilke som feilet eller krever review.",
          ],
        ]),
      },
      {
        key: "manual-review-golive",
        stepNumber: 3,
        title: "GjennomfÃ¸r manuell kontroll",
        subtitle: "Mennesker kontrollerer usikre eller avvikende resultater.",
        status: input.reviewQueueCount > 0 ? "WARNING" : "HEALTHY",
        tone: "PURPLE",
        metric: `${formatCount(input.reviewQueueCount)} saker i review-kÃ¸en`,
        href: "/admin/annual-report-reviews",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Reviewere gÃ¥r gjennom rapporter der systemet er usikkert, sammenligner mot PDF-en og registrerer beslutninger.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Manuell kontroll gir fasiten vi trenger for Ã¥ vite om systemet er trygt nok.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Prioriter hÃ¸yalvorlige saker fÃ¸rst og sÃ¸rg for at review-beslutninger blir registrert tydelig.",
          ],
        ]),
      },
      {
        key: "calibration",
        stepNumber: 4,
        title: "Juster terskler og regler",
        subtitle: "Bruk review-resultatene til Ã¥ gjÃ¸re kvalitetsvurderingene mer presise.",
        status: calibrationStatus,
        tone: calibrationTone,
        metric: calibrationMetric,
        unavailableLabel: "Ingen egen side ennÃ¥",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Vi justerer terskler for hva som skal passere automatisk, hva som skal sendes til review og hva som skal blokkeres.",
          ],
          [
            "Hvorfor er dette viktig?",
            "For strenge regler gir for mye manuelt arbeid. For svake regler kan slippe gjennom feil.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Se om endringene reduserer unÃ¸dvendig review uten Ã¥ Ã¸ke risikoen for feil.",
          ],
        ]),
      },
      {
        key: "failure-taxonomy",
        stepNumber: 5,
        title: "Klassifiser feiltyper",
        subtitle: "Sorter feilene i tydelige kategorier slik at vi vet hva som mÃ¥ forbedres.",
        status: taxonomyStatus,
        tone: taxonomyTone,
        metric: taxonomyMetric,
        href: "/admin/pdf-parser-remediation",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Feil grupperes etter Ã¥rsak, for eksempel enhetsskala, tabellstruktur, OCR-stÃ¸y, manglende linjer eller feil seksjonsdeling.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Vi kan ikke fikse alt samtidig. Feilklassifisering viser hvilke problemer som er stÃ¸rst og viktigst.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Se hvilke feilklasser som gÃ¥r igjen, og prioriter de som pÃ¥virker flest rapporter eller har hÃ¸yest risiko.",
          ],
        ]),
      },
      {
        key: "fix-errors",
        stepNumber: 6,
        title: "Rett de viktigste feilene",
        subtitle: "Utviklingsteamet fikser de feilene som gir stÃ¸rst utslag i kvaliteten.",
        status: extractionFixStatus,
        tone: extractionFixTone,
        metric: extractionFixMetric,
        href: "/admin/pdf-parser-remediation",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "De stÃ¸rste og mest alvorlige extraction-feilene rettes, for eksempel feil talltolkning, feil linjemapping eller problemer med fler-sidige balanser.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Systemet mÃ¥ forbedres pÃ¥ de feilene som faktisk hindrer trygg produksjonssetting.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Kontroller om de samme feiltypene fortsatt dukker opp etter ny kjÃ¸ring.",
          ],
        ]),
      },
      {
        key: "go-no-go",
        stepNumber: 7,
        title: "Lag go/no-go-vurdering",
        subtitle: "Oppsummer om systemet er klart for kontrollert utrulling.",
        status: "NOT_STARTED",
        tone: "BLUE",
        metric: "Ingen egen readiness-side ennÃ¥",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Vi samler resultater fra gold-set, shadow batch, review, kalibrering og feilretting i en samlet readiness-rapport.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Go-live skal ikke baseres pÃ¥ magefÃ¸lelse. Beslutningen mÃ¥ baseres pÃ¥ mÃ¥lbar kvalitet og tydelige blokkeringer.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Les readiness-rapporten og sjekk om det finnes Ã¥pne go-live-blokkeringer.",
          ],
        ]),
      },
      {
        key: "canary-no-effect",
        stepNumber: 8,
        title: "KjÃ¸r canary uten produksjonseffekt",
        subtitle: "Test den nye lÃ¸sningen i produksjonsmiljÃ¸ uten at den pÃ¥virker publiserte data.",
        status: runtimeStatus === "BLOCKED" ? "WARNING" : "HEALTHY",
        tone: "PURPLE",
        metric: "Read-only canary preview er tilgjengelig",
        href: "/admin/pdf-parser-route-canary-preview",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Den nye lÃ¸sningen kjÃ¸res pÃ¥ en liten andel reelle produksjonstilfeller, men resultatene brukes bare til observasjon og sammenligning.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette viser hvordan systemet oppfÃ¸rer seg i ekte drift fÃ¸r det fÃ¥r pÃ¥virke brukerne.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Sjekk om canary-kjÃ¸ringen skaper nye feil, treghet, manglende artifacts eller uventede avvik.",
          ],
        ]),
      },
      {
        key: "feature-flag",
        stepNumber: 9,
        title: "Aktiver routing bak feature flag",
        subtitle: "Ny produksjonsrouting forberedes, men styres av en sikker av/pÃ¥-bryter.",
        status: canaryMode === "DISABLED" ? "NOT_STARTED" : "WARNING",
        tone: canaryMode === "DISABLED" ? "BLUE" : "PURPLE",
        metric:
          canaryMode === "DISABLED"
            ? "Feature flag er av som trygg standard"
            : `Feature flag stÃ¥r i modus ${canaryMode}`,
        href: "/admin/pdf-parser-route-assignment-preview",
        linkLabel: "Ã…pne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet fÃ¥r teknisk stÃ¸tte for Ã¥ route enkelte tilfeller til ny lÃ¸sning, men bare nÃ¥r feature flag tillater det.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Feature flag gjÃ¸r det mulig Ã¥ aktivere gradvis og slÃ¥ raskt av hvis noe gÃ¥r galt.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Kontroller at flagget stÃ¥r i riktig modus og at legacy fortsatt er trygg fallback.",
          ],
        ]),
      },
      {
        key: "publish-gate",
        stepNumber: 10,
        title: "Sikre publish gate",
        subtitle: "Kun data som er trygge nok fÃ¥r pÃ¥virke produksjonsvisninger.",
        status: "HEALTHY",
        tone: "GREEN",
        metric: "Legacy brukes fortsatt som publish-safe kilde",
        unavailableLabel: "Ingen egen side ennÃ¥",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Publish gate bestemmer hvilke resultater som faktisk kan publiseres eller brukes som offisiell data i produktet.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette hindrer at usikre unified-resultater slipper ut til brukerne.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Sjekk at usikre resultater blokkeres, og at legacy fortsatt brukes nÃ¥r unified ikke er godkjent.",
          ],
        ]),
      },
      {
        key: "observability",
        stepNumber: 11,
        title: "OvervÃ¥kning, varsler og kill switch",
        subtitle: "Systemet overvÃ¥kes, og ny routing kan stoppes raskt hvis noe gÃ¥r galt.",
        status: "UNKNOWN",
        tone: "BLUE",
        metric: "Ingen egen side for varsler eller kill switch funnet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Vi fÃ¸lger med pÃ¥ feilrate, review-rate, runtime-problemer, datakvalitet og eventuelle produksjonsavvik.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Go-live er ikke trygt uten observability og en rask mÃ¥te Ã¥ stoppe feil pÃ¥.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "FÃ¸lg varsler og stopp utrulling hvis feilrate eller datakvalitet blir dÃ¥rligere enn akseptabelt.",
          ],
        ]),
      },
      {
        key: "limited-go-live",
        stepNumber: 12,
        title: "Begrenset go-live",
        subtitle: "Den nye lÃ¸sningen aktiveres for et lite og kontrollert omrÃ¥de.",
        status: "NOT_STARTED",
        tone: "BLUE",
        metric: "Ikke aktivert ennÃ¥",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Unified extraction kan brukes for en avgrenset gruppe rapporter, selskaper eller dokumenttyper, med tett oppfÃ¸lging.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Begrenset utrulling reduserer risiko og gir oss mulighet til Ã¥ oppdage problemer tidlig.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "FÃ¸lg nÃ¸kkeltall tett og kontroller at review-rate, feilrate og publish gate oppfÃ¸rer seg som forventet.",
          ],
        ]),
      },
      {
        key: "gradual-expansion",
        stepNumber: 13,
        title: "Gradvis utvidelse",
        subtitle: "Dekningen Ã¸kes nÃ¥r systemet har vist stabil kvalitet over tid.",
        status: "NOT_STARTED",
        tone: "BLUE",
        metric: "Ikke startet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Flere rapporttyper og stÃ¸rre volum flyttes gradvis over til den nye lÃ¸sningen etter hvert som kvalitet og drift er dokumentert stabil.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette lar oss skalere trygt uten Ã¥ ta unÃ¸dvendig produksjonsrisiko.",
          ],
          [
            "Hva gjÃ¸r admin?",
            "Kontroller at hver utvidelse har god nok kvalitet fÃ¸r neste steg Ã¥pnes.",
          ],
        ]),
      },
    ],
  };
}

export async function buildAdminControlCenterModel(
  deps: AdminControlCenterServiceDeps = {},
): Promise<AdminControlCenterModel> {
  const diagnostics: string[] = [];
  const now = deps.now?.() ?? new Date();

  const [
    overview,
    confidenceList,
    runtime,
    latestGoldSetRun,
    latestManualReviewRound,
    latestExtractionFixReport,
    latestCalibrationReport,
    latestTaxonomyReport,
  ] = await Promise.all([
    tryLoad(
      "annual-report overview",
      () => (deps.getOverview ?? getAnnualReportPipelineOverview)(),
      diagnostics,
    ),
    tryLoad(
      "unified confidence list",
      () =>
        (deps.listUnifiedConfidence ?? listUnifiedConfidenceGateResultsForAdmin)({
          limit: 5,
          offset: 0,
        }),
      diagnostics,
    ),
    tryLoad(
      "OpenDataLoader runtime diagnostics",
      () =>
        (deps.inspectRuntime ?? inspectOpenDataLoaderRuntime)(
          resolveOpenDataLoaderConfig(),
        ),
      diagnostics,
    ),
    tryLoad(
      "latest gold-set shadow run",
      () => (deps.readLatestGoldSetRun ?? readLatestAnnualReportGoldSetShadowRun)(),
      diagnostics,
    ),
    tryLoad(
      "latest manual review round",
      () => (deps.readLatestManualReviewRound ?? readLatestAnnualReportManualReviewRound)(),
      diagnostics,
    ),
    tryLoad(
      "latest extraction fix report",
      () => (deps.readLatestExtractionFixReport ?? readLatestAnnualReportExtractionFixReport)(),
      diagnostics,
    ),
    tryLoad(
      "latest calibration report",
      () => (deps.readLatestCalibrationReport ?? readLatestUnifiedConfidenceThresholdCalibrationReport)(),
      diagnostics,
    ),
    tryLoad(
      "latest failure taxonomy report",
      () => (deps.readLatestTaxonomyReport ?? readLatestAnnualReportUnifiedFailureTaxonomyReport)(),
      diagnostics,
    ),
  ]);

  const confidenceRows = confidenceList?.items ?? [];
  const latestConfidence = confidenceRows[0] ?? null;
  const shadowConfig = (deps.getShadowConfig ?? getAnnualReportUnifiedShadowConfigFromEnv)();

  const reviewQueueCount = overview
    ? countStatuses(overview.metrics.reviews, ["PENDING_REVIEW", "REPROCESS_REQUESTED"])
    : 0;
  const newReportsCount = overview
    ? countStatuses(overview.metrics.filings, ["DISCOVERED", "DOWNLOADED"])
    : 0;
  const approvedCount = overview
    ? countStatuses(overview.metrics.filings, ["PUBLISHED"])
    : 0;
  const failedCount = overview
    ? countStatuses(overview.metrics.filings, ["FAILED"])
    : 0;
  const completedRunsCount = overview
    ? countStatuses(overview.metrics.runs, ["SUCCEEDED"])
    : 0;
  const incompleteCoverageCount = overview?.metrics.incompleteCoverageCount ?? 0;

  const attentionItems = buildAttentionItems({
    reviewQueueCount,
    sampleReviewQueue: overview?.reviewQueue ?? [],
    latestConfidence,
    latestGoldSetRun,
    latestManualReviewRound,
    latestExtractionFixReport,
    latestCalibrationReport,
    latestTaxonomyReport,
    incompleteCoverageCount,
    runtime,
    diagnostics,
    now,
  });

  const goldSetStatus = deriveGoldSetStatus(latestGoldSetRun, now);
  const goLiveValue =
    !latestGoldSetRun
      ? "Ukjent"
      : goldSetStatus === "FAILING"
        ? "Krever oppfÃ¸lging"
        : goldSetStatus === "WARNING"
          ? "Under testing"
          : "Ser stabil ut";
  const goLiveTone =
    !latestGoldSetRun
      ? "BLUE"
      : goldSetStatus === "FAILING"
        ? "RED"
        : goldSetStatus === "WARNING"
          ? "PURPLE"
          : "GREEN";
  const topIssueClassEntry = latestTaxonomyReport
    ? latestTaxonomyReport.summary.issueClassCounts[0]
      ? [latestTaxonomyReport.summary.issueClassCounts[0].issueClass, latestTaxonomyReport.summary.issueClassCounts[0].count] as const
      : null
    : latestManualReviewRound
      ? Object.entries(latestManualReviewRound.summary.issueClassCounts).sort(
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
      )[0] ?? null
      : null;

  return {
    title: "Admin Control Center",
    subtitle:
      "Kontrollrom for Ã¥rsrapportflyt, manuell review og trygg utrulling av ny ekstraksjonsmotor.",
    generatedAt: now.toISOString(),
    summaryCards: [
      {
        key: "review-queue",
        title: "Rapporter i review-kÃ¸",
        value: latestManualReviewRound
          ? formatCount(latestManualReviewRound.summary.pendingCount)
          : formatCount(reviewQueueCount),
        detail:
          latestManualReviewRound
            ? "Pending kandidater i siste gold-set manual review round."
            : reviewQueueCount > 0
              ? "Rapporter som trenger manuell vurdering eller ny behandling."
              : "Ingen Ã¥pne reviewsaker akkurat nÃ¥.",
        status:
          latestManualReviewRound
            ? latestManualReviewRound.summary.pendingCount > 0
              ? "WARNING"
              : "HEALTHY"
            : overview === null
              ? "UNKNOWN"
              : reviewQueueCount > 0
                ? "WARNING"
                : "HEALTHY",
        tone:
          latestManualReviewRound
            ? latestManualReviewRound.summary.pendingCount > 0
              ? "PURPLE"
              : "GREEN"
            : overview === null
              ? "BLUE"
              : reviewQueueCount > 0
                ? "PURPLE"
                : "GREEN",
        href: "/admin/annual-report-reviews",
      },
      {
        key: "new-reports",
        title: "Manual review candidates",
        value: latestManualReviewRound
          ? formatCount(latestManualReviewRound.summary.reviewCandidateCount)
          : formatCount(newReportsCount),
        detail:
          latestManualReviewRound
            ? "Totalt antall kandidater generert fra siste persisted gold-set shadow batch."
            : overview === null
              ? "Ukjent hvor mange nye rapporter som er registrert."
              : "Rapporter som er oppdaget eller lastet ned, men ikke ferdig behandlet.",
        status: latestManualReviewRound ? "HEALTHY" : overview === null ? "UNKNOWN" : "HEALTHY",
        tone: latestManualReviewRound ? "GREEN" : overview === null ? "BLUE" : "GREEN",
        href: latestManualReviewRound ? "/admin/annual-report-reviews" : undefined,
      },
      {
        key: "approved",
        title: "Completed reviews",
        value: latestManualReviewRound
          ? formatCount(latestManualReviewRound.summary.reviewedCount)
          : formatCount(approvedCount),
        detail:
          latestManualReviewRound
            ? "Kandidater som allerede har fÃ¥tt filing-nivÃ¥ beslutning i review-runden."
            : overview === null
              ? "Ingen pÃ¥litelig publiseringsstatistikk tilgjengelig."
              : "Rapporter som er publisert eller lagret som godkjente tall.",
        status:
          latestManualReviewRound
            ? latestManualReviewRound.summary.reviewedCount > 0
              ? "HEALTHY"
              : "UNKNOWN"
            : overview === null
              ? "UNKNOWN"
              : approvedCount > 0
                ? "HEALTHY"
                : "UNKNOWN",
        tone:
          latestManualReviewRound
            ? latestManualReviewRound.summary.reviewedCount > 0
              ? "GREEN"
              : "BLUE"
            : overview === null
              ? "BLUE"
              : approvedCount > 0
                ? "GREEN"
                : "BLUE",
        href: latestManualReviewRound ? "/admin/annual-report-reviews" : undefined,
      },
      {
        key: "failed",
        title: "High severity cases",
        value: latestManualReviewRound
          ? formatCount(latestManualReviewRound.summary.severityCounts.HIGH)
          : formatCount(failedCount),
        detail:
          latestManualReviewRound
            ? "Kandidater med hÃ¸y alvorlighet som bÃ¸r prioriteres fÃ¸rst i manuell review."
            : overview === null
              ? "Ukjent hvor mange rapporter som har stoppet med feil."
              : failedCount > 0
                ? "Rapporter som stoppet fÃ¸r trygg lagring eller publisering."
                : "Ingen kjente feilede rapporter i tilgjengelige data.",
        status:
          latestManualReviewRound
            ? latestManualReviewRound.summary.severityCounts.HIGH > 0
              ? "FAILING"
              : "HEALTHY"
            : overview === null
              ? "UNKNOWN"
              : failedCount > 0
                ? "FAILING"
                : "HEALTHY",
        tone:
          latestManualReviewRound
            ? latestManualReviewRound.summary.severityCounts.HIGH > 0
              ? "RED"
              : "GREEN"
            : overview === null
              ? "BLUE"
              : failedCount > 0
                ? "RED"
                : "GREEN",
        href: latestManualReviewRound ? "/admin/annual-report-reviews" : undefined,
      },
      {
        key: "latest-shadow-batch",
        title: "Siste shadow batch",
        value: latestGoldSetRun ? formatGoldSetRunStatus(latestGoldSetRun) : "Ingen data funnet",
        detail:
          latestGoldSetRun
            ? `Sist lagret ${formatTimestamp(latestGoldSetRun.generatedAt)}.`
            : "Ingen persisted gold-set shadow batch er funnet lokalt.",
        status: goldSetStatus,
        tone: latestGoldSetRun ? goLiveTone : "BLUE",
      },
      {
        key: "calibration-status",
        title: "Calibration status",
        value: latestCalibrationReport?.thresholdBehavior.after.status ?? "Ingen data funnet",
        detail:
          latestCalibrationReport
            ? `Review rate: ${latestCalibrationReport.metrics.manualReviewRate === null ? "Ukjent" : `${Math.round(latestCalibrationReport.metrics.manualReviewRate * 100)}%`}. High severity miss: ${latestCalibrationReport.metrics.highSeverityMissCount}. Report: ${latestCalibrationReport.output.markdownPath}`
            : "Ingen persisted calibration report er funnet ennÃƒÂ¥.",
        status:
          latestCalibrationReport === null
            ? "UNKNOWN"
            : latestCalibrationReport.thresholdBehavior.after.status === "REVIEW_REQUIRED"
              ? "WARNING"
              : latestCalibrationReport.thresholdBehavior.after.status === "INSUFFICIENT_EVIDENCE"
                ? "UNKNOWN"
                : "HEALTHY",
        tone:
          latestCalibrationReport === null
            ? "BLUE"
            : latestCalibrationReport.thresholdBehavior.after.status === "REVIEW_REQUIRED"
              ? "YELLOW"
              : latestCalibrationReport.thresholdBehavior.after.status === "INSUFFICIENT_EVIDENCE"
                ? "BLUE"
                : "PURPLE",
      },
      {
        key: "extraction-fixes",
        title: "Extraction fixes",
        value: latestExtractionFixReport?.targetedIssueClasses[0] ?? "Ingen data funnet",
        detail:
          latestExtractionFixReport
            ? `Status: ${latestExtractionFixReport.status}. Report: ${latestExtractionFixReport.output.markdownPath}`
            : "Ingen persisted PR79 extraction-fix report er funnet ennå.",
        status:
          latestExtractionFixReport === null
            ? "UNKNOWN"
            : latestExtractionFixReport.status === "REGRESSION_VERIFIED"
              ? "HEALTHY"
              : "WARNING",
        tone:
          latestExtractionFixReport === null
            ? "BLUE"
            : latestExtractionFixReport.status === "REGRESSION_VERIFIED"
              ? "GREEN"
              : "PURPLE",
        href: "/admin/pdf-parser-remediation",
      },
      {
        key: "failure-taxonomy",
        title: "Failure taxonomy",
        value: latestTaxonomyReport?.summary.issueClassCounts[0]?.issueClass ?? "Ingen data funnet",
        detail:
          latestTaxonomyReport
            ? `High severity issues: ${latestTaxonomyReport.summary.highSeverityIssueCount}. Report: ${latestTaxonomyReport.output.markdownPath}`
            : "Ingen persisted failure taxonomy report er funnet ennå.",
        status:
          latestTaxonomyReport === null
            ? "UNKNOWN"
            : latestTaxonomyReport.summary.highSeverityIssueCount > 0
              ? "WARNING"
              : "HEALTHY",
        tone:
          latestTaxonomyReport === null
            ? "BLUE"
            : latestTaxonomyReport.summary.highSeverityIssueCount > 0
              ? "YELLOW"
              : "PURPLE",
        href: "/admin/pdf-parser-remediation",
      },
      {
        key: "go-live-status",
        title: "Go-live status",
        value: goLiveValue,
        detail:
          latestGoldSetRun
            ? "Bygger pÃ¥ siste shadow batch, review-kÃ¸ og tilgjengelig quality-data."
            : "For lite samlet evidens til Ã¥ vurdere go-live.",
        status: latestGoldSetRun ? goldSetStatus : "UNKNOWN",
        tone: goLiveTone,
      },
      {
        key: "highest-priority",
        title: latestManualReviewRound ? "Top issue class" : "HÃ¸yeste prioritet nÃ¥",
        value: latestManualReviewRound
          ? topIssueClassEntry?.[0] ?? "Ingen data"
          : attentionItems[0]?.title ?? "Ingen Ã¥pne problemer",
        detail:
          latestManualReviewRound
            ? topIssueClassEntry
              ? `${topIssueClassEntry[1]} kandidater i siste review-runde deler denne hovedÃ¥rsaken.`
              : "Ingen issue classes er registrert i siste review-runde ennÃ¥."
            : attentionItems[0]?.description ??
              "Ingen Ã¥pne problemer funnet basert pÃ¥ tilgjengelige data.",
        status:
          latestManualReviewRound
            ? topIssueClassEntry
              ? latestManualReviewRound.summary.severityCounts.HIGH > 0
                ? "FAILING"
                : latestManualReviewRound.summary.pendingCount > 0
                  ? "WARNING"
                  : "HEALTHY"
              : "UNKNOWN"
            : attentionItems[0]?.severity === "HIGH"
              ? "FAILING"
              : attentionItems[0]?.severity === "MEDIUM"
                ? "WARNING"
                : attentionItems[0]?.severity === "LOW"
                  ? "WARNING"
                  : attentionItems[0]
                    ? "UNKNOWN"
                    : "HEALTHY",
        tone:
          latestManualReviewRound
            ? topIssueClassEntry
              ? latestManualReviewRound.summary.severityCounts.HIGH > 0
                ? "RED"
                : latestManualReviewRound.summary.pendingCount > 0
                  ? "PURPLE"
                  : "GREEN"
              : "BLUE"
            : attentionItems[0]?.severity === "HIGH"
              ? "RED"
              : attentionItems[0]?.severity === "MEDIUM"
                ? "YELLOW"
                : attentionItems[0]?.severity === "LOW"
                  ? "YELLOW"
                  : attentionItems[0]
                    ? "BLUE"
                    : "GREEN",
        href: latestManualReviewRound ? "/admin/annual-report-reviews" : attentionItems[0]?.href,
      },
      {
        key: "publish-safety",
        title: "Publish safety mode",
        value: "Legacy-only publish",
        detail:
          shadowConfig.mode === "DISABLED"
            ? "Unified shadow-only er av eller ikke aktivert i dette miljÃ¸et. Legacy er fortsatt trygg publiseringskilde."
            : "Unified shadow-only er aktiv som evaluering. Legacy er fortsatt trygg publiseringskilde.",
        status: "HEALTHY",
        tone: "GREEN",
      },
    ],
    attentionTitle: "Hva trenger oppmerksomhet nÃ¥?",
    attentionItems,
    attentionEmptyState: "Ingen Ã¥pne problemer funnet basert pÃ¥ tilgjengelige data.",
    mainFlow: buildMainFlow({
      newReportsCount,
      approvedCount,
      failedCount,
      reviewQueueCount,
      completedRunsCount,
      incompleteCoverageCount,
      latestConfidence,
      runtime,
    }),
      goLiveFlow: buildGoLiveFlow({
        latestGoldSetRun,
        latestExtractionFixReport,
        latestCalibrationReport,
        latestTaxonomyReport,
        reviewQueueCount,
        runtime,
      }),
    onboardingTitle: "Slik bruker du admin-siden",
    onboardingItems: [
      {
        stepNumber: 1,
        text: 'Start med flyten "Fra Ã¥rsrapport til tall i databasen".',
      },
      {
        stepNumber: 2,
        text: "Se etter gule og rÃ¸de steg.",
      },
      {
        stepNumber: 3,
        text: "Ã…pne steget som trenger oppmerksomhet.",
      },
      {
        stepNumber: 4,
        text: 'FÃ¸lg forklaringen under "Hva gjÃ¸r admin?".',
      },
      {
        stepNumber: 5,
        text: "Bruk go-live-flyten for Ã¥ se om den nye ekstraksjonsmotoren er klar for produksjon.",
      },
    ],
    glossaryTitle: "Begreper",
    glossaryItems: [
      {
        term: "Ã…rsrapport",
        definition:
          "Et offisielt regnskapsdokument som inneholder selskapets Ã¥rsregnskap, noter, styreberetning og ofte revisorberetning.",
      },
      {
        term: "PDF",
        definition:
          "Selve dokumentfilen systemet skal lese. Noen PDF-er er enkle digitale dokumenter, andre er skannede eller vanskelige Ã¥ tolke.",
      },
      {
        term: "Artifact",
        definition:
          "En lagret fil eller et mellomresultat i prosessen. Det kan vÃ¦re original PDF, kvalitetssjekk, strukturert dokument, uttrekk eller sammenligningsresultat.",
      },
      {
        term: "Legacy",
        definition:
          "Dagens etablerte ekstraksjonslÃ¸sning. Den er fortsatt trygg kilde for publisering.",
      },
      {
        term: "Unified",
        definition:
          "Den nye ekstraksjonslÃ¸sningen som testes og gradvis skal bli bedre. Den kjÃ¸res forelÃ¸pig som kontroll/shadow der det er aktuelt.",
      },
      {
        term: "Shadow run",
        definition:
          "En testkjÃ¸ring der systemet behandler rapporter i bakgrunnen uten Ã¥ pÃ¥virke produksjonsdata.",
      },
      {
        term: "Confidence gate",
        definition:
          "En sikkerhetskontroll som vurderer om resultatet er trygt nok, bÃ¸r sendes til manuell review eller mÃ¥ blokkeres.",
      },
      {
        term: "Manuell review",
        definition:
          "Menneskelig kontroll av rapporter der systemet er usikkert eller har funnet avvik.",
      },
      {
        term: "Publish gate",
        definition:
          "Siste kontroll fÃ¸r data kan pÃ¥virke det brukerne ser i produktet.",
      },
      {
        term: "Feature flag",
        definition:
          "En kontrollert av/pÃ¥-bryter som lar oss aktivere eller deaktivere ny funksjonalitet trygt.",
      },
      {
        term: "Kill switch",
        definition:
          "En nÃ¸dmekanisme som raskt kan stoppe ny routing eller ny funksjonalitet hvis noe gÃ¥r galt.",
      },
    ],
    legendTitle: "Statuslegend",
    legendItems: [
      {
        colorLabel: "GrÃ¸nn",
        tone: "GREEN",
        description: "Alt ser normalt ut. Steget fungerer eller har ingen kjente problemer.",
      },
      {
        colorLabel: "Gul",
        tone: "YELLOW",
        description: "Trenger oppmerksomhet. Steget fungerer, men har saker som bÃ¸r fÃ¸lges opp.",
      },
      {
        colorLabel: "RÃ¸d",
        tone: "RED",
        description: "Feil eller blokkert. Steget har problemer som mÃ¥ lÃ¸ses fÃ¸r prosessen kan fortsette trygt.",
      },
      {
        colorLabel: "BlÃ¥/grÃ¥",
        tone: "BLUE",
        description: "Ikke startet eller ukjent. Systemet mangler nok data til Ã¥ vurdere status.",
      },
      {
        colorLabel: "Lilla",
        tone: "PURPLE",
        description: "Under testing eller i review. Steget er aktivt, men ikke ferdig godkjent.",
      },
    ],
    diagnostics,
  };
}




