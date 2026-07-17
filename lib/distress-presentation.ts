import { EQUITY_RATIO_CEILING } from "@/lib/distress";
import { DistressStatus } from "@/lib/types";

/**
 * Presentation rules for the distress module. Kept out of the components so the thresholds that
 * decide what reads as "red" live in one place, next to each other, rather than inline in JSX.
 */

export type StatusTone = {
  background: string;
  foreground: string;
  border: string;
};

const NEUTRAL_TONE: StatusTone = {
  background: "rgba(248,249,250,0.9)",
  foreground: "var(--px-muted)",
  border: "var(--px-border)",
};

const ERROR_TONE: StatusTone = {
  background: "var(--px-error-soft)",
  foreground: "var(--px-error)",
  border: "var(--px-error-border)",
};

const WARNING_TONE: StatusTone = {
  background: "var(--px-warning-soft)",
  foreground: "var(--px-warning)",
  border: "var(--px-warning-border)",
};

export function getStatusTone(status: DistressStatus): StatusTone {
  switch (status) {
    case "BANKRUPTCY":
    case "FORCED_PROCESS":
    case "FOREIGN_INSOLVENCY":
      return ERROR_TONE;
    case "RECONSTRUCTION":
      return WARNING_TONE;
    case "LIQUIDATION":
    case "OTHER_DISTRESS":
    default:
      return NEUTRAL_TONE;
  }
}

/** Health runs 0-100 with high = healthy, so the colour scale is the inverse of the risk scale. */
export function getHealthColor(health?: number | null) {
  if (health === null || health === undefined) {
    return "var(--px-muted)";
  }

  if (health <= 34) {
    return "var(--px-error)";
  }

  return health <= 60 ? "var(--px-warning)" : "var(--px-success)";
}

export function getLiquidityColor(ratio?: number | null) {
  if (ratio === null || ratio === undefined) {
    return "var(--px-muted)";
  }

  if (ratio < 0.7) {
    return "var(--px-error)";
  }

  return ratio < 1 ? "var(--px-warning)" : "var(--px-text)";
}

export function getEquityRatioColor(ratio?: number | null) {
  if (ratio === null || ratio === undefined) {
    return "var(--px-muted)";
  }

  if (ratio < 0) {
    return "var(--px-error)";
  }

  return ratio < 15 ? "var(--px-warning)" : "var(--px-text)";
}

export function getDaysInStatusColor(days?: number | null) {
  if (days === null || days === undefined) {
    return "var(--px-muted)";
  }

  if (days >= 180) {
    return "var(--px-error)";
  }

  return days >= 90 ? "var(--px-warning)" : "var(--px-muted)";
}

const NOT_AVAILABLE = "—";

/**
 * Compact NOK for dense table cells: "1,2 mrd" / "680 mill" / "412 k". `formatCurrency` in
 * lib/utils renders full kroner, which is unreadable at ten columns wide.
 */
export function formatCompactAmount(value?: number | null) {
  if (value === null || value === undefined) {
    return NOT_AVAILABLE;
  }

  const magnitude = Math.abs(value);

  if (magnitude >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} mrd`;
  }

  if (magnitude >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("nb-NO", { maximumFractionDigits: 0 })} mill`;
  }

  if (magnitude >= 1_000) {
    return `${(value / 1_000).toLocaleString("nb-NO", { maximumFractionDigits: 0 })} k`;
  }

  return value.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
}

export function formatRatio(value?: number | null) {
  return value === null || value === undefined
    ? NOT_AVAILABLE
    : value.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPercentValue(value?: number | null) {
  return value === null || value === undefined
    ? NOT_AVAILABLE
    : `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
}

/**
 * Equity ratios are capped before storage (see EQUITY_RATIO_CEILING), so a value sitting exactly on
 * the ceiling is a floor/ceiling marker, not a measurement. Render it as a bound so nobody reads
 * "−10 000 %" as this company's actual figure.
 */
export function formatEquityRatio(value?: number | null) {
  if (value === null || value === undefined) {
    return NOT_AVAILABLE;
  }

  if (value <= -EQUITY_RATIO_CEILING) {
    return `< ${(-EQUITY_RATIO_CEILING).toLocaleString("nb-NO", { maximumFractionDigits: 0 })} %`;
  }

  if (value >= EQUITY_RATIO_CEILING) {
    return `> ${EQUITY_RATIO_CEILING.toLocaleString("nb-NO", { maximumFractionDigits: 0 })} %`;
  }

  return formatPercentValue(value);
}

export function formatScore(value?: number | null) {
  return value === null || value === undefined ? NOT_AVAILABLE : String(value);
}

export function formatDaysInStatus(days?: number | null) {
  return days === null || days === undefined
    ? "Ukjent varighet"
    : `${days.toLocaleString("nb-NO")} dager i status`;
}

export function getCoverageLabel(coverage: string) {
  switch (coverage) {
    case "FINANCIALS_AVAILABLE":
      return "Regnskap tilgjengelig";
    case "FINANCIALS_PARTIAL":
      return "Delvis regnskap";
    default:
      return "Regnskap mangler";
  }
}
