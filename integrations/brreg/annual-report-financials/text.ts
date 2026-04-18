export function normalizeNorwegianText(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripDuplicateWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeRowLabel(value: string) {
  return normalizeNorwegianText(value)
    .replace(/\bnote\s+\d+\b/g, " ")
    .replace(/\b\d{1,2}\b(?=\s*$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractIntegers(value: string) {
  return value.match(/-?\d[\d\s.]*/g) ?? [];
}

export function parseFinancialInteger(value: string) {
  const normalized = value
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(/,/g, ".")
    .trim();

  if (!normalized) {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return null;
}

export function inferStringHashKey(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .join("::");
}
