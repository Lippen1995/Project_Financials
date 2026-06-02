import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
]);

const SAFE_GENERIC_TITLE_WORDS = new Set([
  "as",
  "asa",
  "ltd",
  "inc",
  "the",
  "and",
  "og",
  "for",
  "til",
  "fra",
  "med",
  "om",
  "av",
]);

export function canonicalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = "";

  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }

  parsed.searchParams.sort();

  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "o")
    .replace(/å/gi, "a")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createContentHash(input: string): string {
  return createHash("sha256").update(input.trim(), "utf8").digest("hex");
}

export function createTitleFingerprint(title: string): string {
  const normalized = normalizeText(title)
    .split(" ")
    .filter((token) => token.length > 1 && !SAFE_GENERIC_TITLE_WORDS.has(token))
    .join(" ");

  return createContentHash(normalized || normalizeText(title)).slice(0, 32);
}

export function inferExternalId(input: {
  sourceId: string;
  externalId?: string | null;
  url?: string | null;
  title: string;
  publishedAt?: Date | null;
}) {
  if (input.externalId) return input.externalId;

  if (input.url) {
    try {
      const parsed = new URL(input.url);
      const idParam = parsed.searchParams.get("id") ?? parsed.searchParams.get("kid") ?? parsed.searchParams.get("guid");
      if (idParam) return `${input.sourceId}:${idParam}`;

      const slug = parsed.pathname.split("/").filter(Boolean).at(-1);
      if (slug) return `${input.sourceId}:${slug}`;
    } catch {
      // Fall through to deterministic title/date hash.
    }
  }

  const datePart = input.publishedAt ? input.publishedAt.toISOString().slice(0, 10) : "undated";
  return `${input.sourceId}:${datePart}:${createTitleFingerprint(input.title)}`;
}
