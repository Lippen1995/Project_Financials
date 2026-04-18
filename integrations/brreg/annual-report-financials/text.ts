export function normalizeNorwegianText(value: string) {
  return value
    .toLowerCase()
    .replace(/ÃƒÂ¦/g, "ae")
    .replace(/ÃƒÂ¸/g, "o")
    .replace(/ÃƒÂ¥/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s/()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripDuplicateWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function repairOcrTokenBoundaries(value: string) {
  return value
    .replace(/([a-zA-Z])(\d{2,})/g, "$1 $2")
    .replace(/(\d{2,})([a-zA-Z])/g, "$1 $2")
    .replace(/(\d)\(/g, "$1 (")
    .replace(/([)])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])\(/g, "$1 (")
    .replace(/[â€â€‘â€’â€“â€”âˆ’]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRowLabel(value: string) {
  return normalizeNorwegianText(repairOcrTokenBoundaries(value))
    .replace(/\bnote\s*\d+\b/g, " ")
    .replace(/\b\d{1,2}\b(?=\s*$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractIntegers(value: string) {
  const matches = value.match(/\(\s*-?\d[\d\s.,]*\)|-?\d[\d\s.,-]*/g) ?? [];
  return matches
    .map((match) => match.trim())
    .filter((match) => {
      const digitCount = match.replace(/\D/g, "").length;
      return match === "0" || digitCount >= 2 || /[()-]/.test(match);
    });
}

export function parseFinancialInteger(value: string) {
  const repaired = repairOcrTokenBoundaries(value)
    .replace(/\b[oO](?=\d)/g, "0")
    .replace(/[â€“â€”âˆ’]/g, "-");
  const trimmed = repaired.trim();
  const isParenthesesNegative = /^\(.+\)$/.test(trimmed);
  const isTrailingNegative = /\d-$/.test(trimmed);
  const normalized = trimmed
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/-$/, "")
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
      const signed = isParenthesesNegative || isTrailingNegative ? -Math.abs(parsed) : parsed;
      return Math.round(signed);
    }
  }

  return null;
}

export function inferStringHashKey(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .join("::");
}
