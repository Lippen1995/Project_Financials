import * as cheerio from "cheerio";

import { fetchText } from "@/integrations/http";
import type { NewsSourceDefinition } from "@/server/news/news-source-registry";
import type { NewsSourceAdapter, ParsedSourceDocument, SourceFetchResult } from "@/server/news/source-adapters/types";

type HtmlListConfig = {
  listUrl?: string;
  itemSelector?: string;
  titleSelector?: string;
  dateSelector?: string;
  dateAttribute?: string;
  detailBodySelector?: string;
  maxItems?: number;
};

type HtmlListCandidate = {
  detailUrl: string;
  fallbackTitle: string;
  fallbackPublishedAt: Date | null;
};

function asConfig(value: unknown): HtmlListConfig {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as HtmlListConfig)
    : {};
}

function normalizeWhitespace(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function absolutizeUrl(href: string | null | undefined, baseUrl: string) {
  if (!href) return null;

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseDateValue(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = normalized.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})$/);
  if (!match) return null;

  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stripTrailingDate(value: string) {
  return value.replace(/\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}$/u, "").trim();
}

function extractListCandidates(html: string, config: HtmlListConfig, sourceUrl: string) {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const candidates: HtmlListCandidate[] = [];
  const itemSelector = config.itemSelector ?? "a[href]";

  for (const element of $(itemSelector).toArray()) {
    const detailUrl = absolutizeUrl($(element).attr("href"), sourceUrl);
    if (!detailUrl || seen.has(detailUrl)) {
      continue;
    }

    const fallbackTitle = stripTrailingDate(normalizeWhitespace($(element).text()));
    if (!fallbackTitle) {
      continue;
    }

    seen.add(detailUrl);
    candidates.push({
      detailUrl,
      fallbackTitle,
      fallbackPublishedAt: parseDateValue($(element).text()),
    });
  }

  return candidates.slice(0, Math.min(Math.max(config.maxItems ?? 10, 1), 20));
}

function extractParagraphs(html: string, selector: string) {
  const $ = cheerio.load(html);
  return $(selector)
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((paragraph) => paragraph.length >= 24 && !/^(press release|news)\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(paragraph));
}

async function fetchCandidateDocument(
  candidate: HtmlListCandidate,
  source: NewsSourceDefinition,
  config: HtmlListConfig,
): Promise<ParsedSourceDocument | null> {
  const detailHtml = await fetchText(candidate.detailUrl, undefined, 20_000);
  const $ = cheerio.load(detailHtml);
  const title = normalizeWhitespace($(config.titleSelector ?? "h1").first().text()) || candidate.fallbackTitle;
  const publishedAt =
    parseDateValue($(config.dateSelector ?? "time").first().attr(config.dateAttribute ?? "datetime")) ??
    parseDateValue($(config.dateSelector ?? "time").first().text()) ??
    candidate.fallbackPublishedAt;
  const paragraphs = extractParagraphs(detailHtml, config.detailBodySelector ?? "main p");
  const summary = paragraphs[0] ?? null;
  const bodyText = paragraphs.join("\n\n") || null;

  if (!title || !publishedAt) {
    return null;
  }

  return {
    sourceId: source.id,
    externalId: candidate.detailUrl,
    url: candidate.detailUrl,
    canonicalUrl: candidate.detailUrl,
    title,
    summary,
    bodyText,
    language: source.language ?? null,
    publishedAt,
    rawPayload: {
      sourceUrl: source.url,
      paragraphCount: paragraphs.length,
    },
  };
}

export class HtmlListSourceAdapter implements NewsSourceAdapter {
  sourceType = "html_list";

  async fetch(source: NewsSourceDefinition): Promise<SourceFetchResult> {
    const fetchedAt = new Date();
    const config = asConfig(source.fetchConfig);
    const listUrl = config.listUrl ?? source.url;

    if (!listUrl) {
      return {
        sourceId: source.id,
        documents: [],
        errors: [`Source ${source.id} is missing list URL configuration.`],
        fetchedAt,
      };
    }

    try {
      const listHtml = await fetchText(listUrl, undefined, 20_000);
      const candidates = extractListCandidates(listHtml, config, listUrl);
      const settled = await Promise.allSettled(
        candidates.map((candidate) => fetchCandidateDocument(candidate, source, config)),
      );

      return {
        sourceId: source.id,
        documents: settled.flatMap((result) =>
          result.status === "fulfilled" && result.value ? [result.value] : [],
        ),
        errors: settled.flatMap((result) =>
          result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : [],
        ),
        fetchedAt,
      };
    } catch (error) {
      return {
        sourceId: source.id,
        documents: [],
        errors: [error instanceof Error ? error.message : String(error)],
        fetchedAt,
      };
    }
  }
}
