import { spawn } from "node:child_process";
import path from "node:path";

import env from "@/lib/env";

export type ExtractedNewsArticle = {
  url: string;
  title: string | null;
  lead: string | null;
  mainText: string | null;
  language: string | null;
  authors: string[];
  imageUrl: string | null;
  publishedAt: Date | null;
  sourceDomain: string | null;
  extractor: "news-please";
};

type NewspleasePayload = {
  ok?: boolean;
  code?: string;
  error?: string;
  url?: string;
  title?: string | null;
  lead?: string | null;
  mainText?: string | null;
  language?: string | null;
  authors?: unknown;
  imageUrl?: string | null;
  publishedAt?: string | null;
  sourceDomain?: string | null;
  extractor?: string;
};

let newsPleaseAvailable: boolean | null = null;

function extractionEnabled() {
  return env.newsArticleExtractionMode !== "off" && env.newsArticleExtractionMode !== "false";
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeAuthors(value: unknown) {
  return Array.isArray(value)
    ? value.map((author) => String(author).trim()).filter(Boolean)
    : [];
}

function runNewsplease(url: string) {
  return new Promise<NewspleasePayload | null>((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", "newsplease-extract.py");
    const child = spawn(env.newsArticleExtractionPython, [scriptPath, url], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve({ ok: false, code: "TIMEOUT", error: "news-please extraction timed out." });
    }, env.newsArticleExtractionTimeoutMs);

    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.on("error", () => {
      clearTimeout(timeout);
      resolve({ ok: false, code: "SPAWN_FAILED", error: "Could not start Python news-please extractor." });
    });

    child.on("close", () => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(stdout.trim()) as NewspleasePayload);
      } catch {
        resolve(null);
      }
    });
  });
}

export async function extractNewsArticle(url: string): Promise<ExtractedNewsArticle | null> {
  if (!extractionEnabled() || newsPleaseAvailable === false) {
    return null;
  }

  const payload = await runNewsplease(url);
  if (!payload) {
    return null;
  }

  if (payload.ok === false) {
    if (payload.code === "UNAVAILABLE" || payload.code === "SPAWN_FAILED") {
      newsPleaseAvailable = false;
    }
    return null;
  }

  newsPleaseAvailable = true;

  return {
    url: payload.url ?? url,
    title: payload.title ?? null,
    lead: payload.lead ?? null,
    mainText: payload.mainText ?? null,
    language: payload.language ?? null,
    authors: normalizeAuthors(payload.authors),
    imageUrl: payload.imageUrl ?? null,
    publishedAt: parseDate(payload.publishedAt),
    sourceDomain: payload.sourceDomain ?? null,
    extractor: "news-please",
  };
}

export function resetNewsArticleExtractionAvailabilityForTests() {
  newsPleaseAvailable = null;
}
