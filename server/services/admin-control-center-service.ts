import fs from "node:fs/promises";
import path from "node:path";

import type { AnnualReportGoldSetShadowRun } from "@/server/benchmarking/annual-report-gold-set-shadow-run";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import type { OpenDataLoaderRuntimeSummary } from "@/server/document-understanding/opendataloader-runtime";
import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { getAnnualReportPipelineOverview } from "@/server/services/annual-report-financials-service";
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
      title: "Rapporter venter på manuell kontroll",
      description: `${input.reviewQueueCount} rapporter ligger i review-køen. Manuell review er et sikkerhetsnett og bør prioriteres før nye saker hoper seg opp.`,
      href: "/admin/annual-report-reviews",
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
      title: "Minst én reviewsak ser alvorlig ut",
      description: "En eller flere saker i review-køen ser ut til å ha lav kvalitet, mange blokkeringer eller tidligere feil. Start med disse sakene først.",
      href: "/admin/annual-report-reviews",
    });
  }

  if (input.incompleteCoverageCount > 0) {
    items.push({
      key: "missing-artifacts",
      severity: "MEDIUM",
      title: "Noen rapporter mangler komplett grunnlag",
      description: `${input.incompleteCoverageCount} selskaper har fortsatt delvis dekning, feil eller manuell oppfølging i coverage-data. Dette kan bety manglende PDF eller mellomresultater.`,
      href: "/admin/annual-report-reviews",
    });
  }

  if (input.runtime && (!input.runtime.packageInstalled || !input.runtime.localModeReady)) {
    items.push({
      key: "runtime",
      severity: "HIGH",
      title: "Parser-runtime trenger oppfølging",
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
        ? `Siste confidence gate feilet på: ${input.latestConfidence.blockingCheckCodes.join(", ")}.`
        : "Siste confidence gate er markert som FAIL og bør undersøkes nærmere.",
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
      description: "Minst én nylig vurdert rapport ser ut til å ha usikker skala, for eksempel kroner versus tusen kroner. Dette bør kontrolleres før man stoler på tallene.",
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
      description: "Siste sammenligning viser et viktig avvik mellom dagens løsning og den nye løsningen. Sjekk de viktigste regnskapslinjene manuelt.",
      href: `/admin/annual-report-unified-confidence/${input.latestConfidence.filingId}`,
    });
  }

  if (!input.latestGoldSetRun) {
    items.push({
      key: "shadow-missing",
      severity: "INFO",
      title: "Ingen persisted shadow batch er funnet",
      description: "Det finnes foreløpig ingen lagret gold-set shadow batch å sammenligne mot. Go-live-vurderingen blir derfor svakere.",
    });
  } else {
    const ageDays = daysBetween(input.latestGoldSetRun.generatedAt, input.now);
    if (ageDays !== null && ageDays > 7) {
      items.push({
        key: "shadow-stale",
        severity: "MEDIUM",
        title: "Shadow batchen begynner å bli gammel",
        description: `Siste persisted shadow batch er ${ageDays} dager gammel. Vurder ny kjøring før videre go-live-beslutninger.`,
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
    title: "Fra årsrapport til tall i databasen",
    subtitle:
      "Denne flyten viser hvordan systemet mottar en årsrapport, leser innholdet, kontrollerer kvaliteten og lagrer godkjente tall i databasen.",
    nodes: [
      {
        key: "report-received",
        stepNumber: 1,
        title: "Rapport mottas",
        subtitle: "Systemet finner eller mottar en ny årsrapport som skal behandles.",
        status: input.newReportsCount > 0 ? "HEALTHY" : "UNKNOWN",
        tone: input.newReportsCount > 0 ? "GREEN" : "BLUE",
        metric: `${formatCount(input.newReportsCount)} nye rapporter mottatt`,
        typicalStatus:
          "Grønn hvis rapporten er registrert. Gul hvis rapporten mangler nøkkeldata. Rød hvis rapporten ikke kan behandles.",
        unavailableLabel: "Ingen egen side ennå",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "En årsrapport registreres i systemet. Det kan være en ny rapport fra Regnskapsregisteret eller en rapport som allerede finnes i systemet og skal behandles på nytt.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er startpunktet for hele prosessen. Uten en registrert rapport har systemet ingen dokumenter å lese og ingen tall å hente ut.",
          ],
          [
            "Hva kan gå galt?",
            "Rapporten kan mangle, være registrert med feil år, være koblet til feil selskap, eller systemet kan ha flere mulige rapporter for samme selskap og år.",
          ],
          [
            "Hva gjør admin?",
            "Sjekk at rapporten gjelder riktig selskap, riktig organisasjonsnummer og riktig regnskapsår. Hvis rapporten mangler eller er feil, må saken markeres for ny innhenting eller manuell oppfølging.",
          ],
        ]),
      },
      {
        key: "artifact-linking",
        stepNumber: 2,
        title: "Riktig dokument kobles til",
        subtitle: "Systemet finner riktig PDF og tilhørende mellomresultater for akkurat denne rapporten.",
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
          "Grønn hvis riktig dokument er funnet. Gul hvis systemet måtte bruke fallback. Rød hvis dokumentet mangler eller er uklart.",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet kobler rapporten til riktig PDF-fil og relevante lagrede filer, som kvalitetssjekk, strukturert dokument, tidligere uttrekk og sammenligningsresultater.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Systemet må være helt sikker på at det leser riktig dokument. En rapport for feil år eller feil selskap kan gi feil regnskapstall i databasen.",
          ],
          [
            "Hva kan gå galt?",
            "Feil PDF kan bli koblet til rapporten, flere dokumenter kan ligne på hverandre, eller et nødvendig mellomresultat kan mangle.",
          ],
          [
            "Hva gjør admin?",
            "Åpne rapportdetaljene og kontroller at dokumentet gjelder riktig selskap og år. Hvis dokumentet er feil eller mangler, send saken til ny behandling eller marker den som blokkert.",
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
          "Grønn hvis PDF-en er godt lesbar. Gul hvis kvaliteten er usikker. Rød hvis PDF-en ikke kan leses trygt.",
        href: "/admin/pdf-parser-route-quality",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet vurderer dokumentkvalitet, tekstlag, sidetyper, tabeller, skanning/OCR-behov og om rapporten ser komplett ut.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Gode PDF-er kan ofte leses automatisk. Dårlige skannede dokumenter, ødelagte tabeller eller manglende tekstlag krever mer forsiktighet og oftere manuell kontroll.",
          ],
          [
            "Hva kan gå galt?",
            "PDF-en kan være skannet dårlig, ha utydelige tall, mangle tekst, ha roterte sider, ha tabeller som går over flere sider, eller ha layout som gjør tall vanskelige å tolke.",
          ],
          [
            "Hva gjør admin?",
            "Se på kvalitetsscoren og eventuelle blokkeringer. Hvis PDF-en er dårlig, åpne dokumentet manuelt og vurder om saken skal sendes til OCR, reprosessering eller manuell review.",
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
          "Grønn hvis metode er valgt trygt. Gul hvis valget er usikkert. Rød hvis ingen egnet metode er tilgjengelig.",
        href: "/admin/pdf-parser-route-recommendation-v2",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Basert på kvalitetssjekken velger systemet hvilken parser eller metode som passer best. En enkel digital rapport kan leses direkte, mens en vanskelig rapport kan kreve OCR eller mer forsiktig behandling.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Forskjellige rapporter må behandles forskjellig. Riktig lesemetode øker sjansen for at tallene blir hentet ut riktig.",
          ],
          [
            "Hva kan gå galt?",
            "Systemet kan velge en metode som ikke passer dokumentet, eller nødvendig parser/OCR-runtime kan være utilgjengelig.",
          ],
          [
            "Hva gjør admin?",
            "Sjekk hvilken lesemetode systemet valgte og om det finnes varsler. Hvis metoden virker feil, send rapporten til reprosessering eller manuell vurdering.",
          ],
        ]),
      },
      {
        key: "extract-values",
        stepNumber: 5,
        title: "Tall og tekst hentes ut",
        subtitle: "Systemet leser rapporten og forsøker å hente ut regnskapstall, styreberetning og revisorberetning.",
        status:
          input.completedRunsCount > 0
            ? confidenceStatus
            : "UNKNOWN",
        tone: "PURPLE",
        metric:
          input.completedRunsCount > 0
            ? `${formatCount(input.completedRunsCount)} ekstraksjonskjøringer er registrert`
            : "Ingen kjente ekstraksjonskjøringer ennå",
        typicalStatus:
          "Grønn hvis uttrekket er komplett. Gul hvis enkelte linjer er usikre. Rød hvis sentrale regnskapslinjer mangler.",
        href: "/admin/annual-report-unified-confidence",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet henter ut resultatregnskap, balanse, kontantstrøm hvis tilgjengelig, noter der det er relevant, styreberetning og revisorberetning.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er steget der PDF-en begynner å bli til strukturerte data. Kvaliteten på dette uttrekket avgjør hvor godt resten av prosessen fungerer.",
          ],
          [
            "Hva kan gå galt?",
            "Tall kan havne i feil kolonne, negative tall kan tolkes feil, tusenskilletegn kan skape feil, eller systemet kan blande sammen noter og hovedregnskap.",
          ],
          [
            "Hva gjør admin?",
            "Ved varsel eller lav kvalitet: åpne sammenligningen og kontroller de viktigste linjene som driftsinntekter, årsresultat, sum eiendeler, sum egenkapital og sum gjeld.",
          ],
        ]),
        legacyNote:
          "Dagens produksjonsmotor leser rapporten med den etablerte løsningen som fortsatt er trygg kilde for publisering.",
        unifiedNote:
          "Ny ekstraksjonsmotor leser rapporten i bakgrunnen. Den brukes til testing og sammenligning, ikke direkte publisering.",
      },
      {
        key: "compare-results",
        stepNumber: 6,
        title: "Resultatene sammenlignes",
        subtitle: "Systemet sammenligner tallene fra dagens løsning og den nye løsningen.",
        status: comparisonStatus,
        tone: "PURPLE",
        metric:
          comparisonMatchRate === null || comparisonMatchRate === undefined
            ? "Ingen sammenligningsdata funnet"
            : `${Math.round(comparisonMatchRate * 100)} % samsvar i siste tilgjengelige sammenligning`,
        typicalStatus:
          "Grønn hvis tallene matcher. Gul hvis det finnes mindre eller forklarbare avvik. Rød hvis viktige tall er ulike eller mangler.",
        href: "/admin/annual-report-unified-confidence",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet sammenligner linje for linje og år for år. Det ser etter like tall, små avvik, store avvik, manglende linjer og forskjeller i enhetsskala.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Sammenligningen viser om den nye løsningen gir samme resultat som dagens løsning, eller om det finnes avvik som må undersøkes.",
          ],
          [
            "Hva kan gå galt?",
            "Samme regnskapslinje kan ha ulike navn, tall kan være oppgitt i kroner, tusen kroner eller millioner kroner, eller én løsning kan finne en linje som den andre ikke finner.",
          ],
          [
            "Hva gjør admin?",
            "Se etter store avvik og linjer markert som mismatch. Prioriter viktige linjer som inntekter, årsresultat, eiendeler, egenkapital og gjeld.",
          ],
        ]),
      },
      {
        key: "quality-gate",
        stepNumber: 7,
        title: "Systemet vurderer kvaliteten",
        subtitle: "Systemet avgjør om resultatet virker trygt nok, eller om det må undersøkes nærmere.",
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
          "Grønn hvis kvaliteten er god. Gul hvis menneskelig kontroll anbefales. Rød hvis resultatet ikke er trygt.",
        href: "/admin/annual-report-unified-confidence",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet bruker regler og kvalitetssjekker for å vurdere om uttrekket er pålitelig. Det ser blant annet på manglende tall, store avvik, ukjent enhetsskala og usikre dokumentseksjoner.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er sikkerhetskontrollen som hindrer usikre eller feilaktige data fra å gå videre uten menneskelig vurdering.",
          ],
          [
            "Hva kan gå galt?",
            "Systemet kan være for strengt og sende for mye til review, eller for svakt og slippe gjennom noe som burde vært kontrollert.",
          ],
          [
            "Hva gjør admin?",
            "Se på hvorfor saken fikk pass, warning eller fail. Hvis begrunnelsen virker alvorlig, åpne saken i review-køen.",
          ],
        ]),
      },
      {
        key: "manual-review-decision",
        stepNumber: 8,
        title: "Må rapporten kontrolleres manuelt?",
        subtitle: "Systemet avgjør om et menneske må kontrollere rapporten før tallene kan brukes.",
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
            : "Ingen åpne saker i review-køen akkurat nå",
        typicalStatus:
          "Grønn hvis de fleste saker går trygt videre. Gul hvis mange saker krever review. Rød hvis beslutningsgrunnlaget mangler.",
        href: "/admin/annual-report-reviews",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Dette er et beslutningspunkt. Hvis systemet er trygt på resultatet, kan rapporten gå videre. Hvis systemet er usikkert, sendes rapporten til manuell kontroll.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Manuell kontroll er sikkerhetsnettet som gjør at vi kan behandle mange rapporter automatisk uten å slippe gjennom usikre data.",
          ],
          [
            "Hva kan gå galt?",
            "For mange rapporter kan havne i manuell kontroll, eller en usikker rapport kan bli feilklassifisert som trygg.",
          ],
          [
            "Hva gjør admin?",
            "Følg statusen. Hvis saken er sendt til manuell kontroll, åpne review-køen og behandle den der. Hvis mange saker havner her, bør mønsteret brukes til kalibrering og feilretting.",
          ],
        ]),
        decisionPaths: [
          {
            label: "Nei, kvaliteten er god nok",
            description: "Rapporten kan gå videre til lagring.",
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
        metric: `${formatCount(input.reviewQueueCount)} saker i review-køen`,
        typicalStatus:
          "Grønn hvis køen er under kontroll. Gul hvis mange saker venter. Rød hvis høy-alvorlige saker blokkerer videre behandling.",
        href: "/admin/annual-report-reviews",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Reviewer ser på originalrapporten, maskinens forslag, sammenligninger og varsler. Reviewer kan godkjenne, avvise, korrigere eller sende saken til ny behandling.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er stedet der menneskelig dømmekraft brukes for å hindre feil i databasen og samtidig lære hva systemet bør bli bedre på.",
          ],
          [
            "Hva kan gå galt?",
            "Reviewer kan mangle nødvendig dokumentasjon, saken kan være vanskelig å tolke, eller flere feilårsaker kan være blandet sammen.",
          ],
          [
            "Hva gjør admin?",
            "Åpne saken, kontroller de viktigste tallene mot PDF-en, legg inn beslutning og noter hva som var feil eller usikkert.",
          ],
        ]),
      },
      {
        key: "store-approved",
        stepNumber: 10,
        title: "Godkjente tall lagres",
        subtitle: "Når tallene er godkjent, lagres de som strukturerte data i databasen.",
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
          "Grønn hvis tallene er lagret med sporbarhet. Gul hvis noe metadata mangler. Rød hvis lagring feiler.",
        unavailableLabel: "Ingen egen side ennå",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet lagrer godkjente regnskapstall med sporbarhet til rapport, dokument, uttrekk, kvalitetssjekker og eventuell manuell review.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette gjør at tallene kan brukes trygt i produktet, samtidig som vi kan spore hvor de kom fra og hvordan de ble godkjent.",
          ],
          [
            "Hva kan gå galt?",
            "Lagring kan feile, duplikater kan oppstå, eller tall kan mangle nødvendig sporbarhet.",
          ],
          [
            "Hva gjør admin?",
            "Sjekk om saken er markert som lagret og godkjent. Hvis lagring feiler, send saken til teknisk oppfølging eller reprosessering.",
          ],
        ]),
      },
      {
        key: "available-in-product",
        stepNumber: 11,
        title: "Tallene blir tilgjengelige i produktet",
        subtitle: "Godkjente regnskapstall kan brukes i søk, selskapsvisninger, analyser og andre produktflater.",
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
          "Grønn hvis tallene er synlige og brukbare. Gul hvis publisering eller indeksering mangler. Rød hvis dataene ikke vises der de skal.",
        unavailableLabel: "Ingen egen side ennå",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Når dataene er lagret, kan de vises på selskapssider, brukes i søk, filtrering, analyser, rapporter og investeringsrelaterte arbeidsflyter.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette er sluttverdien av hele prosessen: en ustrukturert årsrapport blir til søkbare og analyserbare regnskapstall.",
          ],
          [
            "Hva kan gå galt?",
            "Data kan være lagret, men ikke indeksert, ikke synlig i UI, eller koblet feil til selskapssiden.",
          ],
          [
            "Hva gjør admin?",
            "Kontroller at tallene vises riktig på selskapssiden eller i relevant analyseflate. Hvis tallene ikke vises, sjekk indeksering, kobling og publiseringsstatus.",
          ],
        ]),
      },
    ],
  };
}

function buildGoLiveFlow(input: {
  latestGoldSetRun: AnnualReportGoldSetShadowRun | null;
  reviewQueueCount: number;
  runtime: OpenDataLoaderRuntimeSummary | null;
}): AdminFlowSection {
  const goldSetStatus = deriveGoldSetStatus(input.latestGoldSetRun, new Date());
  const runtimeStatus = deriveRuntimeStatus(input.runtime);
  const canaryMode = DEFAULT_PDF_PARSER_ROUTE_CANARY_CONFIG.mode;

  return {
    title: "Veien mot go-live for ny ekstraksjonsmotor",
    subtitle:
      "Denne flyten viser hvordan vi tester, kontrollerer og gradvis ruller ut den nye ekstraksjonsløsningen på en trygg måte.",
    nodes: [
      {
        key: "gold-set",
        stepNumber: 1,
        title: "Bygg representativt testsett",
        subtitle: "Velg rapporter som dekker de viktigste typene årsrapporter systemet må håndtere.",
        status: input.latestGoldSetRun ? "HEALTHY" : "NOT_STARTED",
        tone: "PURPLE",
        metric: input.latestGoldSetRun ? "Gold-set finnes lokalt" : "Ingen persisted gold-set funnet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Vi lager et gold-set med representative rapporter: enkle digitale rapporter, note-tunge rapporter, skannede rapporter, rapporter med ulike enhetsskalaer og rapporter som forventes å kreve review.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Vi kan ikke vurdere go-live på tilfeldige eller for enkle rapporter. Testsettet må ligne virkeligheten.",
          ],
          [
            "Hva gjør admin?",
            "Sjekk at testsettet dekker nok ulike rapporttyper og at ingen viktige kategorier mangler.",
          ],
        ]),
      },
      {
        key: "shadow-batch",
        stepNumber: 2,
        title: "Kjør shadow batch",
        subtitle: "Den nye løsningen kjøres i bakgrunnen uten å påvirke produksjonsdata.",
        status: goldSetStatus,
        tone: "PURPLE",
        metric: input.latestGoldSetRun
          ? `Siste kjøring: ${formatGoldSetRunStatus(input.latestGoldSetRun)}`
          : "Ingen persisted shadow batch funnet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet kjører gammel og ny ekstraksjonsmotor på de samme rapportene og lagrer resultatene for sammenligning.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette lar oss teste den nye løsningen trygt uten at brukere eller produksjonsdata påvirkes.",
          ],
          [
            "Hva gjør admin?",
            "Sjekk om kjøringen er fullført, hvor mange rapporter som passerte, og hvilke som feilet eller krever review.",
          ],
        ]),
      },
      {
        key: "manual-review-golive",
        stepNumber: 3,
        title: "Gjennomfør manuell kontroll",
        subtitle: "Mennesker kontrollerer usikre eller avvikende resultater.",
        status: input.reviewQueueCount > 0 ? "WARNING" : "HEALTHY",
        tone: "PURPLE",
        metric: `${formatCount(input.reviewQueueCount)} saker i review-køen`,
        href: "/admin/annual-report-reviews",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Reviewere går gjennom rapporter der systemet er usikkert, sammenligner mot PDF-en og registrerer beslutninger.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Manuell kontroll gir fasiten vi trenger for å vite om systemet er trygt nok.",
          ],
          [
            "Hva gjør admin?",
            "Prioriter høyalvorlige saker først og sørg for at review-beslutninger blir registrert tydelig.",
          ],
        ]),
      },
      {
        key: "calibration",
        stepNumber: 4,
        title: "Juster terskler og regler",
        subtitle: "Bruk review-resultatene til å gjøre kvalitetsvurderingene mer presise.",
        status: "NOT_STARTED",
        tone: "BLUE",
        metric: "Ingen egen side ennå",
        unavailableLabel: "Ingen egen side ennå",
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
            "Hva gjør admin?",
            "Se om endringene reduserer unødvendig review uten å øke risikoen for feil.",
          ],
        ]),
      },
      {
        key: "failure-taxonomy",
        stepNumber: 5,
        title: "Klassifiser feiltyper",
        subtitle: "Sorter feilene i tydelige kategorier slik at vi vet hva som må forbedres.",
        status: "UNKNOWN",
        tone: "BLUE",
        metric: "Remediation-flate finnes, men ikke egen årsrapportside",
        href: "/admin/pdf-parser-remediation",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Feil grupperes etter årsak, for eksempel enhetsskala, tabellstruktur, OCR-støy, manglende linjer eller feil seksjonsdeling.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Vi kan ikke fikse alt samtidig. Feilklassifisering viser hvilke problemer som er størst og viktigst.",
          ],
          [
            "Hva gjør admin?",
            "Se hvilke feilklasser som går igjen, og prioriter de som påvirker flest rapporter eller har høyest risiko.",
          ],
        ]),
      },
      {
        key: "fix-errors",
        stepNumber: 6,
        title: "Rett de viktigste feilene",
        subtitle: "Utviklingsteamet fikser de feilene som gir størst utslag i kvaliteten.",
        status: "UNKNOWN",
        tone: "BLUE",
        metric: "Read-only oppfølging via remediation",
        href: "/admin/pdf-parser-remediation",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "De største og mest alvorlige extraction-feilene rettes, for eksempel feil talltolkning, feil linjemapping eller problemer med fler-sidige balanser.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Systemet må forbedres på de feilene som faktisk hindrer trygg produksjonssetting.",
          ],
          [
            "Hva gjør admin?",
            "Kontroller om de samme feiltypene fortsatt dukker opp etter ny kjøring.",
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
        metric: "Ingen egen readiness-side ennå",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Vi samler resultater fra gold-set, shadow batch, review, kalibrering og feilretting i en samlet readiness-rapport.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Go-live skal ikke baseres på magefølelse. Beslutningen må baseres på målbar kvalitet og tydelige blokkeringer.",
          ],
          [
            "Hva gjør admin?",
            "Les readiness-rapporten og sjekk om det finnes åpne go-live-blokkeringer.",
          ],
        ]),
      },
      {
        key: "canary-no-effect",
        stepNumber: 8,
        title: "Kjør canary uten produksjonseffekt",
        subtitle: "Test den nye løsningen i produksjonsmiljø uten at den påvirker publiserte data.",
        status: runtimeStatus === "BLOCKED" ? "WARNING" : "HEALTHY",
        tone: "PURPLE",
        metric: "Read-only canary preview er tilgjengelig",
        href: "/admin/pdf-parser-route-canary-preview",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Den nye løsningen kjøres på en liten andel reelle produksjonstilfeller, men resultatene brukes bare til observasjon og sammenligning.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette viser hvordan systemet oppfører seg i ekte drift før det får påvirke brukerne.",
          ],
          [
            "Hva gjør admin?",
            "Sjekk om canary-kjøringen skaper nye feil, treghet, manglende artifacts eller uventede avvik.",
          ],
        ]),
      },
      {
        key: "feature-flag",
        stepNumber: 9,
        title: "Aktiver routing bak feature flag",
        subtitle: "Ny produksjonsrouting forberedes, men styres av en sikker av/på-bryter.",
        status: canaryMode === "DISABLED" ? "NOT_STARTED" : "WARNING",
        tone: canaryMode === "DISABLED" ? "BLUE" : "PURPLE",
        metric:
          canaryMode === "DISABLED"
            ? "Feature flag er av som trygg standard"
            : `Feature flag står i modus ${canaryMode}`,
        href: "/admin/pdf-parser-route-assignment-preview",
        linkLabel: "Åpne",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Systemet får teknisk støtte for å route enkelte tilfeller til ny løsning, men bare når feature flag tillater det.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Feature flag gjør det mulig å aktivere gradvis og slå raskt av hvis noe går galt.",
          ],
          [
            "Hva gjør admin?",
            "Kontroller at flagget står i riktig modus og at legacy fortsatt er trygg fallback.",
          ],
        ]),
      },
      {
        key: "publish-gate",
        stepNumber: 10,
        title: "Sikre publish gate",
        subtitle: "Kun data som er trygge nok får påvirke produksjonsvisninger.",
        status: "HEALTHY",
        tone: "GREEN",
        metric: "Legacy brukes fortsatt som publish-safe kilde",
        unavailableLabel: "Ingen egen side ennå",
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
            "Hva gjør admin?",
            "Sjekk at usikre resultater blokkeres, og at legacy fortsatt brukes når unified ikke er godkjent.",
          ],
        ]),
      },
      {
        key: "observability",
        stepNumber: 11,
        title: "Overvåkning, varsler og kill switch",
        subtitle: "Systemet overvåkes, og ny routing kan stoppes raskt hvis noe går galt.",
        status: "UNKNOWN",
        tone: "BLUE",
        metric: "Ingen egen side for varsler eller kill switch funnet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Vi følger med på feilrate, review-rate, runtime-problemer, datakvalitet og eventuelle produksjonsavvik.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Go-live er ikke trygt uten observability og en rask måte å stoppe feil på.",
          ],
          [
            "Hva gjør admin?",
            "Følg varsler og stopp utrulling hvis feilrate eller datakvalitet blir dårligere enn akseptabelt.",
          ],
        ]),
      },
      {
        key: "limited-go-live",
        stepNumber: 12,
        title: "Begrenset go-live",
        subtitle: "Den nye løsningen aktiveres for et lite og kontrollert område.",
        status: "NOT_STARTED",
        tone: "BLUE",
        metric: "Ikke aktivert ennå",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Unified extraction kan brukes for en avgrenset gruppe rapporter, selskaper eller dokumenttyper, med tett oppfølging.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Begrenset utrulling reduserer risiko og gir oss mulighet til å oppdage problemer tidlig.",
          ],
          [
            "Hva gjør admin?",
            "Følg nøkkeltall tett og kontroller at review-rate, feilrate og publish gate oppfører seg som forventet.",
          ],
        ]),
      },
      {
        key: "gradual-expansion",
        stepNumber: 13,
        title: "Gradvis utvidelse",
        subtitle: "Dekningen økes når systemet har vist stabil kvalitet over tid.",
        status: "NOT_STARTED",
        tone: "BLUE",
        metric: "Ikke startet",
        unavailableLabel: "Planlagt",
        helpSections: buildHelpSections([
          [
            "Hva skjer her?",
            "Flere rapporttyper og større volum flyttes gradvis over til den nye løsningen etter hvert som kvalitet og drift er dokumentert stabil.",
          ],
          [
            "Hvorfor er dette viktig?",
            "Dette lar oss skalere trygt uten å ta unødvendig produksjonsrisiko.",
          ],
          [
            "Hva gjør admin?",
            "Kontroller at hver utvidelse har god nok kvalitet før neste steg åpnes.",
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

  const [overview, confidenceList, runtime, latestGoldSetRun] = await Promise.all([
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
        ? "Krever oppfølging"
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

  return {
    title: "Admin Control Center",
    subtitle:
      "Kontrollrom for årsrapportflyt, manuell review og trygg utrulling av ny ekstraksjonsmotor.",
    generatedAt: now.toISOString(),
    summaryCards: [
      {
        key: "review-queue",
        title: "Rapporter i review-kø",
        value: formatCount(reviewQueueCount),
        detail:
          reviewQueueCount > 0
            ? "Rapporter som trenger manuell vurdering eller ny behandling."
            : "Ingen åpne reviewsaker akkurat nå.",
        status:
          overview === null
            ? "UNKNOWN"
            : reviewQueueCount > 0
              ? "WARNING"
              : "HEALTHY",
        tone:
          overview === null
            ? "BLUE"
            : reviewQueueCount > 0
              ? "PURPLE"
              : "GREEN",
        href: "/admin/annual-report-reviews",
      },
      {
        key: "new-reports",
        title: "Nye rapporter mottatt",
        value: formatCount(newReportsCount),
        detail:
          overview === null
            ? "Ukjent hvor mange nye rapporter som er registrert."
            : "Rapporter som er oppdaget eller lastet ned, men ikke ferdig behandlet.",
        status: overview === null ? "UNKNOWN" : "HEALTHY",
        tone: overview === null ? "BLUE" : "GREEN",
      },
      {
        key: "approved",
        title: "Godkjente rapporter",
        value: formatCount(approvedCount),
        detail:
          overview === null
            ? "Ingen pålitelig publiseringsstatistikk tilgjengelig."
            : "Rapporter som er publisert eller lagret som godkjente tall.",
        status: overview === null ? "UNKNOWN" : approvedCount > 0 ? "HEALTHY" : "UNKNOWN",
        tone: overview === null ? "BLUE" : approvedCount > 0 ? "GREEN" : "BLUE",
      },
      {
        key: "failed",
        title: "Rapporter med feil",
        value: formatCount(failedCount),
        detail:
          overview === null
            ? "Ukjent hvor mange rapporter som har stoppet med feil."
            : failedCount > 0
              ? "Rapporter som stoppet før trygg lagring eller publisering."
              : "Ingen kjente feilede rapporter i tilgjengelige data.",
        status:
          overview === null
            ? "UNKNOWN"
            : failedCount > 0
              ? "FAILING"
              : "HEALTHY",
        tone:
          overview === null
            ? "BLUE"
            : failedCount > 0
              ? "RED"
              : "GREEN",
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
        key: "go-live-status",
        title: "Go-live status",
        value: goLiveValue,
        detail:
          latestGoldSetRun
            ? "Bygger på siste shadow batch, review-kø og tilgjengelig quality-data."
            : "For lite samlet evidens til å vurdere go-live.",
        status: latestGoldSetRun ? goldSetStatus : "UNKNOWN",
        tone: goLiveTone,
      },
      {
        key: "highest-priority",
        title: "Høyeste prioritet nå",
        value: attentionItems[0]?.title ?? "Ingen åpne problemer",
        detail:
          attentionItems[0]?.description ?? "Ingen åpne problemer funnet basert på tilgjengelige data.",
        status:
          attentionItems[0]?.severity === "HIGH"
            ? "FAILING"
            : attentionItems[0]?.severity === "MEDIUM"
              ? "WARNING"
              : attentionItems[0]?.severity === "LOW"
                ? "WARNING"
                : attentionItems[0]
                  ? "UNKNOWN"
                  : "HEALTHY",
        tone:
          attentionItems[0]?.severity === "HIGH"
            ? "RED"
            : attentionItems[0]?.severity === "MEDIUM"
              ? "YELLOW"
              : attentionItems[0]?.severity === "LOW"
                ? "YELLOW"
                : attentionItems[0]
                  ? "BLUE"
                  : "GREEN",
        href: attentionItems[0]?.href,
      },
      {
        key: "publish-safety",
        title: "Publish safety mode",
        value: "Legacy-only publish",
        detail:
          shadowConfig.mode === "DISABLED"
            ? "Unified shadow-only er av eller ikke aktivert i dette miljøet. Legacy er fortsatt trygg publiseringskilde."
            : "Unified shadow-only er aktiv som evaluering. Legacy er fortsatt trygg publiseringskilde.",
        status: "HEALTHY",
        tone: "GREEN",
      },
    ],
    attentionTitle: "Hva trenger oppmerksomhet nå?",
    attentionItems,
    attentionEmptyState: "Ingen åpne problemer funnet basert på tilgjengelige data.",
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
      reviewQueueCount,
      runtime,
    }),
    onboardingTitle: "Slik bruker du admin-siden",
    onboardingItems: [
      {
        stepNumber: 1,
        text: 'Start med flyten "Fra årsrapport til tall i databasen".',
      },
      {
        stepNumber: 2,
        text: "Se etter gule og røde steg.",
      },
      {
        stepNumber: 3,
        text: "Åpne steget som trenger oppmerksomhet.",
      },
      {
        stepNumber: 4,
        text: 'Følg forklaringen under "Hva gjør admin?".',
      },
      {
        stepNumber: 5,
        text: "Bruk go-live-flyten for å se om den nye ekstraksjonsmotoren er klar for produksjon.",
      },
    ],
    glossaryTitle: "Begreper",
    glossaryItems: [
      {
        term: "Årsrapport",
        definition:
          "Et offisielt regnskapsdokument som inneholder selskapets årsregnskap, noter, styreberetning og ofte revisorberetning.",
      },
      {
        term: "PDF",
        definition:
          "Selve dokumentfilen systemet skal lese. Noen PDF-er er enkle digitale dokumenter, andre er skannede eller vanskelige å tolke.",
      },
      {
        term: "Artifact",
        definition:
          "En lagret fil eller et mellomresultat i prosessen. Det kan være original PDF, kvalitetssjekk, strukturert dokument, uttrekk eller sammenligningsresultat.",
      },
      {
        term: "Legacy",
        definition:
          "Dagens etablerte ekstraksjonsløsning. Den er fortsatt trygg kilde for publisering.",
      },
      {
        term: "Unified",
        definition:
          "Den nye ekstraksjonsløsningen som testes og gradvis skal bli bedre. Den kjøres foreløpig som kontroll/shadow der det er aktuelt.",
      },
      {
        term: "Shadow run",
        definition:
          "En testkjøring der systemet behandler rapporter i bakgrunnen uten å påvirke produksjonsdata.",
      },
      {
        term: "Confidence gate",
        definition:
          "En sikkerhetskontroll som vurderer om resultatet er trygt nok, bør sendes til manuell review eller må blokkeres.",
      },
      {
        term: "Manuell review",
        definition:
          "Menneskelig kontroll av rapporter der systemet er usikkert eller har funnet avvik.",
      },
      {
        term: "Publish gate",
        definition:
          "Siste kontroll før data kan påvirke det brukerne ser i produktet.",
      },
      {
        term: "Feature flag",
        definition:
          "En kontrollert av/på-bryter som lar oss aktivere eller deaktivere ny funksjonalitet trygt.",
      },
      {
        term: "Kill switch",
        definition:
          "En nødmekanisme som raskt kan stoppe ny routing eller ny funksjonalitet hvis noe går galt.",
      },
    ],
    legendTitle: "Statuslegend",
    legendItems: [
      {
        colorLabel: "Grønn",
        tone: "GREEN",
        description: "Alt ser normalt ut. Steget fungerer eller har ingen kjente problemer.",
      },
      {
        colorLabel: "Gul",
        tone: "YELLOW",
        description: "Trenger oppmerksomhet. Steget fungerer, men har saker som bør følges opp.",
      },
      {
        colorLabel: "Rød",
        tone: "RED",
        description: "Feil eller blokkert. Steget har problemer som må løses før prosessen kan fortsette trygt.",
      },
      {
        colorLabel: "Blå/grå",
        tone: "BLUE",
        description: "Ikke startet eller ukjent. Systemet mangler nok data til å vurdere status.",
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
