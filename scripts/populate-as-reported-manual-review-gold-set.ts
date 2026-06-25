import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  serializeValidationPayload,
  validateReviewedFacts,
} from "../server/services/annual-report-reviewed-facts-validation";

const prisma = new PrismaClient({ log: ["warn", "error"] });

const REVIEWER_USER_ID = "cmmsaurk300ecvmm825pota4j";
const EVIDENCE_SOURCE = "PDF_VISUALLY_VERIFIED_AS_REPORTED_GOLD_SET_2026_06_23";
const VISUAL_ROOT = "output/manual-review-visuals";
const ARTIFACT_ROOT = "output/annual-report-artifacts";
const REPORT_PATH = join(VISUAL_ROOT, "as-reported-gold-population-report.json");
const JOTUN_REPORT_PATH = "output/annual-report-as-reported-gold-verification-jotun-2024.json";
const STATKRAFT_2024_FILING_ID = "cmq28bctk002yvmech5ab55oo";
const COOP_2024_FILING_ID = "cmq28bd4j003wvmec2h2ha1mt";
const COOP_2023_FILING_ID = "cmq28bd4z003yvmecsgn9hhcd";
const POSTEN_2023_FILING_ID = "cmq28bdf5004wvmeckncizu3g";
const CLAIRE_2024_FILING_ID = "cmq28bdm6005ovmeccnihc2o9";
const CLAIRE_2023_FILING_ID = "cmq28bdmr005qvmecezqk2wet";
const CLAIRE_2022_FILING_ID = "cmq28bdn4005svmeckojefe3f";
const SANITY_2025_FILING_ID = "cmq28bdyz0063vmec99uck14n";
const PROFF_2023_FILING_ID = "cmobtujr90003vmvorzjg483p";
const PROFF_2021_FILING_ID = "cmobtujrs0007vmvos2b14yat";
const PROFF_2020_FILING_ID = "cmobtujs10009vmvogmdoowt3";
const PROFF_2019_FILING_ID = "cmobtujsb000bvmvoasemqhzr";
const CANICA_2021_FILING_ID = "cmpf7rzra000bvmusjq2317ms";
const MAX_REASONABLE_AMOUNT = 999_999_999_999_999n;

type ManifestEntry = {
  filingId: string;
  orgNumber: string;
  year: number;
  pdf: string;
  targetPages: number[];
  renderedPages: string[];
  contactSheet: string;
};

type JotunReport = {
  reviewId: string;
  filingId: string;
  extractionRunId: string | null;
  companyId: string;
  orgNumber: string;
  companyName: string;
  fiscalYear: number;
  scope: "CONSOLIDATED";
  renderedPages: string[];
  rows: Array<{
    page: number;
    rawLabel: string;
    values: Record<string, number>;
  }>;
  mappingCorrections?: Array<{
    rawLabel: string;
    metricKey: string;
  }>;
};

type ExtractionFact = {
  fiscalYear: number;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "NOTE";
  statementScope?: "COMPANY" | "CONSOLIDATED";
  metricKey: string;
  rawLabel?: string | null;
  normalizedLabel?: string | null;
  value: number | string | null;
  currency?: string | null;
  unitScale?: number | null;
  sourcePage?: number | null;
  sourceSection?: string | null;
  sourceRowText?: string | null;
  noteReference?: string | null;
  confidenceScore?: number | null;
  rawPayload?: Record<string, unknown> | null;
};

type ExtractionRow = {
  pageNumber: number;
  sectionType?: string | null;
  unitScale?: number | null;
  label?: string | null;
  normalizedLabel?: string | null;
  noteReference?: string | null;
  rowText?: string | null;
  y?: number | null;
  confidence?: number | null;
  values?: Array<{
    value: number | string;
    columnIndex: number;
    x?: number;
  }>;
};

type FactInput = {
  fiscalYear: number;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW" | "NOTE";
  statementScope: "COMPANY" | "CONSOLIDATED";
  metricKey: string;
  rawLabel: string;
  value: bigint;
  finalInput: bigint;
  sourcePage: number | null;
  currency: string;
  sourceUnitScale: number;
  visualEvidencePages: string[];
  sourceRowText?: string | null;
  noteReference?: string | null;
  confidenceScore?: number | null;
  rawPayload?: Record<string, unknown> | null;
};

function slug(input: string) {
  return input
    .replace(/[Ææ]/g, "ae")
    .replace(/[Øø]/g, "o")
    .replace(/[Åå]/g, "a")
    .replace(/Ã¦/g, "ae")
    .replace(/Ã¸/g, "o")
    .replace(/Ã¥/g, "a")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function asBigInt(value: number | string | bigint | null | undefined, scale = 1): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  const numeric = typeof value === "bigint" ? value : BigInt(String(value));
  return numeric * BigInt(scale);
}

function statementSection(section?: string | null) {
  return section?.startsWith("STATUTORY_") === true && !section.includes("NOTE");
}

function statementTypeForPageSection(section?: string | null) {
  if (section?.includes("BALANCE")) return "BALANCE_SHEET" as const;
  if (section?.includes("CASH")) return "CASH_FLOW" as const;
  return "INCOME_STATEMENT" as const;
}

function isIncomeStatementLabel(rawLabel: string) {
  const label = searchableLabel(rawLabel);
  return (
    label === "salgsinntekt" ||
    label === "leieinntekter" ||
    label === "annen driftsinntekt" ||
    label === "driftsinntekter" ||
    label === "sum inntekter" ||
    label === "varekostnad" ||
    label === "lonnskostnad" ||
    label === "annen driftskostnad" ||
    label === "sum kostnader" ||
    label === "driftsresultat" ||
    label === "driftoresultat" ||
    label === "drifteresultat" ||
    label === "netto finans" ||
    label === "arsresultat" ||
    label === "sum overforinger og disponeringer" ||
    label === "overforinger til fra annen egenkapital" ||
    label === "konsernbidrag" ||
    label === "ordinart resultat for skattekostnad" ||
    label === "ordinaert resultat for skattekostnad" ||
    label === "ordinart resultat etter skattekostnad" ||
    label === "ordinaert resultat etter skattekostnad" ||
    label === "skattekostnad pa ordinaert resultat" ||
    label === "annen finansinntekt" ||
    label === "sum finansinntekter" ||
    label === "annen finanskostnad" ||
    label === "sum finanskostnader" ||
    label.includes("renteinntekt") ||
    label.includes("rentekostnad") ||
    label.startsWith("avskrivning pa ") ||
    label.startsWith("avskrivning av ") ||
    label.startsWith("nedskrivning av ") ||
    label.startsWith("verdireduksjon ") ||
    label.startsWith("inntekt pa investering ") ||
    label.startsWith("andel av resultat ") ||
    label.startsWith("utbytte ")
  );
}

function statementTypeForRow(section: string | null | undefined, rawLabel: string) {
  if (isIncomeStatementLabel(rawLabel)) return "INCOME_STATEMENT" as const;
  return statementTypeForPageSection(section);
}

function normalizeMetricKey(metricKey: string | null | undefined, rawLabel: string) {
  const clean = metricKey?.trim();
  if (clean) return clean;
  return `as_reported_${slug(rawLabel) || "line"}`;
}

function cleanRawLabel(rawLabel: string) {
  return rawLabel
    .replace(/\bLenn/g, "Lønn")
    .replace(/\blenn/g, "lønn")
    .replace(/^Overferingskostnader$/i, "Overf\u00f8ringskostnader")
    .replace(/^Kontraksforpliktelser$/i, "Kontraktsforpliktelser")
    .replace(
      /^Verdiendring p\u00e5 egenkapitalinstrumenter, etter skatt$/i,
      "Endring i virkelig verdi p\u00e5 egenkapitalinstrumenter, etter skatt",
    )
    .replace(/^Avsatt renter pa andelssinnskudd$/i, "Avsatt renter p\u00e5 andelsinnskudd")
    .replace(/^sun\b/i, "Sum")
    .replace(/^skattekostnad\b/, "Skattekostnad")
    .replace(/^Sum innekutt egenkapital$/i, "Sum innskutt egenkapital")
    .replace(/^Sum korteiktig gjeld$/i, "Sum kortsiktig gjeld")
    .replace(/^Arsresultat\b/, "Årsresultat")
    .replace(/Resultat f\?r/g, "Resultat før")
    .replace(/\?rsresultat/g, "Årsresultat")
    .replace(/oml\?psmidler/g, "omløpsmidler")
    .replace(/Leverand\?rgjeld/g, "Leverandørgjeld")
    .replace(/^sum kostnader\b/, "Sum kostnader")
    .replace(/^rett til bruk-eiendeler\b/, "Rett til bruk-eiendeler")
    .replace(/^immaterielle eiendeler\b/, "Immaterielle eiendeler")
    .replace(/^Immatrielle eiendeler\b/i, "Immaterielle eiendeler")
    .replace(/^Overføringer og disponeringer\s+/i, "")
    .replace(/^disponeringer\s+/i, "")
    .replace(/^Avsatt renter pa andelssinnskudd$/i, "Avsatt renter p\u00e5 andelsinnskudd")
    .replace(/^Sum overferinger\b/i, "Sum overføringer")
    .replace(/^og lignende Bankinnskudd, kontanter og lignende$/i, "Bankinnskudd, kontanter og lignende")
    .replace(/^og lignende Bankinnskudd, kontanter o\.?\s*1\.?$/i, "Bankinnskudd, kontanter o.l")
    .replace(/^Bankinnskudd, kontanter og lignende Bankinnskudd, kontanter o\.?\s*1\.?(?:\s+\d+)?$/i, "Bankinnskudd, kontanter o.l")
    .replace(/^Bankinnskudd, kontanter og lignende Cash and cash equivalents.*$/i, "Bankinnskudd, kontanter og lignende")
    .replace(/^Bankinnskudd, kontanter o\.?1$/i, "Bankinnskudd, kontanter o.l")
    .replace(/^kontanter og lignende$/i, "Bankinnskudd, kontanter og lignende")
    .replace(/^konsern\s+\d+\s+Investeringer i tilknyttet selskap(?:\s+\d+)?$/i, "Investeringer i tilknyttet selskap")
    .replace(/^sikrede ytelser\s+\d+\s+Andre langsiktige fordringer(?:\s+\d+)?$/i, "Andre langsiktige fordringer")
    .replace(/^Varer Sum varer(?:\s+\d{1,2}(?:\s*,\s*\d{1,2})*)?$/i, "Sum varer")
    .replace(/^Varer Inventories$/i, "Inventories")
    .replace(/^samme konsern$/i, "Fordringer på selskap i samme konsern")
    .replace(/^i samme konsern le$/i, "Rentekostnad til foretak i samme konsern")
    .replace(/^Skip, rigger o\.1\s+1\s+Transportmidler(?:\s+\d+)?$/i, "Transportmidler")
    .replace(/^PH\s+Sum investeringer$/i, "Sum investeringer")
    .replace(/^Avskrivning p\u00e5 varige driftsmidler\s+1,\s*\u00a9$/i, "Avskrivning p\u00e5 varige driftsmidler")
    .replace(/^Innskutt egenkapital (Aksjekapital|Selskapskapital)$/i, "$1")
    .replace(/\bfinanskeostnader\b/gi, "finanskostnader")
    .replace(/\bImnskutt\b/g, "Innskutt")
    .replace(/\bomløpemidler\b/gi, "omløpsmidler")
    .replace(/\banleggemidler\b/gi, "anleggsmidler")
    .replace(/\bDriftslesere\b/g, "Driftsløsøre")
    .replace(/\binvesntar\b/gi, "inventar")
    .replace(/\bm\.\s*m\./gi, "m.m.")
    .replace(/^Varer Varer$/i, "Varer")
    .replace(/^Rezultat fer szkattekosztnad$/i, "Resultat før skattekostnad")
    .replace(/\bo\.1\./gi, "o.l.")
    .replace(/\bo\.\s*1\./gi, "o.l.")
    .replace(/\bo\.1\b/gi, "o.l")
    .replace(/^Regultat\b/i, "Resultat")
    .replace(/^Driftøresultat$/i, "Driftsresultat")
    .replace(/^Drifteresultat$/i, "Driftsresultat")
    .replace(/\s+\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*\s*$/g, "")
    .replace(/\s+(?:\d{1,2}|[BIl]|l{1,2}|I{1,2}|l\d?|I\d?)(?:\s*,\s*(?:\d{1,2}|[BIl]|l{1,2}|I{1,2}|l\d?|I\d?))*\s*,?$/i, "")
    .replace(/\s+\d{1,2}$/g, "")
    .replace(/^Innskutt egenkapital (Aksjekapital|Selskapskapital)$/i, "$1")
    .replace(/^(?!Sum\b).*Bankinnskudd, kontanter og lignende$/i, "Bankinnskudd, kontanter og lignende")
    .replace(/^.*Sum immaterielle eiendeler$/i, "Sum immaterielle eiendeler")
    .trim();
}

function searchableLabel(input: string) {
  return input
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalOverrideForLabel(rawLabel: string) {
  const label = rawLabel.toLowerCase();
  const searchable = searchableLabel(rawLabel);
  if (searchable === "ordinaert resultat for skattekostnad") {
    return "as_reported_ordinaert_resultat_for_skattekostnad";
  }
  if (searchable === "andre immaterielle eiendeler komplett") {
    return "as_reported_andre_immaterielle_eiendeler_komplett";
  }
  if (searchable === "nedskrivning av varige driftsmidler og immaterielle eiendeler") {
    return "as_reported_nedskrivning_av_varige_driftsmidler_og_immaterielle_eiendeler";
  }
  if (searchable === "nedskrivning av andre finansielle anleggsmidler") {
    return "as_reported_nedskrivning_av_andre_finansielle_anleggsmidler";
  }
  if (searchable === "sum varer") return "as_reported_sum_varer";
  if (searchable === "sum fordringer") return "as_reported_sum_fordringer";
  if (searchable === "sum immaterielle eiendeler") return "as_reported_sum_immaterielle_eiendeler";
  if (searchable === "sum varige driftsmidler") return "as_reported_sum_varige_driftsmidler";
  if (searchable === "sum innskutt egenkapital") return "as_reported_sum_innskutt_egenkapital";
  if (searchable === "sum opptjent egenkapital") return "as_reported_sum_opptjent_egenkapital";
  if (searchable === "sum finansielle anleggsmidler") return "as_reported_sum_finansielle_anleggsmidler";
  if (searchable === "sum anleggsmidler") return "as_reported_sum_anleggsmidler";
  if (searchable === "sum bankinnskudd kontanter og lignende") {
    return "as_reported_sum_bankinnskudd_kontanter_og_lignende";
  }
  if (searchable === "arsresultat etter minoritetsinteresser") {
    return "as_reported_arsresultat_etter_minoritetsinteresser";
  }
  if (searchable === "minoritetsinteresser") return "as_reported_minoritetsinteresser";
  if (searchable === "avsatt til annen egenkapital") return "as_reported_avsatt_til_annen_egenkapital";
  if (searchable === "overfort fra annen egenkapital") return "as_reported_overfort_fra_annen_egenkapital";
  if (searchable.includes("resultat for skattekostnad")) return "profit_before_tax";
  if (searchable === "ordinaert resultat etter skattekostnad") {
    return "as_reported_ordinaert_resultat_etter_skattekostnad";
  }
  if (searchable === "bankinnskudd kontanter og lignende") return "cash_and_cash_equivalents";
  if (searchable === "bankinnskudd kontanter o l") return "cash_and_cash_equivalents";
  if (searchable === "likvide midler") return "cash_and_cash_equivalents";
  if (searchable === "andre langsiktige fordringer") return "other_non_current_receivables";
  if (searchable === "pensjonsmidler") return "pension_assets";
  if (searchable === "driftsresultat") return "operating_profit";
  if (searchable === "drifteresultat") return "operating_profit";
  if (searchable === "kundefordringer mot konsern") {
    return "group_trade_receivables";
  }
  if (searchable.startsWith("avskrivning pa ") || searchable.startsWith("avskrivning av ")) {
    return "depreciation_amortization";
  }
  if (searchable === "investeringer i tilknyttet selskap") {
    return "investments_in_associated_companies_and_subsidiaries";
  }
  if (label.startsWith("sum finansinntekter")) return "total_financial_income";
  if (label.startsWith("sum finanskostnader")) return "total_financial_expense";
  if (label === "totalresultat" || label === "årets totalresultat") {
    return `as_reported_${slug(rawLabel) || "totalresultat"}`;
  }
  if (label.startsWith("lønnskostnad")) return "payroll_expense";
  if (label.startsWith("lønnskostnader")) return "payroll_expense";
  return null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function manualReitanFacts(): FactInput[] {
  const scope = "CONSOLIDATED" as const;
  const currency = "NOK";
  const sourceUnitScale = 1_000_000;
  const years = [2024, 2023] as const;
  const rows: Array<{
    page: number;
    type: "INCOME_STATEMENT" | "BALANCE_SHEET";
    key: string;
    label: string;
    values: [number, number];
  }> = [
    { page: 23, type: "INCOME_STATEMENT", key: "total_operating_income", label: "Driftsinntekter", values: [111274, 106069] },
    { page: 23, type: "INCOME_STATEMENT", key: "other_operating_income", label: "Andre inntekter", values: [883, 645] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_verdiendring_investeringseiendom", label: "Verdiendring investeringseiendom", values: [355, -2029] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_resultat_fra_tilknyttede_selskap_og_felleskontrollerte_virksomheter", label: "Resultat fra tilknyttede selskap og felleskontrollerte virksomheter", values: [294, -166] },
    { page: 23, type: "INCOME_STATEMENT", key: "cost_of_goods_sold", label: "Varekostnad", values: [-88346, -85105] },
    { page: 23, type: "INCOME_STATEMENT", key: "payroll_expense", label: "Lønnskostnad", values: [-5763, -5399] },
    { page: 23, type: "INCOME_STATEMENT", key: "other_operating_expense", label: "Andre driftskostnader", values: [-8064, -7200] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_ebitda", label: "Driftsresultat før amort., av- og nedskr. (EBITDA)", values: [10633, 6815] },
    { page: 23, type: "INCOME_STATEMENT", key: "depreciation_amortization", label: "Amortiseringer og nedskrivninger immaterielle eiendeler", values: [-285, -271] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_av_og_nedskrivninger_varige_driftsmidler", label: "Av- og nedskrivninger varige driftsmidler", values: [-1923, -2067] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_av_og_nedskrivninger_bruksretteiendeler", label: "Av- og nedskrivninger bruksretteiendeler", values: [-3320, -3142] },
    { page: 23, type: "INCOME_STATEMENT", key: "operating_profit", label: "Driftsresultat", values: [5105, 1335] },
    { page: 23, type: "INCOME_STATEMENT", key: "financial_income", label: "Renteinntekter", values: [180, 131] },
    { page: 23, type: "INCOME_STATEMENT", key: "financial_expense", label: "Rentekostnad leieforpliktelser", values: [-841, -749] },
    { page: 23, type: "INCOME_STATEMENT", key: "financial_expense", label: "Andre rentekostnader", values: [-1702, -1249] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_gevinster_tap_finansielle_investeringer", label: "Gevinst (tap) finansielle investeringer", values: [1411, 1174] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_netto_andre_finansposter", label: "Netto andre finansposter", values: [283, -83] },
    { page: 23, type: "INCOME_STATEMENT", key: "net_financial_items", label: "Netto finansposter", values: [-669, -776] },
    { page: 23, type: "INCOME_STATEMENT", key: "profit_before_tax", label: "Resultat før skattekostnad", values: [4436, 559] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_skattekostnad", label: "Skattekostnad", values: [-543, -36] },
    { page: 23, type: "INCOME_STATEMENT", key: "net_income", label: "Årets resultat", values: [3893, 523] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_remaling_av_pensjonsforpliktelse", label: "Remåling av pensjonsforpliktelse", values: [-10, -7] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_andel_utvidet_resultat_i_tilknyttede_selskap_ikke_omklassifiseres", label: "Andel utvidet resultat i tilknyttede selskap", values: [-10, 7] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_poster_som_ikke_kan_bli_omklassifisert_til_resultatet", label: "Poster som ikke kan bli omklassifisert til resultatet", values: [-20, 0] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_andel_utvidet_resultat_i_tilknyttede_selskap_kan_omklassifiseres", label: "Andel utvidet resultat i tilknyttede selskap", values: [10, 9] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_kontantstromsikring", label: "Kontantstrømsikring", values: [-6, -15] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_omregningsdifferanser", label: "Omregningsdifferanser", values: [374, 464] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_poster_som_kan_bli_omklassifisert_til_resultatet", label: "Poster som kan bli omklassifisert til resultatet", values: [378, 458] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_utvidet_resultat_etter_skatt", label: "Utvidet resultat etter skatt", values: [358, 458] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_arets_totalresultat", label: "Årets totalresultat", values: [4251, 981] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_aksjonaerene_i_morselskapet_resultat", label: "Aksjonærene i morselskapet", values: [3418, 1360] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_ikke_kontrollerende_eierinteresser_resultat", label: "Ikke-kontrollerende eierinteresser", values: [475, -837] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_sum_tilordnet_resultat", label: "Sum tilordnet resultat", values: [3893, 523] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_aksjonaerene_i_morselskapet_totalresultat", label: "Aksjonærene i morselskapet", values: [3757, 1779] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_ikke_kontrollerende_eierinteresser_totalresultat", label: "Ikke-kontrollerende eierinteresser", values: [494, -798] },
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_sum_tilordnet_totalresultat", label: "Sum tilordnet totalresultat", values: [4251, 981] },
    { page: 24, type: "BALANCE_SHEET", key: "deferred_tax_asset", label: "Utsatt skattefordel", values: [886, 716] },
    { page: 24, type: "BALANCE_SHEET", key: "intangible_assets", label: "Immaterielle eiendeler", values: [5969, 5817] },
    { page: 24, type: "BALANCE_SHEET", key: "investment_property", label: "Investeringseiendom", values: [29956, 20764] },
    { page: 24, type: "BALANCE_SHEET", key: "property_plant_equipment", label: "Varige driftsmidler", values: [25343, 23245] },
    { page: 24, type: "BALANCE_SHEET", key: "right_of_use_assets", label: "Bruksretteiendeler", values: [20782, 18942] },
    { page: 24, type: "BALANCE_SHEET", key: "as_reported_investeringer_i_tilknyttede_selskap_og_felleskontrollerte_virksomheter", label: "Investeringer i tilknyttede selskap og felleskontrollerte virksomheter", values: [4251, 3174] },
    { page: 24, type: "BALANCE_SHEET", key: "financial_investments", label: "Finansielle investeringer", values: [546, 410] },
    { page: 24, type: "BALANCE_SHEET", key: "pension_assets", label: "Pensjonsmidler", values: [2, 2] },
    { page: 24, type: "BALANCE_SHEET", key: "derivatives", label: "Derivater", values: [608, 388] },
    { page: 24, type: "BALANCE_SHEET", key: "receivables", label: "Fordringer", values: [842, 760] },
    { page: 24, type: "BALANCE_SHEET", key: "fixed_assets", label: "Sum anleggsmidler", values: [89185, 74218] },
    { page: 24, type: "BALANCE_SHEET", key: "inventory", label: "Varer", values: [5137, 5156] },
    { page: 24, type: "BALANCE_SHEET", key: "receivables", label: "Kundefordringer og andre fordringer", values: [11611, 11099] },
    { page: 24, type: "BALANCE_SHEET", key: "financial_investments", label: "Finansielle investeringer", values: [7530, 8488] },
    { page: 24, type: "BALANCE_SHEET", key: "derivatives", label: "Derivater", values: [16, 12] },
    { page: 24, type: "BALANCE_SHEET", key: "cash_and_cash_equivalents", label: "Bankinnskudd og kontanter", values: [1424, 2710] },
    { page: 24, type: "BALANCE_SHEET", key: "restricted_cash", label: "Bundne bankinnskudd", values: [101, 130] },
    { page: 24, type: "BALANCE_SHEET", key: "current_assets", label: "Sum omløpsmidler", values: [25819, 27595] },
    { page: 24, type: "BALANCE_SHEET", key: "total_assets", label: "Sum eiendeler", values: [115004, 101813] },
    { page: 25, type: "BALANCE_SHEET", key: "share_capital_share_premium", label: "Aksjekapital og overkurs", values: [6273, 6273] },
    { page: 25, type: "BALANCE_SHEET", key: "as_reported_annen_egenkapital_ikke_resultatfort", label: "Annen egenkapital ikke resultatført", values: [2382, 2023] },
    { page: 25, type: "BALANCE_SHEET", key: "retained_earnings", label: "Opptjent egenkapital", values: [27843, 25416] },
    { page: 25, type: "BALANCE_SHEET", key: "as_reported_egenkapital_tilordnet_morselskapets_aksjonaerer", label: "Egenkapital tilordnet morselskapets aksjonærer", values: [36498, 33712] },
    { page: 25, type: "BALANCE_SHEET", key: "non_controlling_interests", label: "Ikke-kontrollerende eierinteresser", values: [7657, 6830] },
    { page: 25, type: "BALANCE_SHEET", key: "total_equity", label: "Sum egenkapital", values: [44155, 40542] },
    { page: 25, type: "BALANCE_SHEET", key: "deferred_tax_liability", label: "Utsatt skatt", values: [2358, 1834] },
    { page: 25, type: "BALANCE_SHEET", key: "pension_liabilities", label: "Pensjonsforpliktelser", values: [76, 80] },
    { page: 25, type: "BALANCE_SHEET", key: "provisions", label: "Andre avsetninger for forpliktelser", values: [795, 698] },
    { page: 25, type: "BALANCE_SHEET", key: "long_term_debt", label: "Lån", values: [22082, 17496] },
    { page: 25, type: "BALANCE_SHEET", key: "lease_liabilities", label: "Leieforpliktelser", values: [18083, 16394] },
    { page: 25, type: "BALANCE_SHEET", key: "derivatives", label: "Derivater", values: [10, 72] },
    { page: 25, type: "BALANCE_SHEET", key: "other_liabilities", label: "Annen gjeld", values: [19, 27] },
    { page: 25, type: "BALANCE_SHEET", key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [43423, 36601] },
    { page: 25, type: "BALANCE_SHEET", key: "provisions", label: "Andre avsetninger for forpliktelser", values: [120, 106] },
    { page: 25, type: "BALANCE_SHEET", key: "tax_payable", label: "Betalbar skatt", values: [253, 279] },
    { page: 25, type: "BALANCE_SHEET", key: "short_term_debt", label: "Lån", values: [8569, 6093] },
    { page: 25, type: "BALANCE_SHEET", key: "lease_liabilities", label: "Leieforpliktelser", values: [3932, 3735] },
    { page: 25, type: "BALANCE_SHEET", key: "derivatives", label: "Derivater", values: [0, 16] },
    { page: 25, type: "BALANCE_SHEET", key: "accounts_payable_other_current_liabilities", label: "Leverandørgjeld og annen gjeld", values: [14552, 14441] },
    { page: 25, type: "BALANCE_SHEET", key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [27426, 24670] },
    { page: 25, type: "BALANCE_SHEET", key: "total_liabilities", label: "Sum gjeld", values: [70849, 61271] },
    { page: 25, type: "BALANCE_SHEET", key: "total_equity_and_liabilities", label: "Sum egenkapital og gjeld", values: [115004, 101813] },
  ];

  return rows.flatMap((row) =>
    row.values.map((value, index) => ({
      fiscalYear: years[index],
      statementType: row.type,
      statementScope: scope,
      metricKey: row.key,
      rawLabel: row.label,
      value: asBigInt(value, sourceUnitScale),
      finalInput: asBigInt(value, sourceUnitScale),
      sourcePage: row.page,
      currency,
      sourceUnitScale,
      visualEvidencePages: [
        `${VISUAL_ROOT}/cmq28bcjn0024vmecn1ob6usc/page-${row.page}.png`,
      ],
      sourceRowText: row.label,
      rawPayload: { sourceUnit: "Beløp i NOK mill.", columnYear: years[index] },
    })),
  );
}

function trailingNoteReference(rawLabel: string) {
  return rawLabel.match(/\s+(\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*)\s*$/)?.[1]?.replace(/\s+/g, "") ?? null;
}

function cleanJotunRawLabel(rawLabel: string) {
  if (/^Bankinnskudd, kontanter og lignende Cash and cash equivalents/i.test(rawLabel)) {
    return "Cash and cash equivalents";
  }
  if (/^Varer Inventories/i.test(rawLabel)) {
    return "Inventories";
  }
  return cleanRawLabel(rawLabel);
}

function jotunMetricKeyForLabel(rawLabel: string, cleanLabel: string) {
  const correctionLabel = cleanRawLabel(rawLabel);
  const override = canonicalOverrideForLabel(cleanLabel);
  if (override) return override;

  const label = searchableLabel(cleanLabel);
  if (label === "operating revenue") return "revenue";
  if (label === "share of profit from associates and joint ventures") {
    return "as_reported_share_of_profit_from_associates_and_joint_ventures";
  }
  if (label === "sum inntekter") return "total_revenue";
  if (label === "cost of goods sold") return "cost_of_goods_sold";
  if (label === "payroll expenses") return "payroll_expense";
  if (label === "depreciation amortisation and impairment") return "depreciation_amortization";
  if (label === "other operating expenses") return "other_operating_expense";
  if (label === "sum kostnader") return "total_operating_expenses";
  if (label === "driftsresultat") return "operating_profit";
  if (label === "net financial items") return "as_reported_net_financial_items_positive_line";
  if (label === "sum finanskostnader") return "total_financial_expense";
  if (label === "netto finans") return "net_financial_items";
  if (label === "resultat for skattekostnad") return "profit_before_tax";
  if (label === "income tax expense") return "tax_expense";
  if (label === "arsresultat") return "net_income";
  if (label === "other comprehensive income to be reclassified to profit or loss in subsequent periods") {
    return "as_reported_other_comprehensive_income_reclassified_to_profit_or_loss";
  }
  if (label === "sum resultatkomponenter for ifrs foretak") {
    return "as_reported_sum_resultatkomponenter_for_ifrs_foretak";
  }
  if (label === "totalresultat") return "as_reported_totalresultat";
  if (label === "other intangible assets") return "as_reported_other_intangible_assets";
  if (label === "utsatt skattefordel") return "deferred_tax_asset";
  if (label === "property plant and equipment") return "tangible_assets";
  if (label === "investeringer i tilknyttet selskap") return "as_reported_investments_in_associates";
  if (label === "investeringer i aksjer og andeler") return "as_reported_investments_in_shares";
  if (label === "other non current financial receivables") return "as_reported_other_non_current_financial_receivables";
  if (label === "inventories") return "inventory";
  if (label === "trade and other receivables") return "trade_receivables";
  if (label === "cash and cash equivalents") return "cash_and_cash_equivalents";
  if (label === "sum omlopsmidler") return "current_assets";
  if (label === "sum eiendeler") return "total_assets";
  if (label === "share capital") return "share_capital";
  if (label === "other equity") return "retained_earnings";
  if (label === "sum egenkapital") return "total_equity";
  if (label === "pensjonsforpliktelser") return "as_reported_pension_obligations";
  if (label === "utsatt skatt") return "as_reported_deferred_tax_liability";
  if (label === "provisions") return "as_reported_provisions";
  if (label === "sum avsetninger for forpliktelser") return "total_provisions";
  if (label === "interest bearing debt" && /5\.10/.test(rawLabel)) {
    return "as_reported_interest_bearing_debt_non_current";
  }
  if (label === "interest bearing debt") return "as_reported_interest_bearing_debt_current";
  if (label === "other non current liabilities") return "as_reported_other_non_current_liabilities";
  if (label === "sum annen langsiktig gjeld") return "total_non_current_liabilities_excl_provisions";
  if (label === "sum langsiktig gjeld") return "long_term_liabilities";
  if (label === "leverandorgjeld") return "trade_payables";
  if (label === "tax payable") return "tax_payable";
  if (label === "other current liabilities") return "other_current_liabilities";
  if (label === "sum kortsiktig gjeld") return "current_liabilities";
  if (label === "sum gjeld") return "total_liabilities";
  if (label === "sum egenkapital og gjeld") return "total_equity_and_liabilities";
  return `as_reported_${slug(correctionLabel) || "jotun_line"}`;
}

function manualJotunFacts(report: JotunReport): FactInput[] {
  return report.rows.flatMap((row) => {
    const rawLabel = cleanJotunRawLabel(row.rawLabel);
    const metricKey = jotunMetricKeyForLabel(row.rawLabel, rawLabel);
    const noteReference = trailingNoteReference(row.rawLabel);
    const pageImage = report.renderedPages.find((path) => path.includes(`page-${row.page}`)) ?? report.renderedPages[0] ?? "";
    return Object.entries(row.values).map(([year, value]) => ({
      fiscalYear: Number(year),
      statementType: row.page === 5 ? "INCOME_STATEMENT" as const : "BALANCE_SHEET" as const,
      statementScope: "CONSOLIDATED" as const,
      metricKey,
      rawLabel,
      value: BigInt(value),
      finalInput: BigInt(value),
      sourcePage: row.page,
      currency: "NOK",
      sourceUnitScale: 1,
      visualEvidencePages: pageImage ? [pageImage] : [],
      sourceRowText: `${rawLabel} ${Object.values(row.values).join(" ")}`,
      noteReference,
      confidenceScore: null,
      rawPayload: {
        rawValue: String(value),
        valueSource: "visualJotunReport",
        sourceUnit: "NOK",
        sourceRawLabel: row.rawLabel,
      },
    }));
  });
}

function lookupKey(input: {
  row: ExtractionRow;
  mappedFacts: ExtractionFact[];
  rawLabel: string;
}) {
  const override = canonicalOverrideForLabel(input.rawLabel);
  if (override) return override;

  const normalized = input.row.normalizedLabel?.trim();
  const pageFacts = input.mappedFacts.filter(
    (fact) =>
      fact.sourcePage === input.row.pageNumber &&
      (fact.normalizedLabel === normalized || fact.rawLabel === input.rawLabel),
  );
  const first = pageFacts[0];
  const mappedKey = normalizeMetricKey(first?.metricKey, input.rawLabel);
  const subtotalLike = new Set([
    "total_operating_income",
    "total_revenue",
    "total_operating_expenses",
    "total_financial_income",
    "total_financial_expense",
    "fixed_assets",
    "current_assets",
    "total_assets",
    "total_equity",
    "long_term_liabilities",
    "current_liabilities",
    "total_liabilities",
    "total_equity_and_liabilities",
  ]);
  const label = input.rawLabel.toLowerCase();
  const isSubtotalLabel =
    label.startsWith("sum ") ||
    label.startsWith("total ") ||
    label === "driftsresultat" ||
    label === "årsresultat" ||
    label.includes("resultat før") ||
    label.includes("netto finans");
  if (subtotalLike.has(mappedKey) && !isSubtotalLabel) {
    return `as_reported_${slug(input.rawLabel) || "line"}`;
  }
  return mappedKey;
}

function lookupScope(input: { row: ExtractionRow; mappedFacts: ExtractionFact[] }) {
  const pageFacts = input.mappedFacts.filter((fact) => fact.sourcePage === input.row.pageNumber);
  const counts = new Map<"COMPANY" | "CONSOLIDATED", number>();
  for (const fact of pageFacts) {
    const scope = fact.statementScope ?? "COMPANY";
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "COMPANY";
}

function lookupRawLabel(input: {
  row: ExtractionRow;
  mappedFacts: ExtractionFact[];
}) {
  const normalized = input.row.normalizedLabel?.trim();
  return (
    input.mappedFacts.find(
      (fact) =>
        fact.sourcePage === input.row.pageNumber &&
        (fact.normalizedLabel === normalized || fact.sourceRowText === input.row.rowText) &&
        fact.rawLabel,
    )?.rawLabel ??
    input.row.label ??
    input.row.normalizedLabel ??
    ""
  ).trim();
}

function valuesWithoutNoteColumn(row: ExtractionRow) {
  const values = [...(row.values ?? [])].sort((a, b) => a.columnIndex - b.columnIndex);
  if (values.length > 2) {
    const first = Number(values[0]?.value);
    if (Number.isFinite(first) && Math.abs(first) <= 99) {
      return values.slice(1, 3);
    }
    return [];
  }
  if (values.length === 2) {
    const first = Number(values[0]?.value);
    const second = Number(values[1]?.value);
    if (
      Number.isFinite(first) &&
      Number.isFinite(second) &&
      first > 0 &&
      Math.abs(first) <= 99 &&
      Math.abs(second) >= 1000
    ) {
      return values.slice(1);
    }
  }
  return values.slice(0, 2);
}

function numericToken(token: string) {
  const normalized =
    /\d/.test(token) && /^[\dBbIl().,-]+$/.test(token)
      ? token.replace(/[Bb]/g, "8").replace(/[Il]/g, "1")
      : token;
  const cleaned = normalized.replace(/[^\d()-]/g, "");
  if (!cleaned) return null;
  const negative = cleaned.startsWith("-") || (cleaned.startsWith("(") && cleaned.endsWith(")"));
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!digits) return null;
  return { digits, negative, hasSeparator: /[,.]/.test(normalized) };
}

function bigintFromRaw(value: number | string | bigint | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "bigint" ? value : BigInt(String(value));
}

function chooseAmountCandidate(input: { withoutLead: bigint; withLead?: bigint; reference?: bigint }) {
  if (input.withLead === undefined || input.reference === undefined || input.reference === 0n) {
    return input.withLead ?? input.withoutLead;
  }
  const referenceAbs = input.reference < 0n ? -input.reference : input.reference;
  const withoutAbs = input.withoutLead < 0n ? -input.withoutLead : input.withoutLead;
  const withAbs = input.withLead < 0n ? -input.withLead : input.withLead;
  const withoutDistance = withoutAbs > referenceAbs ? withoutAbs - referenceAbs : referenceAbs - withoutAbs;
  const withDistance = withAbs > referenceAbs ? withAbs - referenceAbs : referenceAbs - withAbs;
  return withDistance < withoutDistance ? input.withLead : input.withoutLead;
}

function consumeAmountEndingAt(tokens: string[], index: number, reference?: bigint) {
  const last = numericToken(tokens[index]);
  if (!last) return null;

  const groups: string[] = [last.digits.padStart(last.digits.length === 0 ? 1 : last.digits.length, "0")];
  let negative = last.negative;
  let cursor = index - 1;

  while (cursor >= 0) {
    const part = numericToken(tokens[cursor]);
    if (!part || !/^\d{3}$/.test(part.digits)) break;
    groups.unshift(part.digits);
    negative = negative || part.negative;
    cursor -= 1;
  }

  let nextIndex = cursor;
  const withoutLead = BigInt(groups.join(""));
  let withLead: bigint | undefined;
  if (groups.length > 1 && cursor >= 0) {
    const lead = numericToken(tokens[cursor]);
    if (lead && /^\d{1,3}$/.test(lead.digits)) {
      withLead = BigInt(`${lead.digits}${groups.join("")}`);
      if (chooseAmountCandidate({ withoutLead, withLead, reference }) === withLead) {
        groups.unshift(lead.digits);
        negative = negative || lead.negative;
        nextIndex = cursor - 1;
      }
    }
  }

  const value = BigInt(groups.join(""));
  return {
    value: negative ? -value : value,
    nextIndex,
  };
}

function groupedDigits(value: bigint) {
  const digits = String(value < 0n ? -value : value);
  const groups: string[] = [];
  let cursor = digits.length;
  while (cursor > 3) {
    groups.unshift(digits.slice(cursor - 3, cursor));
    cursor -= 3;
  }
  groups.unshift(digits.slice(0, cursor));
  return groups;
}

function findAmountSequence(tokens: string[], value: bigint) {
  const sequence = groupedDigits(value);
  const digits = tokens.map((token) => numericToken(token)?.digits ?? null);
  for (let end = digits.length - 1; end >= 0; end -= 1) {
    if (digits[end] === null) continue;
    const start = end - sequence.length + 1;
    if (start < 0) continue;
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (digits[start + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return { start, end };
  }
  return null;
}

function previousNumericTokenIndex(tokens: string[], beforeIndex: number) {
  for (let index = beforeIndex; index >= 0; index -= 1) {
    if (numericToken(tokens[index])) return index;
  }
  return null;
}

type RowNumberToken = {
  digits: string;
  negative: boolean;
  hasSeparator: boolean;
};

function amountFromTokenSlice(tokens: RowNumberToken[]) {
  if (tokens.length === 0) return null;
  if (tokens.some((token) => token.hasSeparator)) return null;
  if (tokens.length === 1) {
    const value = BigInt(tokens[0].digits);
    if (value > MAX_REASONABLE_AMOUNT) return null;
    return tokens[0].negative ? -value : value;
  }
  if (!/^\d{1,6}$/.test(tokens[0].digits)) return null;
  if (!tokens.slice(1).every((token) => /^\d{3}$/.test(token.digits))) return null;
  const value = BigInt(tokens.map((token) => token.digits).join(""));
  if (value > MAX_REASONABLE_AMOUNT) return null;
  return tokens[0].negative ? -value : value;
}

function amountAbs(value: bigint) {
  return value < 0n ? -value : value;
}

function canExtendLeftIntoGroupedAmount(tokens: RowNumberToken[], start: number, end: number) {
  if (start <= 0) return false;
  const current = amountFromTokenSlice(tokens.slice(start, end));
  const extended = amountFromTokenSlice(tokens.slice(start - 1, end));
  return current !== null && extended !== null && amountAbs(extended) > amountAbs(current) * 10n;
}

function plausibilityDistance(left: bigint, right: bigint) {
  const leftNumber = Number(amountAbs(left));
  const rightNumber = Number(amountAbs(right));
  if (leftNumber === 0 || rightNumber === 0) return 3;
  return Math.abs(Math.log10(leftNumber / rightNumber));
}

function sameValuePair(left: [bigint, bigint], right: bigint[]) {
  return right.length >= 2 && left[0] === right[0] && left[1] === right[1];
}

function numericReferences(structuredValues: ReturnType<typeof valuesWithoutNoteColumn>) {
  return structuredValues
    .map((value) => bigintFromRaw(value.value))
    .filter((value): value is bigint => value !== null);
}

function exactSingleReferenceFromRowText(
  rowText: string,
  structuredValues: ReturnType<typeof valuesWithoutNoteColumn>,
) {
  if (structuredValues.length !== 1) return null;
  const reference = bigintFromRaw(structuredValues[0]?.value);
  if (reference === null || amountAbs(reference) < 1000n) return null;
  const numericTokens = rowText
    .trim()
    .split(/\s+/)
    .map((token) => numericToken(token))
    .filter((token): token is RowNumberToken => token !== null);
  for (let start = 0; start < numericTokens.length; start += 1) {
    for (let end = start + 1; end <= numericTokens.length; end += 1) {
      const value = amountFromTokenSlice(numericTokens.slice(start, end));
      if (value === reference) {
        return {
          value,
          columnIndex: structuredValues[0].columnIndex ?? 0,
          source: "rowText" as const,
        };
      }
    }
  }
  return null;
}

function valuesFromNumericSuffix(rowText: string, references: bigint[] = []) {
  const numericTokens = rowText
    .trim()
    .split(/\s+/)
    .map((token) => numericToken(token))
    .filter((token): token is RowNumberToken => token !== null);
  if (numericTokens.length === 0) return [];

  let bestPair: { values: [bigint, bigint]; score: number } | null = null;
  for (let secondStart = 1; secondStart < numericTokens.length; secondStart += 1) {
    const second = amountFromTokenSlice(numericTokens.slice(secondStart));
    if (second === null) continue;
    for (let firstStart = 0; firstStart < secondStart; firstStart += 1) {
      const first = amountFromTokenSlice(numericTokens.slice(firstStart, secondStart));
      if (first === null) continue;
      if (amountAbs(first) < 1000n && amountAbs(second) < 1000n) continue;
      if (canExtendLeftIntoGroupedAmount(numericTokens, firstStart, secondStart)) continue;
      if (
        (amountAbs(first) > 0n && amountAbs(first) < 1000n) ||
        (amountAbs(second) > 0n && amountAbs(second) < 1000n)
      ) {
        continue;
      }
      const values: [bigint, bigint] = [first, second];
      const distance = plausibilityDistance(first, second);
      if (distance > 4) continue;
      const exactReferencePair = sameValuePair(values, references);
      const exactTailReferencePair =
        references.length > 2 && sameValuePair(values, references.slice(-2));
      const referenceMatches = references.filter((reference) => values.includes(reference)).length;
      const score =
        (exactReferencePair ? 10000 : 0) +
        (exactTailReferencePair ? 9000 : 0) +
        referenceMatches * 100 -
        firstStart * 25 -
        distance;
      if (!bestPair || score > bestPair.score) {
        bestPair = { values, score };
      }
    }
  }
  if (bestPair && (bestPair.score > -18 || references.length >= 2)) {
    if (amountAbs(bestPair.values[0]) > 0n && amountAbs(bestPair.values[0]) <= 99n) {
      return [
        {
          value: bestPair.values[1],
          columnIndex: 1,
          source: "rowText" as const,
        },
      ];
    }
    return bestPair.values.map((value, index) => ({
      value,
      columnIndex: index,
      source: "rowText" as const,
    }));
  }

  let bestSingle: { value: bigint; score: bigint } | null = null;
  for (let start = 0; start < numericTokens.length; start += 1) {
    const value = amountFromTokenSlice(numericTokens.slice(start));
    if (value === null) continue;
    const score = amountAbs(value);
    if (!bestSingle || score > bestSingle.score) {
      bestSingle = { value, score };
    }
  }
  if (bestSingle && amountAbs(bestSingle.value) >= 1000n) {
    return [{ value: bestSingle.value, columnIndex: 0, source: "rowText" as const }];
  }
  return [];
}

function valuesFromRowText(row: ExtractionRow, structuredValues: ReturnType<typeof valuesWithoutNoteColumn>) {
  if (!row.rowText?.trim()) return [];
  const exactSingleReference = exactSingleReferenceFromRowText(row.rowText, structuredValues);
  if (exactSingleReference) return [exactSingleReference];
  const suffixValues = valuesFromNumericSuffix(row.rowText, numericReferences(structuredValues));
  if (suffixValues.length > 0) return suffixValues;

  const tokens = row.rowText.trim().split(/\s+/);
  const lastStructured = structuredValues.at(-1);
  const lastValue = bigintFromRaw(lastStructured?.value);
  if (lastValue === null) return [];

  const lastMatch = findAmountSequence(tokens, lastValue);
  if (!lastMatch) return [];

  const previousIndex = previousNumericTokenIndex(tokens, lastMatch.start - 1);
  if (previousIndex === null) {
    if (amountAbs(lastValue) < 1000n) return [];
    return [{ value: lastValue, columnIndex: 0, source: "rowText" as const }];
  }

  const current = consumeAmountEndingAt(tokens, previousIndex, lastValue);
  if (!current) {
    return [{ value: lastValue, columnIndex: 0, source: "rowText" as const }];
  }
  const currentAbs = current.value < 0n ? -current.value : current.value;
  const lastAbs = amountAbs(lastValue);
  if (currentAbs < 1000n && lastAbs < 1000n) return [];
  if (structuredValues.length === 1 && currentAbs < 1000n) {
    return [{ value: lastValue, columnIndex: 0, source: "rowText" as const }];
  }

  return [
    { value: current.value, columnIndex: 0, source: "rowText" as const },
    { value: lastValue, columnIndex: 1, source: "rowText" as const },
  ];
}

function reportedValuesForRow(row: ExtractionRow) {
  const structuredValues = valuesWithoutNoteColumn(row);
  const textValues = valuesFromRowText(row, structuredValues);
  if (textValues.length > 0) return textValues;
  const likelyOnlyNotes = structuredValues.every((value) => {
    const numeric = bigintFromRaw(value.value);
    return numeric !== null && amountAbs(numeric) > 0n && amountAbs(numeric) <= 99n;
  });
  if (likelyOnlyNotes) return [];
  return structuredValues.map((value, index) => ({
    value: value.value,
    columnIndex: value.columnIndex ?? index,
    source: "structuredValues" as const,
  }));
}

function sameReportedRowValues(left: ExtractionRow, right: ExtractionRow) {
  const leftValues = reportedValuesForRow(left).map((value) => asBigInt(value.value));
  const rightValues = reportedValuesForRow(right).map((value) => asBigInt(value.value));
  return (
    leftValues.length > 0 &&
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function nearbyStatementRow(input: {
  rows: ExtractionRow[];
  row: ExtractionRow;
  direction: -1 | 1;
}) {
  const pageRows = input.rows.filter(
    (candidate) =>
      candidate.pageNumber === input.row.pageNumber &&
      candidate.sectionType === input.row.sectionType,
  );
  const index = pageRows.indexOf(input.row);
  if (index === -1) return null;
  for (
    let cursor = index + input.direction;
    cursor >= 0 && cursor < pageRows.length;
    cursor += input.direction
  ) {
    const candidate = pageRows[cursor];
    if (candidate.label?.trim() || candidate.rowText?.trim()) return candidate;
  }
  return null;
}

function repairWrappedRawLabel(input: {
  rawLabel: string;
  row: ExtractionRow;
  rows: ExtractionRow[];
}) {
  const label = searchableLabel(input.rawLabel);
  const rowText = input.row.rowText ?? "";
  if (label === "verdiendring av markedsbasgerte finansielle omlopsmidler") {
    return "Verdiendring av markedsbaserte finansielle omløpsmidler";
  }
  if (label === "tilknyttet selskap") {
    return input.row.pageNumber === 2 || input.row.pageNumber === 6
      ? "Inntekt på investering i tilknyttet selskap"
      : "Investeringer i tilknyttet selskap";
  }
  if (label === "kontrollert virksomhet") {
    return "Lån til tilknyttet selskap og felles kontrollert virksomhet";
  }
  if (
    label === "bankinnskudd kontanter og lignende" &&
    /^kontanter og lignende\s+141\s+380\s+224\s+174\s+169\s+051/.test(rowText)
  ) {
    return "Sum bankinnskudd, kontanter og lignende";
  }
  if ((label === "konsern" || label === "konsern b") && /konsern B\s+663\s+318\s+368\s+364\s+857\s+526/.test(rowText)) {
    return "L\u00e5n til foretak i samme konsern";
  }
  if (
    label === "minoritetsinteresser" &&
    /^minoritetsinteresser\s+(?:-314\s+190\s+607\s+658\s+760\s+950|5\s+859\s+878\s+1\s+288\s+544\s+839|650\s+629\s+604\s+355\s+389\s+803)/.test(rowText)
  ) {
    return "\u00c5rsresultat etter minoritetsinteresser";
  }
  if (
    label === "ordinaert resultat etter skattekostnad" &&
    /^skattekostnad\s+658\s+760\s+950\s+697\s+155\s+552/.test(rowText)
  ) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (
    label === "nedskrivning av andre finansielle anleggsmidler" &&
    /^finansielle anleggsmidler\s+701\s+839\s+134/.test(rowText)
  ) {
    return "Nedskrivning av finansielle anleggsmidler";
  }
  if (label === "konsern" && /konsern\s+15\s+1\s+475\s+000\s+000\s+888\s+000\s+000/.test(rowText)) {
    return "Fordringer p\u00e5 selskap i samme konsern";
  }
  if (label === "konsern" && /konsern\s+15\s+888\s+000\s+000\s+564\s+000\s+000/.test(rowText)) {
    return "Fordringer p\u00e5 selskap i samme konsern";
  }
  if (label === "eiendeler" && /eiendeler\s+9\s+(?:529|553|552|630)\s+000\s+000\s+(?:552|630|575|701)\s+000\s+000/.test(rowText)) {
    return "Andre immaterielle eiendeler";
  }
  if (label === "fordringer" && /fordringer\s+9\s+151\s+993\s+395\s+309\s+089\s+431/.test(rowText)) {
    return "Andre kortsiktige fordringer";
  }
  if (label === "fordringer" && /fordringer\s+9\s+91\s+033\s+280\s+201\s+219\s+647/.test(rowText)) {
    return "Andre langsiktige fordringer";
  }
  if (label === "andeler") return "Investeringer i aksjer og andeler";
  if (label === "anleggsmidler") return "Sum finansielle anleggsmidler";
  if (label === "forpliktelser") return "Sum avsetninger for forpliktelser";
  if (label === "kredittinstitusjoner") return "Gjeld til kredittinstitusjoner";
  if (
    label === "i samme konsern" &&
    /i samme konsern\s+3\s+10\s+716\s+864\s+1\s+287\s+121/.test(rowText)
  ) {
    return "Rentekostnad til foretak i samme konsern";
  }
  if (
    label === "i samme konsern" &&
    /i samme konsern\s+3\s+2\s+046\s+102\s+1\s+082\s+759/.test(rowText)
  ) {
    return "Rentekostnad til foretak i samme konsern";
  }
  if (
    label === "i samme konsern" &&
    /i samme konsern\s+13\s+118\s+000\s+000\s+72\s+000\s+000/.test(rowText)
  ) {
    return "Renteinntekt fra foretak i samme konsern";
  }
  if (
    label === "i samme konsern" &&
    /i samme konsern\s+72\s+000\s+000\s+38\s+000\s+000/.test(rowText)
  ) {
    return "Renteinntekt fra foretak i samme konsern";
  }
  if (
    label === "i samme konsern" &&
    /i samme konsern\s+13\s+39\s+000\s+000\s+105\s+000\s+000/.test(rowText)
  ) {
    return "Rentekostnad til foretak i samme konsern";
  }
  if (
    label === "i samme konsern" &&
    /i samme konsern\s+105\s+000\s+000\s+48\s+000\s+000/.test(rowText)
  ) {
    return "Rentekostnad til foretak i samme konsern";
  }
  if (label === "i samme konsern" && /i samme konsern\s+4\s+292\s+382/.test(rowText)) {
    return "Renteinntekt fra foretak i samme konsern";
  }
  if (
    (label === "i samme konsern" || label === "i samme konsern 1") &&
    /i samme konsern\s+1\s+4\s+077\s+381\s+2\s+600\s+574/.test(rowText)
  ) {
    return "Rentekostnad til foretak i samme konsern";
  }
  if (label === "datterselskap" && /datterselskap\s+45\s+750\s+228\s+36\s+761\s+311/.test(rowText)) {
    return "Inntekt p\u00e5 investering i datterselskap";
  }
  if (label === "datterselskap" && /datterselskap\s+54\s+000/.test(rowText)) {
    return "Inntekt p\u00e5 investering i datterselskap";
  }
  if (label === "i samme konsern" && /i samme konsern\s+10\s+454\s+785\s+6\s+843\s+755/.test(rowText)) {
    return "Renteinntekt fra foretak i samme konsern";
  }
  if (label === "software komplett 1 goodwill" && /^Goodwill\s+1\s+/i.test(rowText)) {
    return "Goodwill";
  }
  if (label === "eiendeler komplett") return "Andre immaterielle eiendeler Komplett";
  if (/^tomter m m \d+ bygninger$/.test(label)) return "Bygninger";
  if (label === "a utstyr") return "Driftsløsøre, inventar o.a. utstyr";
  if (label === "resultat" && /^resultat\s+6\b/i.test(rowText)) {
    return "Skattekostnad på ordinært resultat";
  }
  if (label === "disponeringer") return "Sum overføringer og disponeringer";
  if (label === "markedsbaserte omlopsmidler") {
    return "Verdireduksjon markedsbaserte omløpsmidler";
  }
  if (label === "finansielle anleggsmidler") {
    return "Nedskrivning av andre finansielle anleggsmidler";
  }
  if (
    label === "immaterielle eiendeler" &&
    /immaterielle eiendeler\s+1\s+151\s+616\s+151\s+194\s+027\s+588/.test(rowText)
  ) {
    return "Avskrivning av driftsmidler og immaterielle eiendeler";
  }
  if (
    label === "immaterielle eiendeler" &&
    /immaterielle eiendeler\s+1\s+201\s+514\s+061\s+287\s+048\s+278/.test(rowText)
  ) {
    return "Avskrivning av driftsmidler og immaterielle eiendeler";
  }
  if (
    label === "immaterielle eiendeler" &&
    /immaterielle eiendeler\s+1\s+134\s+149\s+254\s+17\s+648\s+730/.test(rowText)
  ) {
    return "Nedskrivning av varige driftsmidler og immaterielle eiendeler";
  }
  if (
    label === "immaterielle eiendeler" &&
    /immaterielle eiendeler\s+1\s+13\s+347\s+602\s+108\s+957\s+734/.test(rowText)
  ) {
    return "Nedskrivning av varige driftsmidler og immaterielle eiendeler";
  }
  if (
    label === "immaterielle eiendeler" &&
    /immaterielle eiendeler\s+8\s+469\s+678\s+17\s+648\s+730/.test(rowText)
  ) {
    return "Nedskrivning av varige driftsmidler og immaterielle eiendeler";
  }
  if (label === "finansielle eiendeler") return "Nedskrivning av finansielle eiendeler";
  if (label === "finansielle anleggsmidler pensjonsmidler") return "Pensjonsmidler";
  if (label === "annen langsiktig gjeld obligasjonslan") return "Obligasjonslån";
  if (label === "skip rigger o 1 1 transportmidler") return "Transportmidler";
  if (
    label === "resultatandel i selskaper innregnet" &&
    /innregnet\s+15,\s*26\s+3\s+444\s+000\s+000\s+531\s+000\s+000/i.test(rowText)
  ) {
    return "Resultatandel i selskaper innregnet etter egenkapitalmetoden";
  }
  if (
    label === "innregnet etter egenkapitalmetoden" &&
    /egenkapitalmetoden\s+-302\s+000\s+000\s+88\s+000\s+000/i.test(rowText)
  ) {
    return "F\u00f8ringer mot utvidet resultat i selskaper innregnet etter egenkapitalmetoden";
  }
  if (
    label === "resultat i selskaper innregnet etter egenkapitalmetoden" ||
    label === "innregnet etter egenkapitalmetoden"
  ) {
    return "Andel av resultat i selskaper innregnet etter egenkapitalmetoden";
  }
  if (
    label === "annen langsiktig gjeld langsiktig gjeld l4" ||
    /^Langsiktig gjeld\s+l4\s+661\s+687\s+000\s+622\s+795\s+000/i.test(rowText)
  ) {
    return "Langsiktig gjeld";
  }
  if (label === "pa egenkapitalinstrumenter etter skatt") {
    return "Endring i virkelig verdi på egenkapitalinstrumenter, etter skatt";
  }
  if (label === "knyttet til utenlandsk virksomhet avhendet i lopet av aret") {
    return "Omregningsdifferanser knyttet til utenlandsk virksomhet avhendet i løpet av året";
  }
  if (label === "driftsmidler") return "Avskrivning på varige driftsmidler";
  if (
    label === "skattekostnad" &&
    /^skattekostnad\s+-23\s+124\s+481\s+l?\s*406\s+696\s+288/i.test(rowText)
  ) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+697\s+155\s+552\s+392\s+330\s+831/i.test(rowText)) {
    return (input.row.y ?? 0) < 3400
      ? "Ordin\u00e6rt resultat f\u00f8r skattekostnad"
      : "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+664\s+663\s+642\s+356\s+782\s+407/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+658\s+785\s+905\s+355\s+801\s+643/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (
    label === "skattekostnad" &&
    input.row.pageNumber === 2 &&
    /^skattekostnad\s+-314\s+190\s+607\s+658\s+760\s+950/i.test(rowText)
  ) {
    return (input.row.y ?? 0) < 3650
      ? "Ordin\u00e6rt resultat f\u00f8r skattekostnad"
      : "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (
    label === "skattekostnad" &&
    /^skattekostnad\s+984\s+077\s+1\s+351\s+394\s+508/i.test(rowText)
  ) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+10\s+461\s+000\s+000\s+11\s+098\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+9\s+334\s+000\s+000\s+10\s+963\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+50\s+983\s+000\s+000\s+58\s+820\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+26\s+056\s+000\s+000\s+28\s+592\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+887\s+000\s+000\s+-501\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+852\s+000\s+000\s+-512\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+233\s+000\s+000\s+-539\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+183\s+000\s+000\s+-375\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+314\s+000\s+000\s+-343\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+177\s+000\s+000\s+-277\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+85\s+696\s+221\s+762/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+65\s+995\s+173\s+702/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+221\s+762\s+962\s+932/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+173\s+702\s+748\s+508/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (/^skattekostnad\s+316\s+000\s+000\s+-402\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat f\u00f8r skattekostnad";
  }
  if (/^skattekostnad\s+228\s+000\s+000\s+-451\s+000\s+000/i.test(rowText)) {
    return "Ordin\u00e6rt resultat etter skattekostnad";
  }
  if (label === "rentefri kortsiktig gjeld l") {
    return "Rentefri kortsiktig gjeld";
  }
  if (label === "beholdning av egne aksjer 5 overkurs") {
    return "Overkurs";
  }
  if (label === "opptijent egenkapital annen egenkapital") {
    return "Annen egenkapital";
  }
  if (label === "annen langsiktig gjeld gjeld til kredittinstitusjoner") {
    return "Gjeld til kredittinstitusjoner";
  }
  if (label === "immaterielle eiendeler" && /immaterielle eiendeler\s+12\s+800/.test(rowText)) {
    return "Avskrivning av driftsmidler og immaterielle eiendeler";
  }
  if (label === "immaterielle eiendeler" && /immaterielle eiendeler\s+3\s+12\s+800\s+3\s+200/.test(rowText)) {
    return "Avskrivning av driftsmidler og immaterielle eiendeler";
  }
  if (label === "minoritetsinteresser" && /minoritetsinteresser\s+65\s+995\s+173\s+702/.test(rowText)) {
    return "\u00c5rsresultat etter minoritetsinteresser";
  }
  if (label === "minoritetsinteresser" && /minoritetsinteresser\s+173\s+702\s+748\s+508/.test(rowText)) {
    return "\u00c5rsresultat etter minoritetsinteresser";
  }
  if (label === "egenkapital" && /^egenkapital\s+173\s+702/.test(rowText)) {
    return "Avsatt til annen egenkapital";
  }
  if (label === "egenkapital" && /^egenkapital\s+-334\s+005/.test(rowText)) {
    return "Overf\u00f8rt fra annen egenkapital";
  }
  if (label === "fordringer" && /fordringer\s+6\s+116\s+322\s+230\s+094/.test(rowText)) {
    return "Andre kortsiktige fordringer";
  }
  if (label === "a utstyr 3 l" && /a\. utstyr\s+3\s+l\s+683\s+957\s+2\s+053\s+594/.test(rowText)) {
    return "Driftsl\u00f8s\u00f8re, inventar o. a. utstyr";
  }
  if ((label === "konsern" || label === "konsern 1") && /konsern\s+1\s+76\s+184\s+513/.test(rowText)) {
    return "L\u00e5n til foretak i samme konsern";
  }
  if (/^minoritetsinteresser\s+697\s+155\s+552\s+392\s+330\s+831/i.test(rowText)) {
    return "\u00c5rsresultat etter minoritetsinteresser";
  }
  if (/^minoritetsinteresser\s+650\s+629\s+604\s+355\s+389\s+803/i.test(rowText)) {
    return "\u00c5rsresultat etter minoritetsinteresser";
  }
  if (/^egenkapital\s+333\s+730\s+938\s+56\s+996\s+055/i.test(rowText)) {
    return "Avsatt til annen egenkapital";
  }
  if (/^egenkapital\s+23\s+199\s+142/i.test(rowText)) {
    return "Overf\u00f8rt fra annen egenkapital";
  }
  if (label !== "skattekostnad") return input.rawLabel;

  const next = nearbyStatementRow({ rows: input.rows, row: input.row, direction: 1 });
  const previous = nearbyStatementRow({ rows: input.rows, row: input.row, direction: -1 });
  const nextLabel = searchableLabel(next?.label ?? "");
  const previousLabel = searchableLabel(previous?.label ?? "");

  if (nextLabel.startsWith("skattekostnad pa ordinaert resultat")) {
    return "Ordinært resultat før skattekostnad";
  }
  if (
    previousLabel.startsWith("skattekostnad pa ordinaert resultat") ||
    (nextLabel.includes("arsresultat") && next && sameReportedRowValues(input.row, next))
  ) {
    return "Ordinært resultat etter skattekostnad";
  }
  return input.rawLabel;
}

function rowTextContainsLabelText(rowText: string | null | undefined) {
  return /[A-Za-zÆØÅæøå]/.test(rowText ?? "");
}

function isFragmentOnlyLabel(rawLabel: string) {
  const label = searchableLabel(rawLabel);
  if (label.startsWith("organisasjon")) return true;
  if (label === "minoritetsinteresser") return false;
  return new Set([
    "i samme konsern",
    "konsern",
    "eiendeler",
    "fordringer",
    "egenkapital",
    "minoritetsinteresser",
    "datterselskap",
    "driftsinntekter og driftskostnader note",
  ]).has(label);
}

function repairReportedValues(input: {
  filingId: string;
  rawLabel: string;
  row: ExtractionRow;
  rows: ExtractionRow[];
  values: ReturnType<typeof reportedValuesForRow>;
}) {
  const label = searchableLabel(input.rawLabel);
  const rowText = input.row.rowText ?? "";
  if (/datterselskap\s+54\s+000/.test(rowText)) {
    return [
      {
        value: 54_000n,
        columnIndex: input.filingId === CLAIRE_2023_FILING_ID ? 1 : 0,
        source: "rowText" as const,
      },
    ];
  }
  if (
    input.filingId === CANICA_2021_FILING_ID &&
    /finansielle anleggsmidler\s+3\s+802\s+898/.test(rowText)
  ) {
    return [{ value: 802_898n, columnIndex: 1, source: "rowText" as const }];
  }
  const exactRowTextRepair = [
    {
      pattern: /Salgsinntekter\s+4,12\s+83\s+522\s+000\s+000\s+102\s+657\s+000\s+000/,
      values: [83_522_000_000n, 102_657_000_000n],
    },
    {
      pattern: /Annen finansinntekt\s+189\s+1\s+515/,
      values: [189n, 1_515n],
    },
    {
      pattern: /sun finansinntekter\s+911\s+1\s+549/,
      values: [911n, 1_549n],
    },
    {
      pattern: /Aksjekapital\s+5\s+100\s+000\s+100\s+000/,
      values: [100_000n, 100_000n],
    },
    {
      pattern: /Annen egenkapital\s+6\s+-477\s+855\s+-160\s+303/,
      values: [-477_855n, -160_303n],
    },
    {
      pattern: /Lonnskostnad\s+2\s+1299491/,
      values: [1_299_491n],
    },
    {
      pattern: /i samme konsern\s+4\s+292\s+382/,
      values: [4_292_382n],
    },
    {
      pattern: /i samme konsern\s+1\s+4\s+077\s+381\s+2\s+600\s+574/,
      values: [4_077_381n, 2_600_574n],
    },
    {
      pattern: /Annen finanskostnad\s+54\s+594\s+205/,
      values: [54n, 594_205n],
    },
    {
      pattern: /a\. utstyr\s+3\s+l\s+683\s+957\s+2\s+053\s+594/,
      values: [1_683_957n, 2_053_594n],
    },
    {
      pattern: /konsern\s+1\s+76\s+184\s+513/,
      values: [76_184_513n],
    },
    {
      pattern: /immaterielle eiendeler\s+12\s+800/,
      values: [null, 12_800n],
    },
    {
      pattern: /immaterielle eiendeler\s+3\s+12\s+800\s+3\s+200/,
      values: [12_800n, 3_200n],
    },
    {
      pattern: /^Annen renteinntekt\s+2$/,
      values: [2n],
    },
    {
      pattern: /Annen renteinntekt\s+34\s+2/,
      values: [34n, 2n],
    },
    {
      pattern: /skattekostnad\s+221\s+762\s+962\s+932/,
      values: [221_762n, 962_932n],
    },
    {
      pattern: /skattekostnad\s+173\s+702\s+748\s+508/,
      values: [173_702n, 748_508n],
    },
    {
      pattern: /skattekostnad\s+85\s+696\s+221\s+762/,
      values: [85_696n, 221_762n],
    },
    {
      pattern: /skattekostnad\s+65\s+995\s+173\s+702/,
      values: [65_995n, 173_702n],
    },
    {
      pattern: /^egenkapital\s+173\s+702$/,
      values: [null, 173_702n],
    },
    {
      pattern: /^egenkapital\s+-334\s+005$/,
      values: [-334_005n],
    },
    {
      pattern: /fordringer\s+5\s+137\s+562\s+116\s+322/,
      values: [137_562n, 116_322n],
    },
    {
      pattern: /Kundefordringer\s+6\s+10\s+684\s+0/,
      values: [10_684n, 0n],
    },
    {
      pattern: /Kundefordringer\s+6\s+10\s+684$/,
      values: [10_684n],
    },
    {
      pattern: /fordringer\s+6\s+116\s+322\s+230\s+094/,
      values: [116_322n, 230_094n],
    },
    {
      pattern: /Andre kortsiktige fordringer\s+6\s+116\s+322\s+230094/,
      values: [116_322n, 230_094n],
    },
    {
      pattern: /Sum fordringer\s+5\s+627\s+234\s+354\s+518/,
      values: [627_234n, 354_518n],
    },
    {
      pattern: /Sum fordringer\s+6\s+354\s+518\s+230\s+094/,
      values: [354_518n, 230_094n],
    },
    {
      pattern: /Sum fordringer\s+6\s+354\s+518\s+230094/,
      values: [354_518n, 230_094n],
    },
    {
      pattern: /Bankinnskudd, kontanter o\.l\.\s+6\s+930\s+859\s+1233475/,
      values: [930_859n, 1_233_475n],
    },
    {
      pattern: /Bankinnskudd, kontanter o\.l\.\s+7\s+1233475\s+1951920/,
      values: [1_233_475n, 1_951_920n],
    },
    {
      pattern: /\(kostnader\)\s+5\s+237\s+000\s+000\s+438\s+000\s+000/,
      values: [237_000_000n, 438_000_000n],
    },
    {
      pattern: /Finansinntekter\s+7\s+346\s+000\s+000\s+334\s+000\s+000/,
      values: [346_000_000n, 334_000_000n],
    },
    {
      pattern: /immaterielle eiendeler\s+9,\s*10,\s*18\s+139\s+000\s+000\s+185\s+000\s+000/,
      values: [139_000_000n, 185_000_000n],
    },
    {
      pattern: /immaterielle eiendeler\s+8,9,17\s+5\s+000\s+000\s+4\s+000\s+000/,
      values: [5_000_000n, 4_000_000n],
    },
    {
      pattern: /Avskrivninger\s+10,18\s+1\s+600\s+000\s+000\s+1\s+384\s+000\s+000/,
      values: [1_600_000_000n, 1_384_000_000n],
    },
    {
      pattern: /Varige driftsmidler\s+9,10\s+7\s+071\s+000\s+000\s+6\s+498\s+000\s+000/,
      values: [7_071_000_000n, 6_498_000_000n],
    },
    {
      pattern: /andeler\s+11,13\s+222\s+000\s+000\s+251\s+000\s+000/,
      values: [222_000_000n, 251_000_000n],
    },
    {
      pattern: /fordringe\s+13,15,18\s+54\s+000\s+000\s+73\s+000\s+000/,
      values: [54_000_000n, 73_000_000n],
    },
    {
      pattern: /anleggsmidler\s+13,21\s+27\s+000\s+000\s+23\s+000\s+000/,
      values: [27_000_000n, 23_000_000n],
    },
    {
      pattern: /fordringer\s+13,16,21\s+4\s+137\s+000\s+000\s+3\s+895\s+000\s+000/,
      values: [4_137_000_000n, 3_895_000_000n],
    },
    {
      pattern: /fordringer\s+13,15,18\s+95\s+000\s+000\s+116\s+000\s+000/,
      values: [95_000_000n, 116_000_000n],
    },
    {
      pattern: /Likvide midler\s+13,17\s+1\s+947\s+000\s+000\s+2\s+684\s+000\s+000/,
      values: [1_947_000_000n, 2_684_000_000n],
    },
    {
      pattern: /forpliktelser\s+l2\s+969\s+000\s+000\s+936\s+000\s+000/,
      values: [969_000_000n, 936_000_000n],
    },
    {
      pattern: /leieforpliktelser\s+13,18\s+3\s+140\s+000\s+000\s+2\s+837\s+000\s+000/,
      values: [3_140_000_000n, 2_837_000_000n],
    },
    {
      pattern: /gjeld\s+13,19\s+3\s+500\s+000\s+000\s+1\s+111\s+000\s+000/,
      values: [3_500_000_000n, 1_111_000_000n],
    },
    {
      pattern: /Rentefri langsiktig gjeld\s+13,20,21\s+28\s+000\s+000\s+29\s+000\s+000/,
      values: [28_000_000n, 29_000_000n],
    },
    {
      pattern: /leieforpliktelser\s+13,18\s+892\s+000\s+000\s+743\s+000\s+000/,
      values: [892_000_000n, 743_000_000n],
    },
    {
      pattern: /gjeld\s+13,19\s+586\s+000\s+000\s+3\s+187\s+000\s+000/,
      values: [586_000_000n, 3_187_000_000n],
    },
    {
      pattern: /Rentefri kortsiktig gjeld\s+l12,13,20,\s+4\s+553\s+000\s+000\s+4\s+523\s+000\s+000/,
      values: [4_553_000_000n, 4_523_000_000n],
    },
    {
      pattern: /markedsaktiviteter\s+13,21\s+9\s+408\s+000\s+000\s+18\s+196\s+000\s+000/,
      values: [9_408_000_000n, 18_196_000_000n],
    },
    {
      pattern: /Lennskostnader\s+16,17\s+9\s+508\s+000\s+000\s+7\s+991\s+000\s+000/,
      values: [9_508_000_000n, 7_991_000_000n],
    },
    {
      pattern: /Avskrivninger\s+23,24,25\s+6\s+923\s+000\s+000\s+5\s+392\s+000\s+000/,
      values: [6_923_000_000n, 5_392_000_000n],
    },
    {
      pattern: /immaterielle eiendeler\s+15,23,24\s+5\s+247\s+000\s+000\s+-2\s+355\s+000\s+000/,
      values: [5_247_000_000n, -2_355_000_000n],
    },
    {
      pattern: /egenkapitalmetoden\s+15,26\s+1\s+443\s+000\s+000\s+3\s+444\s+000\s+000/,
      values: [1_443_000_000n, 3_444_000_000n],
    },
    {
      pattern: /l\u00f8pet av \u00e5ret\s+5\s+-87\s+000\s+000\s+-56\s+000\s+000/,
      values: [-87_000_000n, -56_000_000n],
    },
    {
      pattern: /egenkapitalmetoden\s+26\s+338\s+000\s+000\s+115\s+000\s+000/,
      values: [338_000_000n, 115_000_000n],
    },
    {
      pattern: /etter skatt\s+17\s+556\s+000\s+000\s+-215\s+000\s+000/,
      values: [556_000_000n, -215_000_000n],
    },
    {
      pattern: /Leieforpliktelser\s+25,33\s+2\s+577\s+000\s+000\s+2\s+234\s+000\s+000/,
      values: [2_577_000_000n, 2_234_000_000n],
    },
    {
      pattern: /Kontraksforpliktelser\s+32\s+3\s+160\s+000\s+000\s+3\s+421\s+000\s+000/,
      values: [3_160_000_000n, 3_421_000_000n],
    },
    {
      pattern: /Leieforpliktelser\s+25,33\s+568\s+000\s+000\s+504\s+000\s+000/,
      values: [568_000_000n, 504_000_000n],
    },
    {
      pattern: /Kontraktsforpliktelser\s+32\s+316\s+000\s+000\s+316\s+000\s+000/,
      values: [316_000_000n, 316_000_000n],
    },
    {
      pattern: /Avskrivninger\s+11,\s*12\s+161\s+000\s+000\s+144\s+000\s+000/,
      values: [161_000_000n, 144_000_000n],
    },
    {
      pattern: /urealisert verdipapirer\s+9,\s*26\s+623\s+000\s+000\s+-388\s+000\s+000/,
      values: [623_000_000n, -388_000_000n],
    },
    {
      pattern: /Andre driftskostnader\s+8,\s*24,\s*25\s+2\s+984\s+000\s+000\s+2\s+251\s+000\s+000/,
      values: [2_984_000_000n, 2_251_000_000n],
    },
    {
      pattern: /Avskrivninger\s+11,\s*12\s+174\s+000\s+000\s+161\s+000\s+000/,
      values: [174_000_000n, 161_000_000n],
    },
    {
      pattern: /datterselskap\s+9,\s*26\s+19\s+907\s+000\s+000\s+15\s+777\s+000\s+000/,
      values: [19_907_000_000n, 15_777_000_000n],
    },
    {
      pattern: /Finansinntekter\s+9,\s*26\s+2\s+693\s+000\s+000\s+2\s+701\s+000\s+000/,
      values: [2_693_000_000n, 2_701_000_000n],
    },
    {
      pattern: /urealisert verdipapir\s+9,\s*26\s+-1\s+265\s+000\s+000\s+623\s+000\s+000/,
      values: [-1_265_000_000n, 623_000_000n],
    },
    {
      pattern: /Finanskostnader\s+9,\s*26\s+4\s+464\s+000\s+000\s+3\s+495\s+000\s+000/,
      values: [4_464_000_000n, 3_495_000_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+10\s+257\s+000\s+000\s+14\s+000\s+000/,
      values: [257_000_000n, 14_000_000n],
    },
    {
      pattern: /Varige driftsmidler\s+12\s+607\s+000\s+000\s+679\s+000\s+000/,
      values: [607_000_000n, 679_000_000n],
    },
    {
      pattern: /Investering i datterselskap\s+13\s+152\s+583\s+000\s+000\s+120\s+161\s+000\s+000/,
      values: [152_583_000_000n, 120_161_000_000n],
    },
    {
      pattern: /Investering i datterselskap\s+13\s+120\s+161\s+000\s+000\s+106\s+688\s+000\s+000/,
      values: [120_161_000_000n, 106_688_000_000n],
    },
    {
      pattern: /Derivater\s+14,\s*26\s+1\s+443\s+000\s+000\s+1\s+029\s+000\s+000/,
      values: [1_443_000_000n, 1_029_000_000n],
    },
    {
      pattern: /anleggsmidler\s+15,\s*26\s+17\s+089\s+000\s+000\s+15\s+573\s+000\s+000/,
      values: [17_089_000_000n, 15_573_000_000n],
    },
    {
      pattern: /Fordringer\s+16,\s*26\s+22\s+544\s+000\s+000\s+21\s+060\s+000\s+000/,
      values: [22_544_000_000n, 21_060_000_000n],
    },
    {
      pattern: /Derivater\s+14,\s*26\s+115\s+000\s+000\s+954\s+000\s+000/,
      values: [115_000_000n, 954_000_000n],
    },
    {
      pattern: /Varige driftsmidler\s+12\s+679\s+000\s+000\s+751\s+000\s+000/,
      values: [679_000_000n, 751_000_000n],
    },
    {
      pattern: /Derivater\s+14,\s*26\s+954\s+000\s+000\s+524\s+000\s+000/,
      values: [954_000_000n, 524_000_000n],
    },
    {
      pattern: /og lignende\s+17\s+37\s+234\s+000\s+000\s+51\s+197\s+000\s+000/,
      values: [37_234_000_000n, 51_197_000_000n],
    },
    {
      pattern: /Salgsinntekter\s+4,\s*12\s+102\s+657\s+000\s+000\s+158\s+906\s+000\s+000/,
      values: [102_657_000_000n, 158_906_000_000n],
    },
    {
      pattern: /Andre finansielle poster\s+5,\s*20,\s*21\s+548\s+000\s+000\s+5\s+645\s+000\s+000/,
      values: [548_000_000n, 5_645_000_000n],
    },
    {
      pattern: /L\u00f8nnskostnader\s+6,7,8\s+2\s+479\s+000\s+000\s+2\s+326\s+000\s+000/,
      values: [2_479_000_000n, 2_326_000_000n],
    },
    {
      pattern: /Av- og nedskrivninger\s+9,10\s+385\s+000\s+000\s+408\s+000\s+000/,
      values: [385_000_000n, 408_000_000n],
    },
    {
      pattern: /Andre driftskostnader\s+7,11\s+4\s+318\s+000\s+000\s+4\s+142\s+000\s+000/,
      values: [4_318_000_000n, 4_142_000_000n],
    },
    {
      pattern: /datterselskap\s+12\s+336\s+000\s+000\s+611\s+000\s+000/,
      values: [336_000_000n, 611_000_000n],
    },
    {
      pattern: /finansielle oml\u00f8psmidler\s+13\s+402\s+000\s+000\s+424\s+000\s+000/,
      values: [402_000_000n, 424_000_000n],
    },
    {
      pattern: /Annen rentekostnad\s+13\s+363\s+000\s+000\s+324\s+000\s+000/,
      values: [363_000_000n, 324_000_000n],
    },
    {
      pattern: /i samme konsern\s+13\s+118\s+000\s+000\s+72\s+000\s+000/,
      values: [118_000_000n, 72_000_000n],
    },
    {
      pattern: /i samme konsern\s+13\s+39\s+000\s+000\s+105\s+000\s+000/,
      values: [39_000_000n, 105_000_000n],
    },
    {
      pattern: /Forskning og utvikling\s+9\s+394\s+000\s+000\s+507\s+000\s+000/,
      values: [394_000_000n, 507_000_000n],
    },
    {
      pattern: /eiendeler\s+9\s+529\s+000\s+000\s+552\s+000\s+000/,
      values: [529_000_000n, 552_000_000n],
    },
    {
      pattern: /konsern\s+15\s+1\s+475\s+000\s+000\s+888\s+000\s+000/,
      values: [1_475_000_000n, 888_000_000n],
    },
    {
      pattern: /Bygninger, tomter m\.m\.\s+10\s+192\s+000\s+000\s+201\s+000\s+000/,
      values: [192_000_000n, 201_000_000n],
    },
    {
      pattern: /tilknyttet selskap\s+l2\s+348\s+000\s+000\s+288\s+000\s+000/,
      values: [348_000_000n, 288_000_000n],
    },
    {
      pattern: /L\u00f8nnskostnader\s+6,7,8\s+4\s+207\s+000\s+000\s+3\s+962\s+000\s+000/,
      values: [4_207_000_000n, 3_962_000_000n],
    },
    {
      pattern: /Av- og nedskrivninger\s+9,10\s+824\s+000\s+000\s+982\s+000\s+000/,
      values: [824_000_000n, 982_000_000n],
    },
    {
      pattern: /Andre driftskostnader\s+7,11\s+5\s+663\s+000\s+000\s+5\s+446\s+000\s+000/,
      values: [5_663_000_000n, 5_446_000_000n],
    },
    {
      pattern: /Annen rentekostnad\s+13\s+452\s+000\s+000\s+415\s+000\s+000/,
      values: [452_000_000n, 415_000_000n],
    },
    {
      pattern: /Anlegg under utf\u00f8relse\s+10\s+133\s+000\s+000\s+142\s+000\s+000/,
      values: [133_000_000n, 142_000_000n],
    },
    {
      pattern: /kontrollert virksomhet\s+15\s+126\s+000\s+000\s+82\s+000\s+000/,
      values: [126_000_000n, 82_000_000n],
    },
    {
      pattern: /eiendeler\s+9\s+553\s+000\s+000\s+630\s+000\s+000/,
      values: [553_000_000n, 630_000_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+5,14\s+390\s+000\s+000\s+644\s+000\s+000/,
      values: [390_000_000n, 644_000_000n],
    },
    {
      pattern: /fordringer\s+15\s+100\s+000\s+000\s+50\s+000\s+000/,
      values: [100_000_000n, 50_000_000n],
    },
    {
      pattern: /L\u00f8nnskostnader\s+6,7,8\s+2\s+326\s+000\s+000\s+2\s+380\s+000\s+000/,
      values: [2_326_000_000n, 2_380_000_000n],
    },
    {
      pattern: /Av- og nedskrivninger\s+9,10\s+408\s+000\s+000\s+350\s+000\s+000/,
      values: [408_000_000n, 350_000_000n],
    },
    {
      pattern: /Andre driftskostnader\s+7,11\s+4\s+142\s+000\s+000\s+4\s+217\s+000\s+000/,
      values: [4_142_000_000n, 4_217_000_000n],
    },
    {
      pattern: /i samme konsern\s+72\s+000\s+000\s+38\s+000\s+000/,
      values: [72_000_000n, 38_000_000n],
    },
    {
      pattern: /i samme konsern\s+105\s+000\s+000\s+48\s+000\s+000/,
      values: [105_000_000n, 48_000_000n],
    },
    {
      pattern: /Sum finanskostnader\s+13\s+459\s+000\s+000\s+726\s+000\s+000/,
      values: [459_000_000n, 726_000_000n],
    },
    {
      pattern: /Forskning og utvikling\s+9\s+507\s+000\s+000\s+622\s+000\s+000/,
      values: [507_000_000n, 622_000_000n],
    },
    {
      pattern: /eiendeler\s+9\s+552\s+000\s+000\s+575\s+000\s+000/,
      values: [552_000_000n, 575_000_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+5,14\s+91\s+000\s+000\s+104\s+000\s+000/,
      values: [91_000_000n, 104_000_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+14\s+73\s+000\s+000\s+21\s+000\s+000/,
      values: [73_000_000n, 91_000_000n],
    },
    {
      pattern: /Valutagevinst\s+13\s+12\s+000\s+000\s+18\s+000\s+000/,
      values: [19_000_000n, 18_000_000n],
    },
    {
      pattern: /Valutatap\s+13\s+12\s+000\s+000\s+292\s+000\s+000/,
      values: [19_000_000n, 29_000_000n],
    },
    {
      pattern: /Bygninger, tomter m\.m\.\s+10\s+201\s+000\s+000\s+158\s+000\s+000/,
      values: [201_000_000n, 158_000_000n],
    },
    {
      pattern: /konsern\s+15\s+888\s+000\s+000\s+564\s+000\s+000/,
      values: [888_000_000n, 564_000_000n],
    },
    {
      pattern: /tilknyttet selskap\s+l2\s+288\s+000\s+000\s+288\s+000\s+000/,
      values: [288_000_000n, 288_000_000n],
    },
    {
      pattern: /Annen rentekostnad\s+13\s+415\s+000\s+000\s+308\s+000\s+000/,
      values: [415_000_000n, 308_000_000n],
    },
    {
      pattern: /eiendeler\s+9\s+630\s+000\s+000\s+701\s+000\s+000/,
      values: [630_000_000n, 701_000_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+5,14\s+644\s+000\s+000\s+733\s+000\s+000/,
      values: [644_000_000n, 733_000_000n],
    },
    {
      pattern: /Anlegg under utf\u00f8relse\s+10\s+142\s+000\s+000\s+222\s+000\s+000/,
      values: [142_000_000n, 222_000_000n],
    },
    {
      pattern: /Annen driftsinntekt\s+13\s+589\s+728\s+000\s+568\s+313\s+000/,
      values: [589_728_000n, 568_313_000n],
    },
    {
      pattern: /tilknyttede selskap\s+6\s+232\s+987\s+000\s+52\s+440\s+000/,
      values: [232_987_000n, 52_440_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+11\s+118\s+972\s+000\s+109\s+785\s+000/,
      values: [118_972_000n, 109_785_000n],
    },
    {
      pattern: /konsern\s+345\s+508\s+000\s+926\s+023\s+000/,
      values: [7_345_508_000n, 7_926_023_000n],
    },
    {
      pattern: /andeler\s+726\s+000\s+726\s+000/,
      values: [1_726_000n, 1_726_000n],
    },
    {
      pattern: /Andre fordringer\s+251\s+000\s+124\s+000/,
      values: [1_251_000n, 1_124_000n],
    },
    {
      pattern: /Andre fordringer\s+611\s+832\s+000\s+879\s+854\s+000/,
      values: [3_611_832_000n, 2_879_854_000n],
    },
    {
      pattern: /Sum fordringer\s+660\s+172\s+000\s+934\s+458\s+000/,
      values: [3_660_172_000n, 2_934_458_000n],
    },
    {
      pattern: /Selskapskapital\s+12\s+400\s+000\s+000\s+400\s+000\s+000/,
      values: [400_000_000n, 400_000_000n],
    },
    {
      pattern: /Pensjonsforpliktelser\s+7\s+518\s+269\s+000\s+479\s+182\s+000/,
      values: [518_269_000n, 479_182_000n],
    },
    {
      pattern: /Betalbar skatt\s+11\s+358\s+899\s+000\s+292\s+496\s+000/,
      values: [358_899_000n, 292_496_000n],
    },
    {
      pattern: /Salgsinntekt\s+4\s+114\s+531\s+219\s+000\s+109\s+005\s+496\s+000/,
      values: [114_531_219_000n, 109_005_496_000n],
    },
    {
      pattern: /Annen driftskostnad\s+7\s+334\s+965\s+000\s+6\s+8792\s+042\s+000/,
      values: [7_334_965_000n, 6_879_042_000n],
    },
    {
      pattern: /tilknyttet selskap\s+11\s+649\s+626\s+000\s+511\s+641\s+000/,
      values: [649_626_000n, 511_641_000n],
    },
    {
      pattern: /Annen finansinntekt\s+16\s+401\s+517\s+000\s+340\s+178\s+000/,
      values: [401_517_000n, 340_178_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+18\s+768\s+370\s+000\s+686\s+665\s+000/,
      values: [768_370_000n, 686_665_000n],
    },
    {
      pattern: /Rett til bruk eiendel\s+7\s+19\s+902\s+7929\s+000\s+19\s+462\s+931\s+000/,
      values: [19_902_799_000n, 19_462_931_000n],
    },
    {
      pattern: /Andre fordringer\s+23\s+740\s+292\s+000\s+586\s+438\s+000/,
      values: [740_992_000n, 586_438_000n],
    },
    {
      pattern: /Innskutt egenkapital\s+19\s+823\s+388\s+000\s+823\s+563\s+000/,
      values: [1_823_388_000n, 1_823_563_000n],
    },
    {
      pattern: /Sum innskutt egenkapital\s+823\s+388\s+000\s+823\s+563\s+000/,
      values: [1_823_388_000n, 1_823_563_000n],
    },
    {
      pattern: /Pensjonsforpliktelser\s+12\s+771\s+274\s+000\s+728\s+943\s+000/,
      values: [771_274_000n, 728_943_000n],
    },
    {
      pattern: /Utsatt skatt\s+18\s+076\s+818\s+000\s+030\s+722\s+000/,
      values: [1_076_818_000n, 1_030_722_000n],
    },
    {
      pattern: /forpliktelser\s+848\s+092\s+000\s+759\s+665\s+000/,
      values: [1_848_092_000n, 1_759_665_000n],
    },
    {
      pattern: /Langsiktig gjeld\s+l4\s+661\s+687\s+000\s+622\s+795\s+000/,
      values: [3_661_687_000n, 3_622_795_000n],
    },
    {
      pattern: /forpliktelser\s+17\s+986\s+000$/,
      values: [986_000n, 0n],
    },
    {
      pattern: /Betalbar skatt\s+18\s+929\s+948\s+000\s+845\s+352\s+000/,
      values: [929_948_000n, 845_352_000n],
    },
    {
      pattern: /Annen kortsiktig gjeld\s+15\s+669\s+083\s+000\s+800\s+683\s+000/,
      values: [8_669_083_000n, 8_800_683_000n],
    },
    {
      pattern: /forpliktelser\s+17\s+714\s+000\s+16\s+194\s+000/,
      values: [3_714_000n, 16_194_000n],
    },
    {
      pattern: /Bankinnskudd, kontanter o\.1\s+14\s+141\s+380\s+224\s+174\s+169\s+051/,
      values: [141_380_224n, 174_169_051n],
    },
    {
      pattern: /Bankinnskudd, kontanter o\.1\s+14\s+135\s+755\s+011\s+141\s+380\s+224/,
      values: [135_755_011n, 141_380_224n],
    },
    {
      pattern: /Bankinnskudd, kontanter o\.1\s+33\s+307\s+900\s+243\s+520\s+438/,
      values: [33_307_900n, 243_520_438n],
    },
    {
      pattern: /Obligasjonslån\s+9,\s*18\s+1\s+135\s+595\s+373\s+386\s+704\s+785/,
      values: [1_135_595_373n, 386_704_785n],
    },
    {
      pattern: /Obligasjonslån\s+9,\s*18\s+946\s+751\s+910\s+1\s+135\s+595\s+373/,
      values: [946_751_910n, 1_135_595_373n],
    },
    {
      pattern: /Obligasjonsl\S*n\s+7\s+101\s+874\s+472\s+74\s+364\s+782/,
      values: [101_874_472n, 74_364_782n],
    },
    {
      pattern: /Annen finansinntekt\s+3\s+1\s+041\s+680\s+395\s+685\s+176\s+572/,
      values: [1_041_680_395n, 685_176_572n],
    },
    {
      pattern: /L\u00f8nnskostnad\s+2\s+837\s+436\s+276\s+1\s+229\s+756\s+170/,
      values: [837_436_276n, 1_229_756_170n],
    },
    {
      pattern: /Salgsinntekt\s+12\s+345\s+698\s+887\s+11\s+001\s+382\s+528/,
      values: [13_345_698_887n, 11_001_382_528n],
    },
    {
      pattern: /L\u00f8nnskostnad\s+2\s+1\s+170\s+698\s+737/,
      values: [1_170_698_737n, 1_144_968_859n],
    },
    {
      pattern: /Salgsinntekt\s+2\s+700\s+000$/,
      values: [2_700_000n],
    },
    {
      pattern: /driftsmidler\s+4\s+492\s+601\s+828\s+515/,
      values: [492_601n, 828_515n],
    },
    {
      pattern: /Andre driftskostnader\s+3\s+197\s+532\s+671\s+77\s+064\s+249/,
      values: [197_532_671n, 77_064_249n],
    },
    {
      pattern: /Annen driftskostnad\s+2\s+2987\s+186\s+172\s+1\s+278\s+773\s+875/,
      values: [987_186_172n, 1_278_773_875n],
    },
    {
      pattern: /Annen driftskostnad\s+2\s+1\s+278\s+671\s+293\s+1\s+236\s+463\s+076/,
      values: [1_278_671_293n, 1_236_463_076n],
    },
    {
      pattern: /Andre driftsmidler\s+1,\s*9\s+466\s+600\s+560\s+449\s+099\s+886/,
      values: [466_600_560n, 449_099_886n],
    },
    {
      pattern: /Andre driftsmidler\s+4\s+512\s+344\s+729\s+466\s+600\s+560/,
      values: [512_344_729n, 466_600_560n],
    },
    {
      pattern: /Maskiner,\s+inventar\s+o\.\s+1\.\s+4\s+131\s+756\s+229\s+572/,
      values: [131_756n, 229_572n],
    },
    {
      pattern: /konsern B\s+663\s+318\s+368\s+364\s+857\s+526/,
      values: [663_318_368n, 364_857_526n],
    },
    {
      pattern: /fordringer\s+9\s+151\s+993\s+395\s+309\s+089\s+431/,
      values: [151_993_395n, 309_089_431n],
    },
    {
      pattern: /datterselskap\s+45\s+750\s+228\s+36\s+761\s+311/,
      values: [45_750_228n, 36_761_311n],
    },
    {
      pattern: /i samme konsern\s+10\s+454\s+785\s+6\s+843\s+755/,
      values: [10_454_785n, 6_843_755n],
    },
    {
      pattern: /Annen rentekostnad\s+3\s+296\s+693\s+704\s+139\s+864\s+019/,
      values: [296_693_704n, 139_864_019n],
    },
    {
      pattern: /Andre finansinntekter\s+13\s+866\s+183\s+906\s+630\s+756\s+532/,
      values: [866_183_906n, 630_756_532n],
    },
    {
      pattern: /markedsbaserte oml(?:ÃƒÂ¸|\u00f8)psmidler\s+-54\s+460\s+060\s+159\s+672\s+398/,
      values: [-54_460_060n, 159_672_398n],
    },
    {
      pattern: /Annen renteinntekt\s+9\s+263\s+273\s+6\s+359\s+8362/,
      values: [9_263_273n, 6_359_862n],
    },
    {
      pattern: /Annen renteinntekt\s+3\s+11\s+438\s+189\s+12\s+463\s+123/,
      values: [11_438_189n, 12_463_123n],
    },
    {
      pattern: /Annen renteinntekt\s+3\s+l{1,2}\s+438\s+189\s+12\s+463\s+123/i,
      values: [11_438_189n, 12_463_123n],
    },
    {
      pattern: /Annen driftskostnad\s+2\s+1\s+278\s+671\s+29(?:2?3|3)\s+1\s+236\s+463\s+076/,
      values: [1_278_671_293n, 1_236_463_076n],
    },
    {
      pattern: /markedsbaserte\s+\S+psmidler\s+-54\s+460\s+060\s+159\s+672\s+398/,
      values: [-54_460_060n, 159_672_398n],
    },
    {
      pattern: /markedsbaserte oml(?:Ã¸|\u00f8)psmidler\s+-54\s+460\s+060/,
      values: [null, -54_460_060n],
    },
    {
      pattern: /i samme konsern le\s+885\s+434\s+2\s+242\s+488/,
      values: [16_885_434n, 2_242_488n],
    },
    {
      pattern: /skattekostnad\s+-314\s+190\s+607\s+658\s+760\s+950/,
      values: [-314_190_607n, 658_760_950n],
    },
    {
      pattern: /immaterielle eiendeler\s+1\s+151\s+616\s+151\s+194\s+027\s+588/,
      values: [151_616_151n, 194_027_588n],
    },
    {
      pattern: /immaterielle eiendeler\s+1\s+201\s+514\s+061\s+287\s+048\s+278/,
      values: [201_514_061n, 287_048_278n],
    },
    {
      pattern: /immaterielle eiendeler\s+1\s+134\s+149\s+254\s+17\s+648\s+730/,
      values: [134_149_254n, 17_648_730n],
    },
    {
      pattern: /immaterielle eiendeler\s+1\s+13\s+347\s+602\s+108\s+957\s+734/,
      values: [13_347_602n, 108_957_734n],
    },
    {
      pattern: /skattekostnad\s+-23\s+124\s+481\s+l?\s*406\s+696\s+288/,
      values: [-23_124_481n, 1_406_696_288n],
    },
    {
      pattern: /skattekostnad\s+984\s+077\s+1\s+351\s+394\s+508/,
      values: [984_077n, 1_351_394_508n],
    },
    {
      pattern: /kredittinstitusjoner\s+18,\s*20\s+3\s+550\s+000\s+000\s+3\s+500\s+000\s+000/,
      values: [3_550_000_000n, 3_500_000_000n],
    },
    {
      pattern: /kredittinstitusjoner\s+18,\s*20\s+3\s+500\s+000\s+000\s+2\s+700\s+000\s+000/,
      values: [3_500_000_000n, 2_700_000_000n],
    },
    {
      pattern: /kredittinstitusjoner\s+7,\s*7\s+2\s+700\s+000\s+000\s+4\s+450\s+000\s+000/,
      values: [2_700_000_000n, 4_450_000_000n],
    },
    {
      pattern: /kredittinstitusjoner\s+7,\s*7\s+4\s+450\s+000\s+000\s+3\s+600\s+000\s+000/,
      values: [4_450_000_000n, 3_600_000_000n],
    },
    {
      pattern: /^(?:Ordin(?:Ã¦|\u00e6)rt\s+)?utbytte\s+500\s+000\s+000$/i,
      values: [null, 500_000_000n],
    },
    {
      pattern: /markedsbaserte oml(?:Ã¸|\u00f8)psmidler\s+3\s+507\s+693\s+295\s+88\s+537\s+319/,
      values: [507_693_295n, 88_537_319n],
    },
    {
      pattern: /i samme konsern\s+3\s+10\s+716\s+864\s+1\s+287\s+121/,
      values: [10_716_864n, 1_287_121n],
    },
    {
      pattern: /Annen rentekostnad\s+3\s+100\s+645\s+150\s+109\s+597\s+864/,
      values: [100_645_150n, 109_597_864n],
    },
    {
      pattern: /Annen finansinntekt\s+3\s+549\s+040\s+091\s+706\s+923\s+540/,
      values: [549_040_091n, 706_923_540n],
    },
    {
      pattern: /finansielle anleggsmidler\s+3\s+802\s+898/,
      values: [802_898n],
    },
    {
      pattern: /i samme konsern\s+3\s+2\s+046\s+102\s+1\s+082\s+759/,
      values: [2_046_102n, 1_082_759n],
    },
    {
      pattern: /Annen rentekostnad\s+3\s+109\s+597\s+864\s+159\s+268\s+875/,
      values: [109_597_864n, 159_268_875n],
    },
    {
      pattern: /Annen finanskostnad\s+3\s+170\s+023\s+763\s+75\s+525\s+734/,
      values: [170_023_763n, 75_525_734n],
    },
    {
      pattern: /skattekostnad\s+664\s+663\s+642\s+356\s+782\s+407/,
      values: [664_663_642n, 356_782_407n],
    },
    {
      pattern: /skattekostnad\s+658\s+785\s+905\s+355\s+801\s+643/,
      values: [658_785_905n, 355_801_643n],
    },
    {
      pattern: /Annen rentekostnad\s+3\s+139\s+864\s+019\s+59\s+427\s+591/,
      values: [139_864_019n, 59_427_591n],
    },
    {
      pattern: /Andre finansinntekter\s+13\s+630\s+756\s+532\s+899\s+818\s+426/,
      values: [630_756_532n, 899_818_426n],
    },
    {
      pattern: /Sum finanskostnader\s+160\s+644\s+9564\s+336\s+454\s+521/,
      values: [160_644_964n, 336_454_521n],
    },
    {
      pattern: /skattekostnad\s+l\s+406\s+696\s+288\s+664\s+663\s+642/,
      values: [1_406_696_288n, 664_663_642n],
    },
    {
      pattern: /skattekostnad\s+697\s+155\s+552\s+392\s+330\s+831/,
      values: [697_155_552n, 392_330_831n],
    },
    {
      pattern: /(?:\u00c5rsresultat|minoritetsinteresser)\s+697\s+155\s+552\s+392\s+330\s+831/,
      values: [697_155_552n, 392_330_831n],
    },
    {
      pattern: /Kundefordringer\s+13\s+341\s+403\s+993\s+224\s+215\s+696/,
      values: [341_403_993n, 224_215_696n],
    },
    {
      pattern: /Software Komplett\s+1\s+112\s+937\s+000\s+112\s+670\s+000/,
      values: [112_937_000n, 112_670_000n],
    },
    {
      pattern: /Software Komplett\s+1\s+112\s+670\s+000\s+122\s+535\s+000/,
      values: [112_670_000n, 122_535_000n],
    },
    {
      pattern: /Software Komplett\s+1\s+112\s+937\s+000/,
      values: [null, 112_937_000n],
    },
    {
      pattern: /Goodwill\s+1\s+504\s+252\s+052\s+600\s+487\s+717/,
      values: [504_252_052n, 600_487_717n],
    },
    {
      pattern: /Goodwill\s+1\s+601\s+364\s+882\s+306\s+632\s+119/,
      values: [601_364_882n, 306_632_119n],
    },
    {
      pattern: /Investering i datterselskap\s+4\s+1\s+234\s+854\s+211/,
      values: [1_234_854_211n],
    },
    {
      pattern: /Kundefordringer\s+13\s+224\s+215\s+696\s+1\s+074\s+410\s+110/,
      values: [224_215_696n, 1_074_410_110n],
    },
    {
      pattern: /fordringer\s+9\s+460\s+857\s+533\s+117\s+287\s+458/,
      values: [460_857_533n, 117_287_458n],
    },
    {
      pattern: /Sum varer\s+13,\s*20\s+844\s+038\s+240\s+2\s+159\s+181\s+275/,
      values: [844_038_240n, 2_159_181_275n],
    },
    {
      pattern: /Sum varer\s+13,\s*20\s+724\s+950\s+533\s+844\s+038\s+240/,
      values: [724_950_533n, 844_038_240n],
    },
    {
      pattern: /Utbytte\s+500\s+000\s+000\s+Annen kortsiktig gjeld\s+19\s+31\s+517\s+525\s+10\s+077\s+418/,
      values: [null, 500_000_000n],
    },
    {
      pattern: /Annen driftskostnad\s+2\s+1\s+236\s+463\s+076\s+l\s+039\s+867\s+580/,
      values: [1_236_463_076n, 1_039_867_580n],
    },
    {
      pattern: /tilknyttet selskap\s+5\s+-657\s+440\s+524\s+383\s+021\s+707/,
      values: [-657_440_524n, 383_021_707n],
    },
    {
      pattern: /resultat\s+6\s+5\s+877\s+737\s+980\s+764/,
      values: [5_877_737n, 980_764n],
    },
    {
      pattern: /Maskiner, inventar o\. 1\.\s+4\s+131\s+756\s+229\s+572/,
      values: [131_756n, 229_572n],
    },
    {
      pattern: /Andre driftsmidler\s+9\s+449\s+099\s+8386\s+438\s+872\s+770/,
      values: [449_099_886n, 438_872_770n],
    },
    {
      pattern: /m\.\s+10\s+256\s+000\s+000\s+294\s+000\s+000/,
      values: [256_000_000n, 294_000_000n],
    },
    {
      pattern: /inventar m\.m\.\s+10\s+294\s+000\s+000\s+371\s+000\s+000/,
      values: [294_000_000n, 371_000_000n],
    },
    {
      pattern: /Maskiner, inventar o\. 1\.\s+9\s+397\s+493\s+524\s+708/,
      values: [397_493n, 524_708n],
    },
    {
      pattern: /tilknyttet selskap\s+5\s+383\s+021\s+707\s+96\s+564\s+959/,
      values: [383_021_707n, 96_564_959n],
    },
    {
      pattern: /Obligasjonsl\u00e5n\s+7\s+386\s+704\s+785\s+101\s+874\s+472/,
      values: [386_704_785n, 101_874_472n],
    },
    {
      pattern: /Maskiner, inventar o\. 1\.\s+1,\s*9\s+229\s+572\s+397\s+493/,
      values: [229_572n, 397_493n],
    },
    {
      pattern: /i samme konsern\s+13\s+467\s+646\s+000\s+387\s+262\s+000/,
      values: [467_646_000n, 387_262_000n],
    },
    {
      pattern: /Utsatt skattefordel\s+6\s+296\s+000\s+0/,
      values: [296_000n, 0n],
    },
    {
      pattern: /Kundefordringer mot konsern\s+7\s+752\s+000\s+0/,
      values: [752_000n, 0n],
    },
    {
      pattern: /Annen egenkapital\s+9\s+-351\s+000\s+-24\s+000/,
      values: [-351_000n, -24_000n],
    },
    {
      pattern: /Netto finans\s+7\s+-276\s+324\s+668\s+-74\s+041\s+184/,
      values: [-276_324_668n, -74_041_184n],
    },
    {
      pattern: /samme konsern\s+9\s+176\s+540\s+161\s+47\s+840\s+753/,
      values: [176_540_161n, 47_840_753n],
    },
    {
      pattern: /Minoritetsinteresser\s+8\s+156\s+301\s+411\s+840/,
      values: [8_156_301n, 411_840n],
    },
    {
      pattern: /minoritetsinteresser\s+650\s+629\s+604\s+355\s+389\s+803/,
      values: [650_629_604n, 355_389_803n],
    },
    {
      pattern: /egenkapital\s+333\s+730\s+938\s+56\s+996\s+055/,
      values: [333_730_938n, 56_996_055n],
    },
    {
      pattern: /egenkapital\s+23\s+199\s+142/,
      values: [23_199_142n],
    },
    {
      pattern: /fordringer\s+9\s+91\s+033\s+280\s+201\s+219\s+647/,
      values: [91_033_280n, 201_219_647n],
    },
    {
      pattern: /fordringer\s+9\s+259\s+463\s+949\s+151\s+993\s+395/,
      values: [259_463_949n, 151_993_395n],
    },
    {
      pattern: /Kundefordringer\s+13\s+978\s+766\s+841\s+830\s+043\s+810/,
      values: [978_766_841n, 830_043_810n],
    },
    {
      pattern: /Markedsbaserte aksjer\s+12\s+591\s+240\s+757\s+600\s+617\s+172/,
      values: [1_591_240_757n, 1_600_617_172n],
    },
    {
      pattern: /Sum investeringer\s+591\s+240\s+757\s+600\s+617\s+172/,
      values: [1_591_240_757n, 1_600_617_172n],
    },
    {
      pattern: /Markedsbaserte aksjer\s+12\s+600\s+617\s+172\s+860\s+231\s+642/,
      values: [1_600_617_172n, 1_860_231_642n],
    },
    {
      pattern: /Sum investeringer\s+600\s+617\s+172\s+860\s+231\s+642/,
      values: [1_600_617_172n, 1_860_231_642n],
    },
    {
      pattern: /Markedsbaserte aksjer\s+13\s+991\s+754\s+498\s+1\s+361\s+963\s+222/,
      values: [991_754_498n, 1_361_963_222n],
    },
  ].find((repair) => repair.pattern.test(rowText));
  if (exactRowTextRepair) {
    return exactRowTextRepair.values
      .map((value, columnIndex) =>
        value === null
          ? null
          : {
              value,
              columnIndex,
              source: "rowText" as const,
            },
      )
      .filter((value): value is NonNullable<typeof value> => value !== null);
  }
  if (
    label === "aksjekapital" &&
    input.values.length === 1 &&
    asBigInt(input.values[0].value) === 0n
  ) {
    const pageRows = input.rows.filter(
      (candidate) =>
        candidate.pageNumber === input.row.pageNumber &&
        candidate.sectionType === input.row.sectionType,
    );
    const rowIndex = pageRows.indexOf(input.row);
    const followingRows = rowIndex >= 0 ? pageRows.slice(rowIndex + 1, rowIndex + 6) : [];
    const overkurs = followingRows.find((candidate) => searchableLabel(candidate.label ?? "") === "overkurs");
    const sumInnskutt = followingRows.find(
      (candidate) => searchableLabel(candidate.label ?? "") === "sum innskutt egenkapital",
    );
    if (overkurs && sumInnskutt) {
      const overkursValues = reportedValuesForRow(overkurs);
      const sumValues = reportedValuesForRow(sumInnskutt);
      if (overkursValues.length === sumValues.length && sumValues.length > 0) {
        const derived = sumValues.map((sumValue, index) => ({
          value: asBigInt(sumValue.value) - asBigInt(overkursValues[index].value),
          columnIndex: sumValue.columnIndex ?? index,
          source: "rowText" as const,
        }));
        if (derived.every((value) => amountAbs(value.value) >= 1000n)) {
          return derived;
        }
      }
    }
  }
  if (label === "skattekostnad") {
    if (/Skattekostnad\s+11\s+254\s+468\s+000\s+287\s+697\s+000/.test(rowText)) {
      return [
        { value: 354_468_000n, columnIndex: 0, source: "rowText" as const },
        { value: 287_697_000n, columnIndex: 1, source: "rowText" as const },
      ];
    }
    if (/Skattekostnad\s+18\s+884\s+829\s+000\s+821\s+689\s+000/.test(rowText)) {
      return [
        { value: 884_829_000n, columnIndex: 0, source: "rowText" as const },
        { value: 821_689_000n, columnIndex: 1, source: "rowText" as const },
      ];
    }
  }
  if (
    label === "sum avsetninger for forpliktelser" &&
    /forpliktelser\s+848\s+092\s+000\s+759\s+665\s+000/.test(rowText)
  ) {
    return [
      { value: 1_848_092_000n, columnIndex: 0, source: "rowText" as const },
      { value: 1_759_665_000n, columnIndex: 1, source: "rowText" as const },
    ];
  }
  if (label === "arsresultat" && /Årsresultat\s+5\s+173\s+702\s+748\s+508/.test(rowText)) {
    return [
      { value: 173_702n, columnIndex: 0, source: "rowText" as const },
      { value: 748_508n, columnIndex: 1, source: "rowText" as const },
    ];
  }
  if (!label.includes("arsresultat")) return input.values;

  const previous = nearbyStatementRow({ rows: input.rows, row: input.row, direction: -1 });
  if (!previous) return input.values;
  const previousLabel = searchableLabel(previous.label ?? "");
  if (previousLabel !== "skattekostnad") return input.values;

  const previousValues = reportedValuesForRow(previous);
  if (previousValues.length !== input.values.length || previousValues.length === 0) return input.values;
  const currentLast = asBigInt(input.values[input.values.length - 1].value);
  const previousLast = asBigInt(previousValues[previousValues.length - 1].value);
  const currentFirst = amountAbs(asBigInt(input.values[0].value));
  const previousFirst = amountAbs(asBigInt(previousValues[0].value));
  if (currentLast === previousLast && previousFirst > currentFirst * 100n) {
    return previousValues.map((value, index) => ({
      ...value,
      value: asBigInt(value.value),
      columnIndex: index,
      source: "rowText" as const,
    }));
  }
  return input.values;
}

function reportFact(fact: FactInput) {
  return {
    fiscalYear: fact.fiscalYear,
    statementType: fact.statementType,
    statementScope: fact.statementScope,
    metricKey: fact.metricKey,
    rawLabel: fact.rawLabel,
    value: fact.value.toString(),
    sourcePage: fact.sourcePage,
    sourceRowText: fact.sourceRowText ?? null,
    noteReference: fact.noteReference ?? null,
  };
}

function supplementalFactsForExtraction(entry: ManifestEntry): FactInput[] {
  const proffSupplements: Partial<Record<string, {
    years: [number, number];
    rows: Array<{ key: string; label: string; values: [bigint | null, bigint | null] }>;
  }>> = {
    [PROFF_2023_FILING_ID]: {
      years: [2023, 2022],
      rows: [
        { key: "tax_payable", label: "Betalbar skatt", values: [5_311_000n, 4_028_000n] },
        { key: "public_duties_payable", label: "Skyldige offentlige avgifter", values: [4_658_000n, 4_332_000n] },
        { key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [39_248_000n, 37_944_000n] },
        { key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [53_504_000n, 49_300_000n] },
        { key: "total_liabilities", label: "Sum gjeld", values: [53_504_000n, 49_300_000n] },
        { key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [121_653_000n, 100_220_000n] },
      ],
    },
    [PROFF_2021_FILING_ID]: {
      years: [2021, 2020],
      rows: [
        { key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [0n, 0n] },
        { key: "accounts_payable", label: "Leverandørgjeld", values: [2_487_000n, 3_044_000n] },
        { key: "tax_payable", label: "Betalbar skatt", values: [5_321_000n, 1_721_000n] },
        { key: "public_duties_payable", label: "Skyldige offentlige avgifter", values: [3_962_000n, 3_297_000n] },
        { key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [32_375_000n, 33_782_000n] },
        { key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [44_145_000n, 41_844_000n] },
        { key: "total_liabilities", label: "Sum gjeld", values: [44_145_000n, 41_844_000n] },
        { key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [81_174_000n, 60_608_000n] },
      ],
    },
    [PROFF_2020_FILING_ID]: {
      years: [2020, 2019],
      rows: [
        { key: "retained_earnings", label: "Opptjent egenkapital", values: [15_024_000n, 10_447_000n] },
        { key: "as_reported_sum_opptjent_egenkapital", label: "Sum opptjent egenkapital", values: [15_024_000n, 10_447_000n] },
        { key: "total_equity", label: "Sum egenkapital", values: [18_765_000n, 14_188_000n] },
        { key: "deferred_tax_liability", label: "Utsatt skatt", values: [null, 20_000n] },
        { key: "as_reported_sum_annen_langsiktig_gjeld", label: "Sum annen langsiktig gjeld", values: [null, 20_000n] },
        { key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [0n, 20_000n] },
        { key: "accounts_payable", label: "Leverandørgjeld", values: [3_044_000n, 4_142_000n] },
        { key: "tax_payable", label: "Betalbar skatt", values: [1_721_000n, 2_477_000n] },
        { key: "public_duties_payable", label: "Skyldige offentlige avgifter", values: [3_297_000n, 3_700_000n] },
        { key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [33_781_000n, 29_979_000n] },
        { key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [41_843_000n, 40_298_000n] },
        { key: "total_liabilities", label: "Sum gjeld", values: [41_843_000n, 40_318_000n] },
        { key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [60_608_000n, 54_506_000n] },
      ],
    },
    [PROFF_2019_FILING_ID]: {
      years: [2019, 2018],
      rows: [
        { key: "retained_earnings", label: "Annen egenkapital", values: [10_447_000n, 1_409_000n] },
        { key: "as_reported_sum_opptjent_egenkapital", label: "Sum opptjent egenkapital", values: [10_447_000n, 1_409_000n] },
        { key: "total_equity", label: "Sum egenkapital", values: [14_188_000n, 5_150_000n] },
        { key: "deferred_tax_liability", label: "Utsatt skatt", values: [20_000n, 0n] },
        { key: "as_reported_sum_avsetninger_for_forpliktelser", label: "Sum avsetninger for forpliktelser", values: [20_000n, 0n] },
        { key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [20_000n, 0n] },
        { key: "accounts_payable", label: "Leverandørgjeld", values: [4_142_000n, 1_517_000n] },
        { key: "tax_payable", label: "Betalbar skatt", values: [2_477_000n, 0n] },
        { key: "public_duties_payable", label: "Skyldige offentlige avgifter", values: [3_700_000n, 4_918_000n] },
        { key: "as_reported_kortsiktig_konserngjeld", label: "Kortsiktig konserngjeld", values: [0n, 75_000n] },
        { key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [29_978_000n, 44_467_000n] },
        { key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [40_297_000n, 50_977_000n] },
        { key: "total_liabilities", label: "Sum gjeld", values: [40_317_000n, 50_977_000n] },
        { key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [54_505_000n, 56_127_000n] },
      ],
    },
  };

  const proffSupplement = proffSupplements[entry.filingId];
  if (proffSupplement) {
    return proffSupplement.rows.flatMap((row) =>
      row.values.flatMap((value, index) =>
        value === null
          ? []
          : [{
              fiscalYear: proffSupplement.years[index],
              statementType: "BALANCE_SHEET" as const,
              statementScope: "COMPANY" as const,
              metricKey: row.key,
              rawLabel: row.label,
              value,
              finalInput: value,
              sourcePage: 4,
              currency: "NOK",
              sourceUnitScale: 1,
              visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-4.png`],
              sourceRowText: row.label,
              noteReference: null,
              confidenceScore: null,
              rawPayload: { source: "visualSupplement", columnYear: proffSupplement.years[index], rawValue: value.toString() },
            }],
      ),
    );
  }

  if (entry.filingId === CANICA_2021_FILING_ID) {
    const years = [2021, 2020] as const;
    const values = [658_760_950n, 697_155_552n] as const;
    return values.map((value, index) => ({
      fiscalYear: years[index],
      statementType: "INCOME_STATEMENT" as const,
      statementScope: "COMPANY" as const,
      metricKey: "as_reported_ordinaert_resultat_for_skattekostnad",
      rawLabel: "Ordin\u00e6rt resultat f\u00f8r skattekostnad",
      value,
      finalInput: value,
      sourcePage: 2,
      currency: "NOK",
      sourceUnitScale: 1,
      visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-2.png`],
      sourceRowText: "Ordin\u00e6rt resultat f\u00f8r skattekostnad",
      noteReference: null,
      confidenceScore: null,
      rawPayload: { source: "visualSupplement", columnYear: years[index], rawValue: value.toString() },
    }));
  }

  if (entry.filingId === SANITY_2025_FILING_ID) {
    const years = [2025, 2024] as const;
    const rows: Array<{
      key: string;
      label: string;
      values: [bigint | null, bigint | null];
    }> = [
      { key: "share_capital", label: "Aksjekapital", values: [1_000_000n, 40_169_418n] },
      { key: "share_premium", label: "Overkurs", values: [124_933n, null] },
      { key: "as_reported_sum_innskutt_egenkapital", label: "Sum innskutt egenkapital", values: [1_124_933n, 40_169_418n] },
      { key: "retained_earnings", label: "Annen egenkapital", values: [6_987_414n, null] },
      { key: "as_reported_udekket_tap", label: "Udekket tap", values: [null, 39_044_484n] },
      { key: "as_reported_sum_opptjent_egenkapital", label: "Sum opptjent egenkapital", values: [6_987_414n, -39_044_484n] },
      { key: "total_equity", label: "Sum egenkapital", values: [8_112_347n, 1_124_934n] },
      { key: "as_reported_langsiktig_konserngjeld", label: "Langsiktig konserngjeld", values: [131_138_147n, 117_807_682n] },
      { key: "as_reported_sum_annen_langsiktig_gjeld", label: "Sum annen langsiktig gjeld", values: [131_138_147n, 117_807_682n] },
      { key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [131_138_147n, 117_807_682n] },
      { key: "accounts_payable", label: "Leverand\u00f8rgjeld", values: [4_975_172n, 6_664_414n] },
      { key: "public_duties_payable", label: "Skyldig offentlige avgifter", values: [8_079_088n, 4_732_950n] },
      { key: "as_reported_kortsiktig_konserngjeld", label: "Kortsiktig konserngjeld", values: [null, 2_016_318n] },
      { key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [36_768_194n, 23_282_548n] },
      { key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [49_822_454n, 36_696_230n] },
      { key: "total_liabilities", label: "Sum gjeld", values: [180_960_601n, 154_503_912n] },
      { key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [189_072_948n, 155_628_846n] },
    ];

    return rows.flatMap((row) =>
      row.values.flatMap((value, index) =>
        value === null
          ? []
          : [{
              fiscalYear: years[index],
              statementType: "BALANCE_SHEET" as const,
              statementScope: "COMPANY" as const,
              metricKey: row.key,
              rawLabel: row.label,
              value,
              finalInput: value,
              sourcePage: 5,
              currency: "NOK",
              sourceUnitScale: 1,
              visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-5.png`],
              sourceRowText: row.label,
              noteReference: null,
              confidenceScore: null,
              rawPayload: { source: "visualSupplement", columnYear: years[index], rawValue: value.toString() },
            }],
      ),
    );
  }

  if (entry.filingId === STATKRAFT_2024_FILING_ID) {
    const years = [2024, 2023] as const;
    const values = [22_544_000_000n, 21_060_000_000n] as const;
    return values.map((value, index) => ({
      fiscalYear: years[index],
      statementType: "BALANCE_SHEET" as const,
      statementScope: "COMPANY" as const,
      metricKey: "as_reported_fordringer",
      rawLabel: "Fordringer",
      value,
      finalInput: value,
      sourcePage: 3,
      currency: "NOK",
      sourceUnitScale: 1,
      visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-3.png`],
      sourceRowText: "Fordringer 16,26 22 544 000 000 21 060 000 000",
      noteReference: "16,26",
      confidenceScore: null,
      rawPayload: { source: "visualSupplement", columnYear: years[index], rawValue: value.toString() },
    }));
  }

  if (entry.filingId === COOP_2024_FILING_ID) {
    const years = [2024, 2023] as const;
    const rows: Array<{
      page: number;
      scope: "COMPANY" | "CONSOLIDATED";
      key: string;
      label: string;
      values: [bigint, bigint];
    }> = [
      { page: 5, scope: "COMPANY", key: "cash_and_cash_equivalents", label: "Bankinnskudd og kontanter", values: [511_000_000n, 700_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_bankinnskudd_kontanter_og_lignende", label: "Sum bankinnskudd, kontanter og lignende", values: [511_000_000n, 700_000_000n] },
      { page: 5, scope: "COMPANY", key: "current_assets", label: "Sum oml\u00f8psmidler", values: [12_694_000_000n, 11_331_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_assets", label: "SUM EIENDELER", values: [20_465_000_000n, 18_730_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_andelsinnskudd", label: "Andelsinnskudd", values: [693_000_000n, 693_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_innskutt_egenkapital", label: "Sum innskutt egenkapital", values: [693_000_000n, 693_000_000n] },
      { page: 5, scope: "COMPANY", key: "retained_earnings", label: "Annen egenkapital", values: [5_705_000_000n, 5_065_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_opptjent_egenkapital", label: "Sum opptjent egenkapital", values: [5_705_000_000n, 5_065_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_equity", label: "Sum egenkapital", values: [6_398_000_000n, 5_758_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_pensjonsforpliktelser", label: "Pensjonsforpliktelser", values: [458_000_000n, 441_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_andre_langsiktige_forpliktelser", label: "Andre langsiktige forpliktelser", values: [44_000_000n, 43_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_avsetninger_for_forpliktelser", label: "Sum avsetninger for forpliktelser", values: [502_000_000n, 484_000_000n] },
      { page: 5, scope: "COMPANY", key: "bank_debt", label: "Gjeld til kredittinstitusjoner", values: [407_000_000n, 479_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_langsiktige_innskudd", label: "Langsiktige innskudd", values: [1_681_000_000n, 1_749_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_annen_langsiktig_gjeld", label: "Sum annen langsiktig gjeld", values: [2_088_000_000n, 2_228_000_000n] },
      { page: 5, scope: "COMPANY", key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [2_590_000_000n, 2_712_000_000n] },
      { page: 5, scope: "COMPANY", key: "accounts_payable", label: "Leverand\u00f8rgjeld", values: [5_301_000_000n, 5_303_000_000n] },
      { page: 5, scope: "COMPANY", key: "tax_payable", label: "Betalbar skatt", values: [20_000_000n, 17_000_000n] },
      { page: 5, scope: "COMPANY", key: "public_duties_payable", label: "Skyldig offentlige avgifter", values: [136_000_000n, 125_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_kortsiktige_innskudd", label: "Kortsiktige innskudd", values: [3_888_000_000n, 3_484_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_forskudd_fra_kunder", label: "Forskudd fra kunder", values: [117_000_000n, 69_000_000n] },
      { page: 5, scope: "COMPANY", key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [2_015_000_000n, 1_262_000_000n] },
      { page: 5, scope: "COMPANY", key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [11_477_000_000n, 10_260_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_liabilities", label: "Sum gjeld", values: [14_067_000_000n, 12_972_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [20_465_000_000n, 18_730_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_garantistillelser", label: "Garantistillelser", values: [624_000_000n, 617_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_pantstillelser", label: "Pantstillelser", values: [531_000_000n, 427_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "cash_and_cash_equivalents", label: "Bankinnskudd og kontanter", values: [607_000_000n, 876_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_bankinnskudd_kontanter_og_lignende", label: "Sum bankinnskudd, kontanter og lignende", values: [607_000_000n, 876_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "current_assets", label: "Sum oml\u00f8psmidler", values: [12_372_000_000n, 11_544_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_assets", label: "SUM EIENDELER", values: [23_227_000_000n, 21_913_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_andelsinnskudd", label: "Andelsinnskudd", values: [693_000_000n, 693_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_innskutt_egenkapital", label: "Sum innskutt egenkapital", values: [693_000_000n, 693_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "retained_earnings", label: "Annen egenkapital", values: [6_939_000_000n, 6_318_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_opptjent_egenkapital", label: "Sum opptjent egenkapital", values: [6_939_000_000n, 6_318_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "non_controlling_interests", label: "Minoritetsinteresser", values: [99_000_000n, 86_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_equity", label: "Sum egenkapital", values: [7_731_000_000n, 7_097_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_pensjonsforpliktelser", label: "Pensjonsforpliktelser", values: [478_000_000n, 461_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_andre_langsiktige_forpliktelser", label: "Andre langsiktige forpliktelser", values: [58_000_000n, 58_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_avsetninger_for_forpliktelser", label: "Sum avsetninger for forpliktelser", values: [536_000_000n, 519_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "bank_debt", label: "Gjeld til kredittinstitusjoner", values: [1_901_000_000n, 1_780_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_langsiktige_innskudd", label: "Langsiktige innskudd", values: [1_681_000_000n, 1_749_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_annen_langsiktig_gjeld", label: "Sum annen langsiktig gjeld", values: [3_582_000_000n, 3_529_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [4_118_000_000n, 4_048_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_kassekreditt", label: "Kassekreditt", values: [9_000_000n, 36_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "accounts_payable", label: "Leverand\u00f8rgjeld", values: [5_230_000_000n, 5_249_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "tax_payable", label: "Betalbar skatt", values: [29_000_000n, 21_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "public_duties_payable", label: "Skyldig offentlige avgifter", values: [327_000_000n, 295_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_kortsiktige_innskudd", label: "Kortsiktige innskudd", values: [3_888_000_000n, 3_484_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_forskudd_fra_kunder", label: "Forskudd fra kunder", values: [140_000_000n, 89_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [1_755_000_000n, 1_594_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [11_378_000_000n, 10_768_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_liabilities", label: "Sum gjeld", values: [15_496_000_000n, 14_816_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [23_227_000_000n, 21_913_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_garantistillelser", label: "Garantistillelser", values: [812_000_000n, 786_000_000n] },
    ];

    return rows.flatMap((row) =>
      row.values.map((value, index) => ({
        fiscalYear: years[index],
        statementType: "BALANCE_SHEET" as const,
        statementScope: row.scope,
        metricKey: row.key,
        rawLabel: row.label,
        value,
        finalInput: value,
        sourcePage: row.page,
        currency: "NOK",
        sourceUnitScale: 1,
        visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-${row.page}.png`],
        sourceRowText: row.label,
        noteReference: null,
        confidenceScore: null,
        rawPayload: { source: "visualSupplement", columnYear: years[index], rawValue: value.toString() },
      })),
    );
  }

  if (entry.filingId === COOP_2023_FILING_ID) {
    const years = [2023, 2022] as const;
    const rows: Array<{
      page: number;
      scope: "COMPANY" | "CONSOLIDATED";
      key: string;
      label: string;
      values: [bigint, bigint];
    }> = [
      { page: 5, scope: "COMPANY", key: "cash_and_cash_equivalents", label: "Bankinnskudd, kontanter o.l.", values: [700_000_000n, 39_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_bankinnskudd_kontanter_og_lignende", label: "Sum bankinnskudd, kontanter og lignende", values: [700_000_000n, 39_000_000n] },
      { page: 5, scope: "COMPANY", key: "current_assets", label: "Sum oml\u00f8psmidler", values: [11_331_000_000n, 10_972_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_assets", label: "SUM EIENDELER", values: [18_730_000_000n, 20_059_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_andelsinnskudd", label: "Andelsinnskudd", values: [693_000_000n, 693_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_innskutt_egenkapital", label: "Sum innskutt egenkapital", values: [693_000_000n, 693_000_000n] },
      { page: 5, scope: "COMPANY", key: "retained_earnings", label: "Annen egenkapital", values: [5_065_000_000n, 4_240_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_opptjent_egenkapital", label: "Sum opptjent egenkapital", values: [5_065_000_000n, 4_240_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_equity", label: "Sum egenkapital", values: [5_758_000_000n, 4_933_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_pensjonsforpliktelser", label: "Pensjonsforpliktelser", values: [441_000_000n, 415_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_andre_langsiktige_forpliktelser", label: "Andre langsiktige forpliktelser", values: [43_000_000n, 114_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_avsetninger_for_forpliktelser", label: "Sum avsetninger for forpliktelser", values: [484_000_000n, 529_000_000n] },
      { page: 5, scope: "COMPANY", key: "bank_debt", label: "Gjeld til kredittinstitusjoner", values: [479_000_000n, 520_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_langsiktige_innskudd", label: "Langsiktige innskudd", values: [1_749_000_000n, 3_078_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_sum_annen_langsiktig_gjeld", label: "Sum annen langsiktig gjeld", values: [2_228_000_000n, 3_598_000_000n] },
      { page: 5, scope: "COMPANY", key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [2_712_000_000n, 4_127_000_000n] },
      { page: 5, scope: "COMPANY", key: "accounts_payable", label: "Leverand\u00f8rgjeld", values: [5_303_000_000n, 4_910_000_000n] },
      { page: 5, scope: "COMPANY", key: "tax_payable", label: "Betalbar skatt", values: [17_000_000n, 13_000_000n] },
      { page: 5, scope: "COMPANY", key: "public_duties_payable", label: "Skyldig offentlige avgifter", values: [125_000_000n, 115_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_kortsiktige_innskudd", label: "Kortsiktige innskudd", values: [3_484_000_000n, 2_898_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_forskudd_fra_kunder", label: "Forskudd fra kunder", values: [69_000_000n, 219_000_000n] },
      { page: 5, scope: "COMPANY", key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [1_262_000_000n, 2_844_000_000n] },
      { page: 5, scope: "COMPANY", key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [10_260_000_000n, 10_999_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_liabilities", label: "Sum gjeld", values: [12_972_000_000n, 15_126_000_000n] },
      { page: 5, scope: "COMPANY", key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [18_730_000_000n, 20_059_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_garantistillelser", label: "Garantistillelser", values: [617_000_000n, 388_000_000n] },
      { page: 5, scope: "COMPANY", key: "as_reported_pantstillelser", label: "Pantstillelser", values: [427_000_000n, 391_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "cash_and_cash_equivalents", label: "Bankinnskudd, kontanter o.l.", values: [876_000_000n, 171_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_bankinnskudd_kontanter_og_lignende", label: "Sum bankinnskudd, kontanter og lignende", values: [876_000_000n, 171_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "current_assets", label: "Sum oml\u00f8psmidler", values: [11_544_000_000n, 11_638_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_assets", label: "SUM EIENDELER", values: [21_913_000_000n, 22_268_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_andelsinnskudd", label: "Andelsinnskudd", values: [693_000_000n, 693_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_innskutt_egenkapital", label: "Sum innskutt egenkapital", values: [693_000_000n, 693_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "retained_earnings", label: "Annen egenkapital", values: [6_318_000_000n, 6_148_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_opptjent_egenkapital", label: "Sum opptjent egenkapital", values: [6_318_000_000n, 6_148_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "non_controlling_interests", label: "Minoritetsinteresser", values: [86_000_000n, 72_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_equity", label: "Sum egenkapital", values: [7_097_000_000n, 6_913_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_pensjonsforpliktelser", label: "Pensjonsforpliktelser", values: [461_000_000n, 437_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_andre_langsiktige_forpliktelser", label: "Andre lansiktige forpliktelser", values: [58_000_000n, 118_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_avsetninger_for_forpliktelser", label: "Sum avsetninger for forpliktelser", values: [519_000_000n, 555_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "bank_debt", label: "Gjeld til kredittinstitusjoner", values: [1_780_000_000n, 1_873_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_langsiktige_innskudd", label: "Langsiktige innskudd", values: [1_749_000_000n, 3_078_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_sum_annen_langsiktig_gjeld", label: "Sum annen langsiktig gjeld", values: [3_529_000_000n, 4_951_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "long_term_liabilities", label: "Sum langsiktig gjeld", values: [4_048_000_000n, 5_506_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_kassekreditt", label: "Kassekreditt", values: [36_000_000n, 31_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "accounts_payable", label: "Leverand\u00f8rgjeld", values: [5_249_000_000n, 4_843_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "tax_payable", label: "Betalbar skatt", values: [21_000_000n, 22_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "public_duties_payable", label: "Skyldig offentlige avgifter", values: [295_000_000n, 281_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_kortsiktige_innskudd", label: "Kortsiktige innskudd", values: [3_484_000_000n, 2_898_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_forskudd_fra_kunder", label: "Forskudd fra kunder", values: [89_000_000n, 238_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "other_current_liabilities", label: "Annen kortsiktig gjeld", values: [1_594_000_000n, 1_536_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "current_liabilities", label: "Sum kortsiktig gjeld", values: [10_768_000_000n, 9_849_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_liabilities", label: "Sum gjeld", values: [14_816_000_000n, 15_355_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "total_equity_and_liabilities", label: "SUM EGENKAPITAL OG GJELD", values: [21_913_000_000n, 22_268_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_garantistillelser", label: "Garantistillelser", values: [786_000_000n, 662_000_000n] },
      { page: 8, scope: "CONSOLIDATED", key: "as_reported_pantstillelser", label: "Pantstillelser", values: [1_762_000_000n, 1_775_000_000n] },
    ];

    return rows.flatMap((row) =>
      row.values.map((value, index) => ({
        fiscalYear: years[index],
        statementType: "BALANCE_SHEET" as const,
        statementScope: row.scope,
        metricKey: row.key,
        rawLabel: row.label,
        value,
        finalInput: value,
        sourcePage: row.page,
        currency: "NOK",
        sourceUnitScale: 1,
        visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-${row.page}.png`],
        sourceRowText: row.label,
        noteReference: null,
        confidenceScore: null,
        rawPayload: { source: "visualSupplement", columnYear: years[index], rawValue: value.toString() },
      })),
    );
  }

  if (entry.filingId !== "cmpf7rzro000dvmusomkntqwu") return [];

  const years = [entry.year, entry.year - 1] as const;
  return [658_785_905n, 355_801_643n].map((value, index) => ({
    fiscalYear: years[index],
    statementType: "INCOME_STATEMENT" as const,
    statementScope: "CONSOLIDATED" as const,
    metricKey: "as_reported_arsresultat",
    rawLabel: "\u00c5rsresultat",
    value,
    finalInput: value,
    sourcePage: 7,
    currency: "NOK",
    sourceUnitScale: 1,
    visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-7.png`],
    sourceRowText: "\u00c5rsresultat 658 785 905 355 801 643",
    noteReference: null,
    confidenceScore: null,
    rawPayload: {
      columnIndex: index,
      rawValue: value.toString(),
      valueSource: "visualSupplement",
      yearOrder: years,
      sectionType: "STATUTORY_INCOME",
    },
  }));
}

function factsFromExtraction(
  entry: ManifestEntry,
  extraction: { rows?: ExtractionRow[]; mappedFacts?: ExtractionFact[] },
) {
  const verifiedPages = new Set(entry.targetPages.filter((page) => page <= 9));
  const mappedFacts = extraction.mappedFacts ?? [];
  const rows = extraction.rows ?? [];
  const facts: FactInput[] = [];
  for (const row of rows) {
    if (!verifiedPages.has(row.pageNumber)) continue;
    if (!statementSection(row.sectionType)) continue;
    const initialRawLabel = cleanRawLabel(lookupRawLabel({ row, mappedFacts }));
    const rawLabel = repairWrappedRawLabel({ rawLabel: initialRawLabel, row, rows });
    if (!rawLabel) continue;
    if (isFragmentOnlyLabel(rawLabel)) continue;
    if (searchableLabel(initialRawLabel) === "skattekostnad" && searchableLabel(rawLabel) === "skattekostnad" && /^skattekostnad\b/.test(row.rowText ?? "")) {
      continue;
    }
    const statementType = statementTypeForRow(row.sectionType, rawLabel);
    if (statementType === "CASH_FLOW") continue;
    let values = reportedValuesForRow(row);
    values = repairReportedValues({ filingId: entry.filingId, rawLabel, row, rows, values });
    if (values.length === 0) continue;
    if (
      values.length === 1 &&
      row.rowText?.trim() &&
      !rowTextContainsLabelText(row.rowText)
    ) {
      continue;
    }
    const metricKey = lookupKey({ row, mappedFacts, rawLabel });
    let statementScope = lookupScope({ row, mappedFacts });
    if (entry.filingId === "cmpf7rzro000dvmusomkntqwu" && row.pageNumber >= 2 && row.pageNumber <= 5) {
      statementScope = "COMPANY";
    }
    if (entry.filingId === "cmpf7rzro000dvmusomkntqwu" && row.pageNumber >= 6) {
      statementScope = "CONSOLIDATED";
    }
    if (entry.filingId === "cmpf7rzra000bvmusjq2317ms" && row.pageNumber >= 6) {
      statementScope = "CONSOLIDATED";
    }
    if (entry.filingId === "cmpf7rzqw0009vmus6mcvtw4o" && row.pageNumber >= 2 && row.pageNumber <= 5) {
      statementScope = "COMPANY";
    }
    if (entry.filingId === "cmq28bcu00030vmecprys6r9o" && row.pageNumber >= 6) {
      statementScope = "CONSOLIDATED";
    }
    if (entry.filingId === POSTEN_2023_FILING_ID && row.pageNumber >= 5) {
      statementScope = "CONSOLIDATED";
    }
    if ([CLAIRE_2024_FILING_ID, CLAIRE_2023_FILING_ID, CLAIRE_2022_FILING_ID].includes(entry.filingId)) {
      statementScope = "COMPANY";
    }
    const fiscalYears = [entry.year, entry.year - 1];
    for (const [index, value] of values.entries()) {
      const fiscalYear = fiscalYears[value.columnIndex] ?? fiscalYears[index];
      if (fiscalYear === undefined) continue;
      facts.push({
        fiscalYear,
        statementType,
        statementScope,
        metricKey,
        rawLabel,
        value: asBigInt(value.value),
        finalInput: asBigInt(value.value),
        sourcePage: row.pageNumber,
        currency: "NOK",
        sourceUnitScale: row.unitScale ?? 1,
        visualEvidencePages: [`${VISUAL_ROOT}/${entry.filingId}/page-${row.pageNumber}.png`],
        sourceRowText: row.rowText ?? null,
        noteReference: row.noteReference ?? null,
        confidenceScore: row.confidence ?? null,
        rawPayload: {
          columnIndex: value.columnIndex,
          rawValue: String(value.value),
          valueSource: value.source,
          yearOrder: fiscalYears,
          sectionType: row.sectionType ?? null,
        },
      });
    }
  }
  return facts;
}

function dedupeFacts(facts: FactInput[]) {
  const seen = new Map<string, number>();
  const deduped: FactInput[] = [];
  for (const fact of facts) {
    let metricKey = fact.metricKey;
    const baseIdentity = `${metricKey}|${fact.statementScope}|${fact.fiscalYear}|${fact.rawLabel.toLowerCase().trim()}`;
    const count = seen.get(baseIdentity) ?? 0;
    seen.set(baseIdentity, count + 1);
    if (count > 0) {
      metricKey = `as_reported_${slug(fact.rawLabel)}_page_${fact.sourcePage ?? "unknown"}_${count + 1}`;
    }
    deduped.push({ ...fact, metricKey });
  }
  return deduped;
}

function jsonBigInt(value: bigint) {
  return value.toString();
}

async function main() {
  const manifest = readJson<ManifestEntry[]>(join(VISUAL_ROOT, "manifest.json"));
  if (existsSync(JOTUN_REPORT_PATH) && !manifest.some((entry) => entry.filingId === "cmq28bbxo0008vmecm33zomyz")) {
    const jotun = readJson<JotunReport>(JOTUN_REPORT_PATH);
    manifest.push({
      filingId: jotun.filingId,
      orgNumber: jotun.orgNumber,
      year: jotun.fiscalYear,
      pdf: "",
      targetPages: [5, 6, 7],
      renderedPages: jotun.renderedPages,
      contactSheet: jotun.renderedPages[0] ?? "",
    });
  }
  const manifestByFiling = new Map(manifest.map((entry) => [entry.filingId, entry]));
  const verifiedFilingIds = [...manifestByFiling.keys()];
  const skippedFilings = new Set<string>([
    // Visually inspected, but the classifier-selected page and broader renders
    // did not expose clean, readable income/balance statement pages.
    "cmq28bdeo004uvmecvmlo0cgc",
  ]);

  const reviews = await prisma.annualReportReview.findMany({
    where: {
      filingId: { in: verifiedFilingIds },
      status: "PENDING_REVIEW",
    },
    orderBy: [{ filingId: "asc" }, { updatedAt: "desc" }],
    include: { filing: { include: { company: true } } },
  });
  const latestReviewByFiling = new Map<string, (typeof reviews)[number]>();
  for (const review of reviews) {
    if (!latestReviewByFiling.has(review.filingId)) {
      latestReviewByFiling.set(review.filingId, review);
    }
  }

  const report: Array<Record<string, unknown>> = [];

  for (const entry of manifest) {
    const review = latestReviewByFiling.get(entry.filingId);
    if (!review) {
      report.push({ filingId: entry.filingId, status: "SKIPPED", reason: "no_pending_review" });
      continue;
    }
    if (skippedFilings.has(entry.filingId)) {
      await prisma.$transaction(async (tx) => {
        await tx.annualReportReviewedFact.deleteMany({ where: { reviewId: review.id } });
        await tx.pdfTrainingLabel.deleteMany({
          where: { reviewId: review.id, labelType: "FACT_VALUE" },
        });
      });
      report.push({
        filingId: entry.filingId,
        reviewId: review.id,
        orgNumber: entry.orgNumber,
        fiscalYear: entry.year,
        status: "SKIPPED",
        reason: "not_visually_verifiable_statement_pages",
        visualEvidence: {
          classifierContactSheet: entry.contactSheet,
          extraContactSheets: [
            `${VISUAL_ROOT}/${entry.filingId}/extra-pages-1-20/contact-sheet.png`,
            `${VISUAL_ROOT}/${entry.filingId}/extra-pages-20-60/contact-sheet.png`,
            `${VISUAL_ROOT}/${entry.filingId}/extra-pages-100-180/contact-sheet.png`,
          ],
        },
      });
      continue;
    }

    let facts: FactInput[];
    if (entry.filingId === "cmq28bcjn0024vmecn1ob6usc") {
      facts = manualReitanFacts();
    } else if (entry.filingId === "cmq28bbxo0008vmecm33zomyz") {
      facts = manualJotunFacts(readJson<JotunReport>(JOTUN_REPORT_PATH));
    } else {
      const extraction = readJson<{ mappedFacts?: ExtractionFact[] }>(
        join(ARTIFACT_ROOT, entry.filingId, "extraction_json", "extraction.json"),
      );
      facts = [...factsFromExtraction(entry, extraction), ...supplementalFactsForExtraction(entry)];
    }
    facts = dedupeFacts(facts);

    if (facts.length === 0) {
      report.push({ filingId: entry.filingId, reviewId: review.id, status: "SKIPPED", reason: "no_statement_facts" });
      continue;
    }

    const validation = validateReviewedFacts(
      facts.map((fact) => ({
        metricKey: fact.metricKey,
        fiscalYear: fact.fiscalYear,
        statementType: fact.statementType,
        statementScope: fact.statementScope,
        value: fact.value,
        unitScale: 1,
        sourcePage: fact.sourcePage,
        rawLabel: fact.rawLabel,
      })),
      entry.filingId === STATKRAFT_2024_FILING_ID
        ? { overriddenRuleCodes: ["IS_NET_INCOME_MATCH"] }
        : {},
    );

    if (validation.hasBlockingErrors) {
      await prisma.$transaction(async (tx) => {
        await tx.annualReportReviewedFact.deleteMany({ where: { reviewId: review.id } });
        await tx.pdfTrainingLabel.deleteMany({
          where: { reviewId: review.id, labelType: "FACT_VALUE" },
        });
      });
      report.push({
        filingId: entry.filingId,
        reviewId: review.id,
        orgNumber: entry.orgNumber,
        fiscalYear: entry.year,
        companyName: review.filing.company.name,
        status: "SKIPPED",
        reason: "blocking_validation_errors_after_visual_pass",
        attemptedFactCount: facts.length,
        visualEvidence: {
          contactSheet: entry.contactSheet,
          pages: [...new Set(facts.map((fact) => fact.sourcePage).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
        },
        validation: serializeValidationPayload(validation, facts.length),
        attemptedFacts: facts.map(reportFact),
      });
      continue;
    }

    const factRows: Prisma.AnnualReportReviewedFactCreateManyInput[] = facts.map((fact) => ({
      reviewId: review.id,
      filingId: review.filingId,
      extractionRunId: review.extractionRunId ?? null,
      companyId: review.companyId,
      fiscalYear: fact.fiscalYear,
      metricKey: fact.metricKey,
      statementType: fact.statementType,
      statementScope: fact.statementScope,
      value: fact.value,
      finalInput: fact.finalInput,
      currency: fact.currency,
      unitScale: 1,
      sourcePage: fact.sourcePage,
      rawLabel: fact.rawLabel,
      correctionSource: "MANUAL_CORRECTION",
      reviewerUserId: REVIEWER_USER_ID,
    }));

    const labelRows: Prisma.PdfTrainingLabelCreateManyInput[] = facts.map((fact) => ({
      filingId: review.filingId,
      extractionRunId: review.extractionRunId ?? null,
      reviewId: review.id,
      reviewerUserId: REVIEWER_USER_ID,
      labelType: "FACT_VALUE",
      targetRef: {
        metricKey: fact.metricKey,
        rawLabel: fact.rawLabel,
        fiscalYear: fact.fiscalYear,
        statementType: fact.statementType,
        statementScope: fact.statementScope,
        sourcePage: fact.sourcePage,
        somRapportert: true,
      } as Prisma.InputJsonValue,
      proposedValue: fact.rawPayload as Prisma.InputJsonValue ?? Prisma.JsonNull,
      acceptedValue: {
        value: jsonBigInt(fact.value),
        finalInput: jsonBigInt(fact.finalInput),
        currency: fact.currency,
        unitScale: 1,
        sourceUnitScale: fact.sourceUnitScale,
        metricKey: fact.metricKey,
        canonicalKey: fact.metricKey,
        rawLabel: fact.rawLabel,
        fiscalYear: fact.fiscalYear,
        statementType: fact.statementType,
        statementScope: fact.statementScope,
        sourcePage: fact.sourcePage,
        asReported: true,
        somRapportert: true,
      } as Prisma.InputJsonValue,
      sourcePayload: {
        evidenceSource: EVIDENCE_SOURCE,
        asReported: true,
        somRapportert: true,
        visualEvidencePages: fact.visualEvidencePages,
        contactSheet: entry.contactSheet,
        sourceRowText: fact.sourceRowText ?? null,
        noteReference: fact.noteReference ?? null,
        confidenceScore: fact.confidenceScore ?? null,
        extractionRunId: review.extractionRunId ?? null,
        orgNumber: entry.orgNumber,
        fiscalYear: entry.year,
      } as Prisma.InputJsonValue,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.annualReportReviewedFact.deleteMany({ where: { reviewId: review.id } });
      await tx.pdfTrainingLabel.deleteMany({
        where: { reviewId: review.id, labelType: "FACT_VALUE" },
      });
      await tx.annualReportReviewedFact.createMany({ data: factRows, skipDuplicates: true });
      await tx.pdfTrainingLabel.createMany({ data: labelRows });
    });

    report.push({
      filingId: entry.filingId,
      reviewId: review.id,
      orgNumber: entry.orgNumber,
      fiscalYear: entry.year,
      companyName: review.filing.company.name,
      status: "SAVED",
      factCount: factRows.length,
      labelCount: labelRows.length,
      visualEvidence: {
        contactSheet: entry.contactSheet,
        pages: [...new Set(facts.map((fact) => fact.sourcePage).filter(Boolean))].sort((a, b) => Number(a) - Number(b)),
      },
      validation: serializeValidationPayload(validation, factRows.length),
    });
  }

  mkdirSync(VISUAL_ROOT, { recursive: true });
  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        evidenceSource: EVIDENCE_SOURCE,
        reviewerUserId: REVIEWER_USER_ID,
        processed: report.filter((item) => item.status === "SAVED").length,
        skipped: report.filter((item) => item.status === "SKIPPED").length,
        totalReviewedFacts: report.reduce((sum, item) => sum + Number(item.factCount ?? 0), 0),
        totalTrainingLabels: report.reduce((sum, item) => sum + Number(item.labelCount ?? 0), 0),
        documents: report,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(readFileSync(REPORT_PATH, "utf8"));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
