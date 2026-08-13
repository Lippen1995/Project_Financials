const countFormatter = new Intl.NumberFormat("nb-NO");
const oneDecimalFormatter = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 1,
});

export function formatCount(value: number | null) {
  return value === null ? "Ikke tilgjengelig" : countFormatter.format(value);
}

export function formatPercent(value: number | null) {
  return value === null ? "—" : `${oneDecimalFormatter.format(value)} %`;
}

/**
 * Kroner arrive as decimal strings because the figures are bigints in the database. Rounding to
 * "mrd"/"mill" is a display choice only — every exact figure stays available on the profile page.
 */
export function formatCompactAmount(
  value: string | null,
  currency: string | null,
) {
  if (value === null || currency === null) return "Ikke tilgjengelig";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Ikke tilgjengelig";
  const magnitude = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (magnitude >= 1e9) {
    return `${sign}${oneDecimalFormatter.format(magnitude / 1e9)} mrd ${currency}`;
  }
  if (magnitude >= 1e6) {
    return `${sign}${countFormatter.format(Math.round(magnitude / 1e6))} mill ${currency}`;
  }
  return `${sign}${countFormatter.format(Math.round(magnitude))} ${currency}`;
}

export function formatSourceDate(value: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** Ratios the panel filters on are derived the same way here so the card agrees with the filter. */
export function ratioPercent(
  numerator: string | null,
  denominator: string | null,
) {
  if (numerator === null || denominator === null) return null;
  const base = Number(denominator);
  if (!Number.isFinite(base) || base <= 0) return null;
  const value = Number(numerator);
  if (!Number.isFinite(value)) return null;
  return (value / base) * 100;
}
