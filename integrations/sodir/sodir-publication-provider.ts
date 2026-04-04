import * as cheerio from "cheerio";
import * as XLSX from "xlsx";

import { fetchText } from "@/integrations/http";
import {
  PetroleumForecastSnapshotRecord,
  PetroleumPublicationSnapshotRecord,
  PetroleumPublicationsSyncPayload,
} from "@/server/services/petroleum-market-types";

const SODIR_BASE_URL = "https://www.sodir.no";

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function absolutizeUrl(value?: string | null) {
  if (!value) return null;
  return value.startsWith("http") ? value : new URL(value, SODIR_BASE_URL).toString();
}

function titleCaseSlug(value: string) {
  const replacements: Record<string, string> = {
    sokkelaret: "Sokkelåret",
    produksjonstal: "Produksjonstal",
  };

  return value
    .split("-")
    .filter(Boolean)
    .map((part) =>
      replacements[part.toLowerCase()] ??
      (/^\d+$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`),
    )
    .join(" ");
}

function getFallbackTitle(detailUrl: string, fallback: string) {
  const slug = detailUrl.split("/").filter(Boolean).at(-1);
  if (!slug) {
    return fallback;
  }

  return titleCaseSlug(slug);
}

function resolvePageTitle(html: string, detailUrl: string, fallback: string) {
  const $ = cheerio.load(html);
  const heading =
    normalizeWhitespace($("meta[property='og:title']").attr("content") ?? "") ||
    normalizeWhitespace($("title").text()) ||
    normalizeWhitespace($("h1").first().text());

  if (!heading || heading === "Sokkeldirektoratet" || heading === "Sammendrag") {
    return getFallbackTitle(detailUrl, fallback);
  }

  return heading.replace(/\s*\|\s*Sokkeldirektoratet.*$/i, "");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseNorwegianDate(value?: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

function parsePublishedAtFromText(text: string) {
  const direct = parseNorwegianDate(text);
  if (direct) return direct;
  const updatedMatch = text.match(/Oppdatert:\s*(\d{2}\.\d{2}\.\d{4})/i);
  return parseNorwegianDate(updatedMatch?.[1] ?? null);
}

function extractParagraphs(html: string) {
  const $ = cheerio.load(html);
  return $("main p")
    .toArray()
    .map((node) => normalizeWhitespace($(node).text()))
    .filter(Boolean);
}

function extractLinkByText(html: string, pattern: RegExp) {
  const $ = cheerio.load(html);
  for (const node of $("a").toArray()) {
    const text = normalizeWhitespace($(node).text());
    const href = $(node).attr("href");
    if (href && pattern.test(`${text} ${href}`)) {
      return absolutizeUrl(href);
    }
  }

  return null;
}

async function extractWorkbookSheetNames(url?: string | null) {
  if (!url) return [];
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) {
    return [];
  }

  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
  return workbook.SheetNames;
}

async function resolveLatestReportUrl(listUrl: string, hrefPattern: RegExp) {
  const html = await fetchText(listUrl, undefined, 60_000);
  const $ = cheerio.load(html);
  const candidates = $("a")
    .toArray()
    .map((node) => ({
      href: $(node).attr("href"),
      text: normalizeWhitespace($(node).text()),
    }))
    .filter((item) => item.href && hrefPattern.test(item.href));

  const href = candidates[0]?.href;
  return href ? absolutizeUrl(href) : null;
}

function extractLongTermForecastPoints(paragraphs: string[]) {
  return paragraphs
    .filter((paragraph) => /forvent|investering|produksjonsfallet|gassproduksjonen/i.test(paragraph))
    .slice(0, 4);
}

function parseInvestmentLevelNok(paragraphs: string[]) {
  for (const paragraph of paragraphs) {
    const match = paragraph.match(/investeringer for\s+(\d+)\s+milliarder kroner/i);
    if (match) {
      return BigInt(match[1]) * 1_000_000_000n;
    }
  }

  return null;
}

function parseMonthlyProductionMetrics(text: string) {
  const normalized = normalizeWhitespace(text);
  const match = normalized.match(
    /Produksjon\s+[A-Za-zæøåÆØÅ]+\s+\d{4}\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+Prognose for\s+[A-Za-zæøåÆØÅ]+\s+\d{4}\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i,
  );

  if (!match) {
    return null;
  }

  const toNumber = (value: string) => Number(value.replace(",", "."));

  return {
    actual: {
      oil: toNumber(match[1]),
      liquids: toNumber(match[2]),
      gas: toNumber(match[3]),
      oe: toNumber(match[4]),
    },
    forecast: {
      oil: toNumber(match[5]),
      liquids: toNumber(match[6]),
      gas: toNumber(match[7]),
      oe: toNumber(match[8]),
    },
  };
}

async function fetchLatestMonthlyProductionPublication() {
  const detailUrl = await resolveLatestReportUrl(
    `${SODIR_BASE_URL}/aktuelt/nyheter/produksjonstal/`,
    /\/aktuelt\/nyheter\/produksjonstal\/\d{4}\//i,
  );
  if (!detailUrl) {
    return null;
  }

  const html = await fetchText(detailUrl, undefined, 60_000);
  const paragraphs = extractParagraphs(html);
  const text = normalizeWhitespace(cheerio.load(html)("main").text());
  const title = resolvePageTitle(html, detailUrl, "Produksjonstall");
  const publishedAt = parsePublishedAtFromText(text);
  const backgroundDataUrl = extractLinkByText(html, /bakgrunnstall|excel/i);
  const sheetNames = await extractWorkbookSheetNames(backgroundDataUrl);
  const metrics = parseMonthlyProductionMetrics(text);

  const publication = {
    externalId: `sodir-monthly-production:${detailUrl}`,
    category: "MONTHLY_PRODUCTION",
    title,
    summary: paragraphs[0] ?? null,
    publishedAt,
    detailUrl,
    backgroundDataUrl,
    pdfUrl: extractLinkByText(html, /last ned pdf/i),
    sheetNames,
    sourceSystem: "SODIR",
    sourceEntityType: "monthly_production_publication",
    sourceId: detailUrl,
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    rawPayload: {
      metrics,
      paragraphs,
    },
  } satisfies PetroleumPublicationSnapshotRecord;

  const forecast = {
    externalId: `sodir-monthly-forecast:${detailUrl}`,
    scope: "NCS",
    sourceLabel: "SODIR Produksjonstal",
    title,
    summary: paragraphs[0] ?? null,
    publishedAt,
    horizonLabel: "Kort sikt",
    appliesToProduct: "oe",
    forecastScopeLabel: "Hele norsk sokkel",
    trendLabel: "Månedlig produksjon mot prognose",
    declineRatePercent: null,
    investmentLevelNok: null,
    detailUrl,
    backgroundDataUrl,
    keyPoints: paragraphs.slice(0, 3),
    sourceSystem: "SODIR",
    sourceEntityType: "monthly_production_forecast",
    sourceId: detailUrl,
    fetchedAt: publication.fetchedAt,
    normalizedAt: publication.normalizedAt,
    rawPayload: {
      metrics,
    },
  } satisfies PetroleumForecastSnapshotRecord;

  return { publication, forecast };
}

async function fetchLatestShelfYearPublication() {
  const reportUrl = await resolveLatestReportUrl(
    `${SODIR_BASE_URL}/aktuelt/publikasjoner/rapporter/sokkelaret/`,
    /\/aktuelt\/publikasjoner\/rapporter\/sokkelaret\/sokkelaret-\d{4}\//i,
  );
  if (!reportUrl) {
    return null;
  }

  const summaryUrl = absolutizeUrl(`${reportUrl}sammendrag/`) ?? reportUrl;
  const forwardUrl = absolutizeUrl(`${reportUrl}olje-og-gass-pa-sokkelen-framover/`) ?? reportUrl;
  const [summaryHtml, forwardHtml] = await Promise.all([
    fetchText(summaryUrl, undefined, 60_000),
    fetchText(forwardUrl, undefined, 60_000),
  ]);

  const summaryParagraphs = extractParagraphs(summaryHtml);
  const forwardParagraphs = extractParagraphs(forwardHtml);
  const title = resolvePageTitle(summaryHtml, reportUrl, "Sokkelåret");
  const summaryText = normalizeWhitespace(cheerio.load(summaryHtml)("main").text());
  const backgroundDataUrl = extractLinkByText(forwardHtml, /bakgrunnstall|excel/i);
  const sheetNames = await extractWorkbookSheetNames(backgroundDataUrl);
  const publishedAt = parsePublishedAtFromText(summaryText);
  const keyPoints = extractLongTermForecastPoints([...summaryParagraphs, ...forwardParagraphs]);

  const publication = {
    externalId: `sodir-shelf-year:${reportUrl}`,
    category: "SHELF_YEAR",
    title,
    summary: summaryParagraphs[0] ?? null,
    publishedAt,
    detailUrl: reportUrl,
    backgroundDataUrl,
    pdfUrl: absolutizeUrl(`${reportUrl}?print=2&`) ?? null,
    sheetNames,
    sourceSystem: "SODIR",
    sourceEntityType: "shelf_year_publication",
    sourceId: reportUrl,
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    rawPayload: {
      summaryParagraphs,
      forwardParagraphs,
    },
  } satisfies PetroleumPublicationSnapshotRecord;

  const forecast = {
    externalId: `sodir-shelf-year-forecast:${reportUrl}`,
    scope: "NCS",
    sourceLabel: "Sokkelåret",
    title,
    summary: keyPoints[0] ?? summaryParagraphs[0] ?? null,
    publishedAt,
    horizonLabel: "Neste fem år",
    appliesToProduct: "oe",
    forecastScopeLabel: "Hele norsk sokkel",
    trendLabel:
      keyPoints.find((point) => /faller|avtar|nivå/i.test(point)) ??
      "SODIR forventer gradvis fall mot slutten av 2020-tallet.",
    declineRatePercent: null,
    investmentLevelNok: parseInvestmentLevelNok(forwardParagraphs),
    detailUrl: forwardUrl,
    backgroundDataUrl,
    keyPoints,
    sourceSystem: "SODIR",
    sourceEntityType: "shelf_year_forecast",
    sourceId: reportUrl,
    fetchedAt: publication.fetchedAt,
    normalizedAt: publication.normalizedAt,
    rawPayload: {
      summaryParagraphs,
      forwardParagraphs,
    },
  } satisfies PetroleumForecastSnapshotRecord;

  return { publication, forecast };
}

async function fetchLatestResourceReportPublication() {
  const reportUrl = await resolveLatestReportUrl(
    `${SODIR_BASE_URL}/aktuelt/publikasjoner/rapporter/ressursrapporter/`,
    /\/aktuelt\/publikasjoner\/rapporter\/ressursrapporter\/ressursrapport-\d{4}\//i,
  );
  if (!reportUrl) {
    return null;
  }

  const reportHtml = await fetchText(reportUrl, undefined, 60_000);
  const title = resolvePageTitle(reportHtml, reportUrl, "Ressursrapport");
  const paragraphs = extractParagraphs(reportHtml);
  const text = normalizeWhitespace(cheerio.load(reportHtml)("main").text());
  const backgroundDataUrl = extractLinkByText(reportHtml, /bakgrunnstall|excel/i);
  const sheetNames = await extractWorkbookSheetNames(backgroundDataUrl);
  const publishedAt = parsePublishedAtFromText(text);

  return {
    externalId: `sodir-resource-report:${reportUrl}`,
    category: "RESOURCE_REPORT",
    title,
    summary: paragraphs[0] ?? null,
    publishedAt,
    detailUrl: reportUrl,
    backgroundDataUrl,
    pdfUrl: absolutizeUrl(`${reportUrl}?print=2&`) ?? null,
    sheetNames,
    sourceSystem: "SODIR",
    sourceEntityType: "resource_report_publication",
    sourceId: reportUrl,
    fetchedAt: new Date(),
    normalizedAt: new Date(),
    rawPayload: {
      paragraphs,
    },
  } satisfies PetroleumPublicationSnapshotRecord;
}

export async function fetchSodirPetroleumPublicationsData(): Promise<PetroleumPublicationsSyncPayload> {
  const [monthly, shelfYear, resourceReport] = await Promise.all([
    fetchLatestMonthlyProductionPublication(),
    fetchLatestShelfYearPublication(),
    fetchLatestResourceReportPublication(),
  ]);

  return {
    forecasts: [monthly?.forecast, shelfYear?.forecast].filter(isDefined),
    publications: [monthly?.publication, shelfYear?.publication, resourceReport].filter(isDefined),
  };
}
