import { NormalizedCompany, NormalizedFinancialStatement } from "@/lib/types";

/**
 * Derived company standing used by the "5C" company profile: a 0–100 health
 * score plus a letter rating and a risk band derived from it. These are
 * transparent heuristics over the register + headline financials — not a
 * credit score. Everything is computed from data we actually hold; when the
 * inputs are missing the score simply stays low rather than inventing signal.
 */

export type StatusTone = "success" | "warning" | "error" | "neutral";

function latestStatement(
  statements: NormalizedFinancialStatement[],
): NormalizedFinancialStatement | null {
  if (statements.length === 0) return null;
  return [...statements].sort((a, b) => a.fiscalYear - b.fiscalYear).at(-1) ?? null;
}

export function deriveHealthScore(
  company: Pick<NormalizedCompany, "status">,
  statements: NormalizedFinancialStatement[],
): number {
  const latest = latestStatement(statements);
  let score = 20;
  if (company.status === "ACTIVE") score += 20;
  if (latest?.operatingProfit != null && latest.operatingProfit > 0) score += 20;
  if (latest?.equity != null && latest.equity > 0) score += 15;
  if (latest?.revenue != null) score += 10;
  if (
    latest?.equity != null &&
    latest?.assets != null &&
    latest.assets > 0 &&
    (latest.equity / latest.assets) * 100 > 30
  ) {
    score += 15;
  }
  return Math.min(100, score);
}

export type RatingGrade = "A" | "B" | "C" | "D";

export function deriveRating(score: number, status: NormalizedCompany["status"]): {
  grade: RatingGrade;
  tone: StatusTone;
} {
  if (status === "BANKRUPT" || status === "DISSOLVED") return { grade: "D", tone: "error" };
  if (score >= 80) return { grade: "A", tone: "success" };
  if (score >= 60) return { grade: "B", tone: "success" };
  if (score >= 40) return { grade: "C", tone: "warning" };
  return { grade: "D", tone: "error" };
}

export function deriveRisk(score: number, status: NormalizedCompany["status"]): {
  label: string;
  tone: StatusTone;
} {
  if (status === "BANKRUPT" || status === "DISSOLVED") return { label: "Høy", tone: "error" };
  if (score >= 70) return { label: "Lav", tone: "success" };
  if (score >= 45) return { label: "Middels", tone: "warning" };
  return { label: "Høy", tone: "error" };
}

/** Maps a status tone to the design-system text color token. */
export function toneColor(tone: StatusTone): string {
  switch (tone) {
    case "success":
      return "var(--px-success)";
    case "warning":
      return "var(--px-warning)";
    case "error":
      return "var(--px-error)";
    default:
      return "var(--px-text)";
  }
}
