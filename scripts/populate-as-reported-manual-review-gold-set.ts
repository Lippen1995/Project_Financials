import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

type ManifestEntry = {
  filingId: string;
  orgNumber: string;
  year: number;
  pdf: string;
  targetPages: number[];
  renderedPages: string[];
  contactSheet: string;
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

function normalizeMetricKey(metricKey: string | null | undefined, rawLabel: string) {
  const clean = metricKey?.trim();
  if (clean) return clean;
  return `as_reported_${slug(rawLabel) || "line"}`;
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
    { page: 23, type: "INCOME_STATEMENT", key: "as_reported_arets_totalresultat", label: "Årets totalresultat", values: [4251, 981] },
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

function lookupKey(input: {
  row: ExtractionRow;
  mappedFacts: ExtractionFact[];
  rawLabel: string;
}) {
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
  }
  return values.slice(0, 2);
}

function factsFromExtraction(
  entry: ManifestEntry,
  extraction: { rows?: ExtractionRow[]; mappedFacts?: ExtractionFact[] },
) {
  const verifiedPages = new Set(entry.targetPages.filter((page) => page <= 9));
  const mappedFacts = extraction.mappedFacts ?? [];
  const facts: FactInput[] = [];
  for (const row of extraction.rows ?? []) {
    if (!verifiedPages.has(row.pageNumber)) continue;
    if (!statementSection(row.sectionType)) continue;
    const rawLabel = lookupRawLabel({ row, mappedFacts });
    if (!rawLabel) continue;
    const statementType = statementTypeForPageSection(row.sectionType);
    if (statementType === "CASH_FLOW") continue;
    const values = valuesWithoutNoteColumn(row);
    if (values.length === 0) continue;
    const metricKey = lookupKey({ row, mappedFacts, rawLabel });
    const statementScope = lookupScope({ row, mappedFacts });
    const fiscalYears = [entry.year, entry.year - 1];
    for (const [index, value] of values.entries()) {
      facts.push({
        fiscalYear: fiscalYears[index],
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
          rawValue: value.value,
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
    } else {
      const extraction = readJson<{ mappedFacts?: ExtractionFact[] }>(
        join(ARTIFACT_ROOT, entry.filingId, "extraction_json", "extraction.json"),
      );
      facts = factsFromExtraction(entry, extraction);
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
