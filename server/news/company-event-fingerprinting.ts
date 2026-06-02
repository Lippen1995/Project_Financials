import { createHash } from "node:crypto";

import { normalizeCompanyName } from "@/server/news/company-alias-service";

const FINGERPRINT_STOPWORDS = new Set([
  "as",
  "asa",
  "the",
  "and",
  "for",
  "with",
  "from",
  "og",
  "i",
  "for",
  "fra",
  "med",
  "til",
  "av",
  "announces",
  "announcement",
  "melding",
  "asa",
]);

export type CompanyEventFingerprintInput = {
  companyId: string;
  eventType: string;
  title: string;
  eventDate?: Date | null;
  sourceSpecificId?: string | null;
};

export function normalizeTitleCore(title: string) {
  return normalizeCompanyName(title)
    .replace(/\bbuy-back\b/g, "buyback")
    .replace(/-/g, " ")
    .split(" ")
    .filter((token) => token.length > 2 && !FINGERPRINT_STOPWORDS.has(token))
    .slice(0, 12)
    .join(" ");
}

function dateWindow(date?: Date | null) {
  if (!date) return "undated";
  const copy = new Date(date);
  const day = copy.getUTCDate();
  const bucketStart = day <= 10 ? "01" : day <= 20 ? "11" : "21";
  return `${copy.getUTCFullYear()}-${String(copy.getUTCMonth() + 1).padStart(2, "0")}-${bucketStart}`;
}

export function createCompanyEventFingerprint(input: CompanyEventFingerprintInput) {
  const sourceStablePart = input.sourceSpecificId ? normalizeCompanyName(input.sourceSpecificId) : "";
  const raw = [
    input.companyId,
    input.eventType,
    normalizeTitleCore(input.title),
    dateWindow(input.eventDate),
    sourceStablePart,
  ]
    .filter(Boolean)
    .join("|");

  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 32);
}
