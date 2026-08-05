/**
 * Reporting-currency detection for annual report pages.
 *
 * The overwhelming majority of Norwegian filings report in NOK, so NOK is the
 * default. A minority — typically shipping, oil-service and tech companies —
 * report in USD, EUR or another currency. Those filings declare it in the
 * statement header, e.g. "Beløp i USD 1000" or "Amounts in USD".
 *
 * Detection is deliberately conservative: it only switches away from NOK on
 * an explicit declaration anchored to a "beløp i" / "tall i" / "amounts in"
 * phrase. A passing mention of "USD" in a note about a foreign subsidiary
 * must NOT change the statement currency.
 */
import {
  AnnualReportParsedPage,
  PageTextLayer,
} from "@/integrations/brreg/annual-report-financials/types";
import { ReportingCurrency } from "@/server/financials/canonical-taxonomy";
import { normalizeNorwegianText } from "@/lib/norwegian-text";

export type { ReportingCurrency };

export type CurrencyDetectionResult = {
  currency: ReportingCurrency;
  confidence: number;
  reason: string;
};

// Non-NOK currencies and the tokens that name them. Norwegian reports use
// both ISO codes and spelled-out names.
const NON_NOK_CURRENCIES: Array<{ currency: ReportingCurrency; token: string }> = [
  { currency: "USD", token: "usd" },
  { currency: "USD", token: "us dollar" },
  { currency: "EUR", token: "eur" },
  { currency: "EUR", token: "euro" },
  { currency: "GBP", token: "gbp" },
  { currency: "SEK", token: "sek" },
  { currency: "DKK", token: "dkk" },
];

// Phrases that introduce a unit/currency declaration. The currency token must
// appear shortly after one of these — otherwise it is just prose.
const DECLARATION_ANCHOR = "(?:bel[o0]p i|tall i|amounts in|figures in|oppgitt i)";

function collectText(textOrPage: string | PageTextLayer | AnnualReportParsedPage): string {
  if (typeof textOrPage === "string") {
    return textOrPage;
  }
  if (
    "blocks" in textOrPage &&
    Array.isArray(textOrPage.blocks) &&
    textOrPage.blocks.length > 0
  ) {
    return [...textOrPage.blocks.slice(0, 12).map((b) => b.text), textOrPage.text].join("\n");
  }
  return textOrPage.text;
}

/**
 * Detects the reporting currency of a page. Returns NOK with default
 * confidence when no explicit non-NOK declaration is found.
 */
export function detectCurrency(
  textOrPage: string | PageTextLayer | AnnualReportParsedPage,
): CurrencyDetectionResult {
  const normalized = normalizeNorwegianText(collectText(textOrPage));

  for (const { currency, token } of NON_NOK_CURRENCIES) {
    // Anchor … up to 20 chars … the currency token, all word-bounded.
    const regex = new RegExp(`${DECLARATION_ANCHOR}[^.\\n]{0,20}\\b${token}\\b`);
    if (regex.test(normalized)) {
      return {
        currency,
        confidence: 0.95,
        reason: `Declared reporting currency ${currency}`,
      };
    }
  }

  return {
    currency: "NOK",
    confidence: 0.6,
    reason: "No non-NOK currency declaration found; defaulting to NOK",
  };
}
