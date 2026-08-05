const MOJIBAKE_DASH_REGEX =
  /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u00ad]|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Ëœ|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬â„¢|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â|ÃƒÂ¢Ã‹â€ Ã¢â‚¬â„¢/g;

function normalizeCommonMojibakePunctuation(value: string) {
  return value
    .replace(/\u00e2\u20ac\u201c/g, "-")
    .replace(/\u00e2\u20ac\u201d/g, "-")
    .replace(/\u00e2\u20ac\u02dc/g, "-")
    .replace(/\u00e2\u20ac\u2122/g, "-")
    .replace(MOJIBAKE_DASH_REGEX, "-");
}

function normalizeNorwegianCharacters(value: string) {
  return value
    .replace(/\u00e6/g, "ae")
    .replace(/\u00f8/g, "o")
    .replace(/\u00e5/g, "a")
    .replace(/\u00e3\u00a6/g, "ae")
    .replace(/\u00e3\u00b8/g, "o")
    .replace(/\u00e3\u00a5/g, "a")
    .replace(/Ã¦/g, "ae")
    .replace(/Ã¸/g, "o")
    .replace(/Ã¥/g, "a")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¦/g, "ae")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¸/g, "o")
    .replace(/ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¥/g, "a");
}

export function normalizeNorwegianText(value: string) {
  return normalizeNorwegianCharacters(value.toLowerCase())
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
  return normalizeCommonMojibakePunctuation(value)
    .replace(/([a-zA-Z])(\d{2,})/g, "$1 $2")
    .replace(/(\d{2,})([a-zA-Z])/g, "$1 $2")
    .replace(/(\d)\(/g, "$1 (")
    .replace(/([)])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])\(/g, "$1 (")
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
    .replace(MOJIBAKE_DASH_REGEX, "-");
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
