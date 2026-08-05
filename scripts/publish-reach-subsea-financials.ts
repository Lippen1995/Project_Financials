import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { PDFParse } from "pdf-parse";

import { findCanonicalMetricKey } from "@/server/financials/canonical-taxonomy";
import { normalizeNorwegianText } from "@/lib/norwegian-text";
import { prisma } from "@/lib/prisma";

type StatementType = "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW";

type ReportConfig = {
  year: number;
  url: string;
  pages: Record<StatementType, number[]>;
};

type ParsedLine = {
  fiscalYear: number;
  statementType: StatementType;
  originalLabel: string;
  originalValue: string;
  parsedValue: bigint | null;
  metricKey: string;
  unitScale: number;
  sourcePage: number;
  sortOrder: number;
};

const ORG_NUMBER = "922493626";
const SOURCE_SYSTEM = "REACH_SUBSEA_IR";
const PDF_DIR = path.resolve("tmp/pdfs/reach-subsea");
const ARTIFACT_ROOT = path.resolve("output/annual-report-artifacts");
const AUDIT_PATH = path.resolve("output/reach-subsea-2016-2025-financial-audit.json");

const reports: ReportConfig[] = [
  { year: 2016, url: "https://reachsubsea.no/wp-content/uploads/2023/03/REA170452-Arsmelding-2016-web-small.pdf", pages: { INCOME_STATEMENT: [28], BALANCE_SHEET: [29], CASH_FLOW: [30] } },
  { year: 2017, url: "https://reachsubsea.no/wp-content/uploads/2023/03/REA18-405-10-Arsmelding-2017-14.pdf", pages: { INCOME_STATEMENT: [21], BALANCE_SHEET: [22], CASH_FLOW: [22] } },
  { year: 2018, url: "https://reachsubsea.no/wp-content/uploads/2023/03/Reach-Subsea-ASA-Annual-Report-2018.pdf", pages: { INCOME_STATEMENT: [24], BALANCE_SHEET: [25], CASH_FLOW: [25] } },
  { year: 2019, url: "https://reachsubsea.no/wp-content/uploads/2023/03/REACH-SUBSEA-ASA-Group-Annual-Report-2019.pdf", pages: { INCOME_STATEMENT: [60], BALANCE_SHEET: [61], CASH_FLOW: [62] } },
  { year: 2020, url: "https://reachsubsea.no/wp-content/uploads/2023/03/Reach-Subsea-ASA-Group-Annual-Report-2020.pdf", pages: { INCOME_STATEMENT: [48], BALANCE_SHEET: [49], CASH_FLOW: [50] } },
  { year: 2021, url: "https://reachsubsea.no/wp-content/uploads/2023/03/Reach-Subsea-Annual-Report-2021.pdf", pages: { INCOME_STATEMENT: [47], BALANCE_SHEET: [48, 49], CASH_FLOW: [50] } },
  { year: 2022, url: "https://reachsubsea.no/wp-content/uploads/2023/03/Reach-Subsea-ASA-Annual-Report-2022.pdf", pages: { INCOME_STATEMENT: [44], BALANCE_SHEET: [45, 46], CASH_FLOW: [47] } },
  { year: 2023, url: "https://reachsubsea.no/wp-content/uploads/2024/04/Reach-Subsea-ASA_Annual-and-Sustainability-Report-2023.pdf", pages: { INCOME_STATEMENT: [85], BALANCE_SHEET: [86, 87], CASH_FLOW: [88] } },
  { year: 2024, url: "https://reachsubsea.no/wp-content/uploads/2025/04/Reach-Subsea-ASA_Annual-and-Sustainability-Report-2024.pdf", pages: { INCOME_STATEMENT: [120], BALANCE_SHEET: [121, 122], CASH_FLOW: [123] } },
  { year: 2025, url: "https://reachsubsea.no/wp-content/uploads/2026/04/Annual-and-Sustainability-Report-2025.pdf", pages: { INCOME_STATEMENT: [87], BALANCE_SHEET: [88, 89], CASH_FLOW: [90] } },
];

const keyRules: Array<[RegExp, string]> = [
  [/^revenues?$/, "revenue"],
  [/^other income losses$/, "other_operating_income"],
  [/^operating income in total$/, "total_operating_income"],
  [/^operating costs? in total$/, "total_operating_expenses"],
  [/^operating results?$/, "operating_profit"],
  [/^finance (income|items) net$/, "net_financial_items"],
  [/^profit loss before taxes$/, "profit_before_tax"],
  [/^taxes$/, "tax_expense"],
  [/^profit loss for the year$/, "net_income"],
  [/^non current assets in total$/, "total_non_current_assets"],
  [/^current assets in total$/, "total_current_assets"],
  [/^assets in total$/, "total_assets"],
  [/^total assets$/, "total_assets"],
  [/^equity in total$/, "total_equity"],
  [/^total equity$/, "total_equity"],
  [/^non current liabilities in total$/, "long_term_liabilities"],
  [/^current liabilities in total$/, "current_liabilities"],
  [/^total current liabilities$/, "current_liabilities"],
  [/^equity and liabilities in total$/, "total_equity_and_liabilities"],
  [/^total equity and liabilities$/, "total_equity_and_liabilities"],
  [/^profit before tax$/, "cash_flow_profit_before_tax"],
  [/^operating result$/, "cash_flow_operating_profit"],
  [/^paid taxes$/, "cash_flow_taxes_paid"],
  [/^depreciation and amortisation$/, "cash_flow_depreciation_amortisation"],
  [/^depreciation$/, "cash_flow_depreciation_amortisation"],
  [/^change in trade debtors$/, "cash_flow_change_trade_receivables"],
  [/^change in trade creditors$/, "cash_flow_change_trade_payables"],
  [/^change in other (provision|accruals)$/, "cash_flow_change_other_working_capital"],
  [/^share option cost employees$/, "cash_flow_share_based_payments"],
  [/^ifrs 2 share based payments$/, "cash_flow_share_based_payments"],
  [/^net cash flow from (operations|operating activities).*$/, "net_cash_from_operating_activities"],
  [/^net cash flow (used in investments|from (?:investment activit(?:ies|ites)|investing activities)).*$/, "net_cash_from_investing_activities"],
  [/^net cash flow from financing activities.*$/, "net_cash_from_financing_activities"],
  [/^net cash flow for the year.*$/, "net_change_in_cash"],
  [/^cash and cash equivalents (in the start of the period(?: 1 1)?|1 1|01 01)$/, "opening_cash_and_cash_equivalents"],
  [/^cash and cash equivalents (31 12|31 12 12)$/, "closing_cash_and_cash_equivalents"],
  [/^translation differences$/, "translation_differences"],
];

function normalizedLabel(label: string) {
  return normalizeNorwegianText(label)
    .replace(/[()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function metricKeyFor(label: string, statementType: StatementType) {
  const normalized = normalizedLabel(label);
  for (const [pattern, key] of keyRules) {
    if (pattern.test(normalized)) return key;
  }
  if (statementType !== "CASH_FLOW") {
    const family = statementType === "BALANCE_SHEET" ? "BALANCE_SHEET" : "INCOME_STATEMENT";
    const canonical = findCanonicalMetricKey(label, family);
    if (canonical) return canonical;
  }
  return `as_reported_${normalized.replace(/\s+/g, "_") || "line"}`;
}

function parseInteger(raw: string): bigint | null {
  const trimmed = raw.trim();
  if (trimmed === "-" || trimmed === "–" || trimmed === "—") return null;
  const negativeByParentheses = /^\(.*\)$/.test(trimmed);
  const commaIsThousandsSeparator = /^\(?[-−]?\d{1,3}(?:,\d{3})+\)?$/.test(trimmed);
  const withoutSign = trimmed
    .replace(/[()\s]/g, "")
    .replace(/^[-−]/, "")
    .replace(commaIsThousandsSeparator ? /,/g : /$^/, "");
  if (!/^\d+$/.test(withoutSign)) return null;
  const value = BigInt(withoutSign);
  return negativeByParentheses || /^[-−]/.test(trimmed) ? -value : value;
}

function isReportedValue(raw: string) {
  const trimmed = raw.trim();
  return /^[-–—]$/.test(trimmed) || /^\(?[-−]?\d[\d\s]*(?:[.,]\d+)?\)?$/.test(trimmed);
}

function splitReportedRow(rawLine: string) {
  const tabParts = rawLine.split(/\t+/).map((part) => part.trim()).filter(Boolean);
  if (tabParts.length >= 2) return tabParts;
  const number = String.raw`(?:\([-−]?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d+)?\)|[-−]?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d+)?|[-–—])`;
  const match = rawLine.trim().match(new RegExp(`^(.*?)\\s+(${number})\\s+(${number})$`));
  return match ? [match[1], match[2], match[3]] : tabParts;
}

function disambiguateRepeatedBalanceRows(lines: ParsedLine[]) {
  const groups = new Map<string, ParsedLine[]>();
  for (const line of lines.filter((item) => item.statementType === "BALANCE_SHEET")) {
    const key = `${line.metricKey}:${normalizedLabel(line.originalLabel)}`;
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length !== 2) continue;
    group[0].metricKey = `${group[0].metricKey}_non_current`;
    group[1].metricKey = `${group[1].metricKey}_current`;
  }
}

async function extractReport(config: ReportConfig) {
  const pdfPath = path.join(PDF_DIR, `reach-subsea-${config.year}.pdf`);
  const buffer = await fs.readFile(pdfPath);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const parser = new PDFParse({ data: buffer });
  const lines: ParsedLine[] = [];
  try {
    const text = await parser.getText();
    const byPage = new Map(text.pages.map((page) => [page.num, page.text]));
    const pageUseCount = new Map<number, number>();
    for (const pageNumbers of Object.values(config.pages)) {
      for (const pageNumber of pageNumbers) pageUseCount.set(pageNumber, (pageUseCount.get(pageNumber) ?? 0) + 1);
    }
    let sortOrder = 0;
    for (const statementType of ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"] as const) {
      for (const pageNumber of config.pages[statementType]) {
        let pageText = byPage.get(pageNumber);
        if (!pageText) throw new Error(`${config.year}: PDF-side ${pageNumber} mangler.`);
        if ((pageUseCount.get(pageNumber) ?? 0) > 1) {
          const balanceMarker = "Consolidated statement of financial position";
          const cashMarker = "Consolidated statement of cash flow";
          if (statementType === "BALANCE_SHEET") {
            const start = pageText.indexOf(balanceMarker);
            const end = pageText.indexOf(cashMarker);
            if (start < 0 || end <= start) throw new Error(`${config.year}: fant ikke balanse/kontantstrøm-segment på PDF-side ${pageNumber}.`);
            pageText = pageText.slice(start, end);
          } else if (statementType === "CASH_FLOW") {
            const start = pageText.indexOf(cashMarker);
            if (start < 0) throw new Error(`${config.year}: fant ikke kontantstrøm-segment på PDF-side ${pageNumber}.`);
            pageText = pageText.slice(start);
          }
        }
        let pendingLabel: string | null = null;
        for (const rawLine of pageText.split(/\r?\n/)) {
          const parts = splitReportedRow(rawLine);
          if (parts.length < 2) {
            const candidate = rawLine.trim();
            pendingLabel = candidate && !/^(assets|equity|operations|investments|financing|current assets|current liabilities|non-current assets|non-current liabilities)$/i.test(candidate)
              ? candidate
              : null;
            continue;
          }
          let [label, ownYearValue] = parts;
          if (/^\(\d(?:\+\d)*\)$/.test(ownYearValue ?? "") && parts[2]) {
            ownYearValue = parts[2];
          }
          const mergedCashValue = label?.match(/^(cash and cash equivalents\s+(?:01[./]01|31[./]12))\s+([-−]?\d[\d ]*)$/i);
          const mergedOwnValue = label?.match(/^(.*\D)\s+(\(?[-−]?\d{1,3}(?:[ ,]\d{3})*\)?)$/);
          if (mergedCashValue) {
            label = mergedCashValue[1];
            ownYearValue = mergedCashValue[2];
          } else if (mergedOwnValue && mergedOwnValue[2].replace(/\D/g, "").length >= 2 && isReportedValue(parts[1] ?? "")) {
            label = mergedOwnValue[1].trim();
            ownYearValue = mergedOwnValue[2];
            if (pendingLabel && /^(accounted\b|of\b)/i.test(label)) label = `${pendingLabel} ${label}`;
          }
          if (config.year === 2018 && statementType === "BALANCE_SHEET" && label === "10 048" && ownYearValue === "-") {
            label = "Proposed dividends";
            ownYearValue = "10 048";
          }
          pendingLabel = null;
          if (!label || !ownYearValue || !isReportedValue(ownYearValue)) continue;
          if (/^(nok\s*1000|20\d{2}|notes?|\d+)$/i.test(label)) continue;
          if (/^nok(?:\s+\d+)+$/.test(normalizedLabel(label))) continue;
          lines.push({
            fiscalYear: config.year,
            statementType,
            originalLabel: label,
            originalValue: ownYearValue,
            parsedValue: parseInteger(ownYearValue),
            metricKey: metricKeyFor(label, statementType),
            unitScale: 1000,
            sourcePage: pageNumber,
            sortOrder: sortOrder++,
          });
        }
      }
    }
    disambiguateRepeatedBalanceRows(lines);
  } finally {
    await parser.destroy();
  }
  return { config, pdfPath, hash, lines };
}

function lineValue(lines: ParsedLine[], type: StatementType, pattern: RegExp) {
  const row = lines.find((line) => line.statementType === type && pattern.test(normalizedLabel(line.originalLabel)));
  return row?.parsedValue ?? null;
}

function requireValue(value: bigint | null, message: string): bigint {
  if (value === null) throw new Error(message);
  return value;
}

function abs(value: bigint) {
  return value < 0n ? -value : value;
}

function validateReport(year: number, lines: ParsedLine[]) {
  const counts = {
    income: lines.filter((line) => line.statementType === "INCOME_STATEMENT").length,
    balance: lines.filter((line) => line.statementType === "BALANCE_SHEET").length,
    cashFlow: lines.filter((line) => line.statementType === "CASH_FLOW").length,
  };
  if (counts.income < 15 || counts.balance < 15 || counts.cashFlow < 15) {
    throw new Error(`${year}: for få linjer ekstrahert: ${JSON.stringify(counts)}.`);
  }

  const assets = requireValue(lineValue(lines, "BALANCE_SHEET", /^(assets in total|total assets)$/), `${year}: total assets mangler.`);
  const equityAndLiabilities = requireValue(lineValue(lines, "BALANCE_SHEET", /^(equity and liabilities in total|total equity and liabilities)$/), `${year}: total equity and liabilities mangler.`);
  if (assets !== equityAndLiabilities) {
    throw new Error(`${year}: balansen avstemmer ikke (${assets} mot ${equityAndLiabilities}).`);
  }

  const operating = requireValue(lineValue(lines, "CASH_FLOW", /^net cash flow from (operations|operating activities)/), `${year}: operasjonell kontantstrøm mangler.`);
  const investing = requireValue(lineValue(lines, "CASH_FLOW", /^net cash flow (used in investments|from (?:investment activit(?:ies|ites)|investing activities))/), `${year}: investeringskontantstrøm mangler.`);
  const financing = requireValue(lineValue(lines, "CASH_FLOW", /^net cash flow from financing activities/), `${year}: finansieringskontantstrøm mangler.`);
  const netChange = requireValue(lineValue(lines, "CASH_FLOW", /^net cash flow for the year/), `${year}: netto kontantstrøm mangler.`);
  const flowDifference = operating + investing + financing - netChange;
  if (abs(flowDifference) > 1n) {
    throw new Error(`${year}: kontantstrømsummer avviker (${operating} + ${investing} + ${financing} != ${netChange}).`);
  }

  const openingCash = requireValue(lineValue(lines, "CASH_FLOW", /^cash and cash equivalents (in the start of the period(?: 1 1)?|1 1|01 01)$/), `${year}: inngående kontanter mangler.`);
  const closingCash = requireValue(lineValue(lines, "CASH_FLOW", /^cash and cash equivalents (31 12|31 12 12)$/), `${year}: utgående kontanter mangler.`);
  const translation = lineValue(lines, "CASH_FLOW", /^translation differences$/) ?? 0n;
  const cashDifference = openingCash + netChange + translation - closingCash;
  if (abs(cashDifference) > 1n) {
    throw new Error(`${year}: kontantbeholdning avstemmer ikke (differanse ${cashDifference}).`);
  }

  const requiredIncome = [
    /^operating income in total$/,
    /^operating results?$/,
    /^profit loss before taxes$/,
    /^profit loss for the year$/,
  ];
  for (const pattern of requiredIncome) {
    requireValue(lineValue(lines, "INCOME_STATEMENT", pattern), `${year}: obligatorisk resultatlinje ${pattern} mangler.`);
  }

  return { counts, assets, equityAndLiabilities, operating, investing, financing, netChange, flowDifference, openingCash, translation, closingCash, cashDifference };
}

function summaryFor(lines: ParsedLine[]) {
  return {
    revenue: lineValue(lines, "INCOME_STATEMENT", /^operating income in total$/) ?? lineValue(lines, "INCOME_STATEMENT", /^revenues?$/),
    operatingProfit: lineValue(lines, "INCOME_STATEMENT", /^operating results?$/),
    netIncome: lineValue(lines, "INCOME_STATEMENT", /^profit loss for the year$/),
    equity: lineValue(lines, "BALANCE_SHEET", /^(equity in total|total equity)$/),
    assets: lineValue(lines, "BALANCE_SHEET", /^(assets in total|total assets)$/),
  };
}

function normalizedPayloadFor(year: number, lines: ParsedLine[], hash: string, pages: ReportConfig["pages"]) {
  const summary = summaryFor(lines);
  const totalOperatingExpenses = lineValue(lines, "INCOME_STATEMENT", /^operating costs? in total$/);
  const profitBeforeTax = lineValue(lines, "INCOME_STATEMENT", /^profit loss before taxes$/);
  const longTermLiabilities = lineValue(lines, "BALANCE_SHEET", /^non current liabilities in total$/);
  const currentLiabilities = lineValue(lines, "BALANCE_SHEET", /^(current liabilities in total|total current liabilities)$/);
  const totalEquityAndLiabilities = lineValue(lines, "BALANCE_SHEET", /^(equity and liabilities in total|total equity and liabilities)$/);
  const toNumber = (value: bigint | null) => value === null ? null : Number(value);
  const canonicalOperatingExpenses = totalOperatingExpenses === null ? null : abs(totalOperatingExpenses);
  const canonicalNetFinancialItems = profitBeforeTax !== null && summary.operatingProfit !== null
    ? profitBeforeTax - summary.operatingProfit
    : null;
  const canonicalTaxExpense = profitBeforeTax !== null && summary.netIncome !== null
    ? profitBeforeTax - summary.netIncome
    : null;
  return {
    valuta: "NOK",
    regnskapsperiode: { fraDato: `${year}-01-01`, tilDato: `${year}-12-31` },
    resultatregnskapResultat: {
      driftsresultat: {
        driftsinntekter: { sumDriftsinntekter: toNumber(summary.revenue) },
        driftskostnad: { sumDriftskostnad: toNumber(canonicalOperatingExpenses) },
        driftsresultat: toNumber(summary.operatingProfit),
      },
      finansresultat: { nettoFinans: toNumber(canonicalNetFinancialItems) },
      ordinaertResultatFoerSkattekostnad: toNumber(profitBeforeTax),
      skattekostnadResultat: toNumber(canonicalTaxExpense),
      aarsresultat: toNumber(summary.netIncome),
      totalresultat: toNumber(summary.netIncome),
    },
    eiendeler: { sumEiendeler: toNumber(summary.assets) },
    egenkapitalGjeld: {
      egenkapital: { sumEgenkapital: toNumber(summary.equity) },
      gjeldOversikt: {
        langsiktigGjeld: { sumLangsiktigGjeld: toNumber(longTermLiabilities) },
        kortsiktigGjeld: { sumKortsiktigGjeld: toNumber(currentLiabilities) },
        sumGjeld: summary.assets !== null && summary.equity !== null ? Number(summary.assets - summary.equity) : null,
      },
      sumEgenkapitalGjeld: toNumber(totalEquityAndLiabilities),
    },
    _provenance: { sourceSystem: SOURCE_SYSTEM, sha256: hash, pages, visuallyVerified: true },
  };
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}

async function publishReport(input: Awaited<ReturnType<typeof extractReport>>, companyId: string) {
  const now = new Date();
  const sourceId = `reach-subsea-annual-report-${input.config.year}-${input.hash}`;
  const sourceIdempotencyKey = `${SOURCE_SYSTEM}:${ORG_NUMBER}:${input.config.year}:${input.hash}`;

  const filing = await prisma.$transaction(async (tx) => {
    await tx.annualReportFiling.updateMany({
      where: { companyId, fiscalYear: input.config.year },
      data: { isLatestForFiscalYear: false },
    });
    return tx.annualReportFiling.upsert({
      where: { sourceIdempotencyKey },
      create: {
        companyId,
        fiscalYear: input.config.year,
        sourceSystem: SOURCE_SYSTEM,
        sourceUrl: input.config.url,
        sourceDiscoveryKey: `reach-subsea-ir:${input.config.year}`,
        sourceIdempotencyKey,
        sourceDocumentHash: input.hash,
        sourceDocumentType: "ANNUAL_REPORT_PDF",
        discoveredAt: now,
        downloadedAt: now,
        processingStartedAt: now,
        preflightedAt: now,
        extractedAt: now,
        validatedAt: now,
        publishedSnapshotAt: now,
        manualReviewAt: now,
        status: "PUBLISHED",
        unitHints: { currency: "NOK", unitScale: 1000, printedUnit: "NOK 1000" },
        metadata: { source: "official Reach Subsea investor relations website", visuallyVerified: true, pages: input.config.pages },
        parserVersionLastTried: "reach-subsea-visual-review-v1",
        isLatestForFiscalYear: true,
      },
      update: {
        sourceUrl: input.config.url,
        sourceDocumentHash: input.hash,
        downloadedAt: now,
        extractedAt: now,
        validatedAt: now,
        publishedSnapshotAt: now,
        manualReviewAt: now,
        status: "PUBLISHED",
        unitHints: { currency: "NOK", unitScale: 1000, printedUnit: "NOK 1000" },
        metadata: { source: "official Reach Subsea investor relations website", visuallyVerified: true, pages: input.config.pages },
        parserVersionLastTried: "reach-subsea-visual-review-v1",
        lastError: null,
        isLatestForFiscalYear: true,
      },
    });
  });

  const artifactDir = path.join(ARTIFACT_ROOT, filing.id, "pdf");
  await fs.mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, `reach-subsea-${input.config.year}.pdf`);
  await fs.copyFile(input.pdfPath, artifactPath);

  const summary = summaryFor(input.lines);
  const normalizedPayload = normalizedPayloadFor(input.config.year, input.lines, input.hash, input.config.pages);
  await prisma.$transaction(async (tx) => {
    await tx.annualReportArtifact.upsert({
      where: { filingId_artifactType_checksum: { filingId: filing.id, artifactType: "PDF", checksum: input.hash } },
      create: { filingId: filing.id, artifactType: "PDF", storageKey: artifactPath, checksum: input.hash, mimeType: "application/pdf", metadata: { sourceUrl: input.config.url } },
      update: { storageKey: artifactPath, metadata: { sourceUrl: input.config.url } },
    });
    await tx.publishedFinancialLineItem.deleteMany({ where: { filingId: filing.id, publicationSource: "MANUAL_REVIEW" } });
    await tx.publishedFinancialLineItem.createMany({
      data: input.lines.map((line) => ({
        companyId,
        filingId: filing.id,
        fiscalYear: line.fiscalYear,
        statementType: line.statementType,
        statementScope: "CONSOLIDATED",
        metricKey: line.metricKey,
        rawLabel: line.originalLabel,
        originalLabel: line.originalLabel,
        originalValue: line.originalValue,
        parsedValue: line.parsedValue,
        value: line.parsedValue,
        finalInput: line.parsedValue,
        currency: "NOK",
        unitScale: line.unitScale,
        sourcePage: line.sourcePage,
        sortOrder: line.sortOrder,
        publicationSource: "MANUAL_REVIEW",
        sourceSystem: SOURCE_SYSTEM,
        sourceEntityType: "annualReportConsolidatedFinancialStatement",
        sourceId: `${sourceId}:p${line.sourcePage}:r${line.sortOrder}`,
        extractionRoute: "PDF_VISUAL_REVIEW",
        confidence: 1,
        fetchedAt: now,
        normalizedAt: now,
        publishedAt: now,
      })),
    });
    await tx.financialStatement.upsert({
      where: { companyId_fiscalYear_statementScope: { companyId, fiscalYear: input.config.year, statementScope: "CONSOLIDATED" } },
      create: {
        companyId,
        fiscalYear: input.config.year,
        statementScope: "CONSOLIDATED",
        currency: "NOK",
        ...summary,
        sourceSystem: SOURCE_SYSTEM,
        sourceEntityType: "annualReportConsolidatedFinancialStatement",
        sourceId,
        fetchedAt: now,
        normalizedAt: now,
        rawPayload: normalizedPayload as Prisma.InputJsonValue,
        sourceFilingId: filing.id,
        qualityStatus: "MANUAL_REVIEW",
        qualityScore: 1,
        unitScale: 1000,
        sourcePrecedence: "STATUTORY_NOK",
        publishedAt: now,
      },
      update: {
        currency: "NOK",
        ...summary,
        sourceSystem: SOURCE_SYSTEM,
        sourceEntityType: "annualReportConsolidatedFinancialStatement",
        sourceId,
        fetchedAt: now,
        normalizedAt: now,
        rawPayload: normalizedPayload as Prisma.InputJsonValue,
        sourceFilingId: filing.id,
        sourceExtractionRunId: null,
        qualityStatus: "MANUAL_REVIEW",
        qualityScore: 1,
        unitScale: 1000,
        sourcePrecedence: "STATUTORY_NOK",
        publishedAt: now,
      },
    });
  });
  return filing.id;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const extracted = [];
  for (const report of reports) {
    const result = await extractReport(report);
    const validation = validateReport(report.year, result.lines);
    extracted.push({ ...result, validation, summary: summaryFor(result.lines) });
  }

  await fs.mkdir(path.dirname(AUDIT_PATH), { recursive: true });
  await fs.writeFile(
    AUDIT_PATH,
    JSON.stringify(jsonSafe({ generatedAt: new Date().toISOString(), orgNumber: ORG_NUMBER, sourceSystem: SOURCE_SYSTEM, reports: extracted.map(({ config, hash, validation, summary, lines }) => ({ year: config.year, sourceUrl: config.url, pages: config.pages, sha256: hash, validation, summary, lineCount: lines.length, lines })) }), null, 2),
    "utf8",
  );

  console.log(JSON.stringify(jsonSafe(extracted.map(({ config, hash, validation, summary, lines }) => ({ year: config.year, sha256: hash, validation, summary, lineCount: lines.length }))), null, 2));
  console.log(`Audit: ${AUDIT_PATH}`);
  if (!apply) {
    console.log("Dry-run fullført. Bruk --apply for å publisere.");
    return;
  }

  const company = await prisma.company.findUnique({ where: { orgNumber: ORG_NUMBER }, select: { id: true, name: true } });
  if (!company) throw new Error(`Selskap ${ORG_NUMBER} finnes ikke i databasen.`);
  const filingIds: string[] = [];
  for (const report of extracted) filingIds.push(await publishReport(report, company.id));
  const now = new Date();
  await prisma.companyFinancialCoverage.upsert({
    where: { companyId: company.id },
    create: { companyId: company.id, latestDiscoveredFiscalYear: 2025, latestDownloadedFiscalYear: 2025, latestPublishedFiscalYear: 2025, lastCheckedAt: now, nextCheckAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), coverageStatus: "PUBLISHED", latestSuccessfulFilingId: filingIds.at(-1) },
    update: { latestDiscoveredFiscalYear: 2025, latestDownloadedFiscalYear: 2025, latestPublishedFiscalYear: 2025, lastCheckedAt: now, nextCheckAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), coverageStatus: "PUBLISHED", latestSuccessfulFilingId: filingIds.at(-1), failureCount: 0 },
  });
  console.log(`Publisert ${extracted.reduce((sum, report) => sum + report.lines.length, 0)} linjer for ${company.name}, 2016-2025.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
