import type {
  FinancialDatasetMode,
  FinancialDatasetVersion,
  FinancialDisclosure,
  FinancialStatementOrigin,
  FinancialValueOrigin,
} from "@/lib/types";

/**
 * How simulated financial figures are disclosed, from FI-SIM-2026.1 section 12.
 *
 * Every surface that can show a simulated number — the statement table, the graphs, the raw API,
 * an export, an Njord answer — says the same sentence, in the same words, from here. A demo where
 * the table says "simulert" and the export says nothing is a demo where somebody screenshots the
 * export.
 *
 * Two separate claims are made, and they are not interchangeable. The statement-level notice says
 * this whole set of figures comes from a demonstration dataset. The line-level marker says this
 * particular number was invented rather than reported, which matters on a hybrid statement where
 * the line above it is a real reported figure.
 */

export const SIMULATED_FINANCIALS_NOTICE =
  "Simulert for demonstrasjon – ikke rapporterte selskapsdata";

export const SIMULATED_LINE_MARKER = "SIM";

export const SIMULATED_LINE_NOTICE =
  "Simulert linje – ikke rapporterte selskapsdata";

export const SIMULATED_EXPORT_DISCLAIMER =
  "Dette uttrekket inneholder simulerte tall for demonstrasjonsformål. Linjer merket med valueOrigin=synthetic er ikke rapporterte selskapsdata og kan ikke brukes som grunnlag for beslutninger.";

export type { FinancialDisclosure } from "@/lib/types";

export function isSimulatedStatementOrigin(origin: FinancialStatementOrigin) {
  return origin !== "reported";
}

export function isSyntheticValueOrigin(origin: FinancialValueOrigin) {
  return origin === "synthetic";
}

/**
 * The dataset mode decides this, not the contents of the page.
 *
 * A simulated dataset with no statements for one company is still a simulated dataset, and the
 * empty state has to say so — otherwise the one company the demo has no figures for is the one
 * that looks like it has honest reported gaps.
 */
export function financialDisclosureFor(
  financialDatasetMode: FinancialDatasetMode,
  financialDatasetVersion: FinancialDatasetVersion,
): FinancialDisclosure {
  const simulated = financialDatasetMode === "simulated";
  return {
    financialDatasetMode,
    financialDatasetVersion,
    simulated,
    notice: simulated ? SIMULATED_FINANCIALS_NOTICE : null,
  };
}

/** The same thing, for the repository's `datasetMode` naming. */
export function buildFinancialDisclosure(snapshot: {
  datasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
}): FinancialDisclosure {
  return financialDisclosureFor(snapshot.datasetMode, snapshot.financialDatasetVersion);
}

/**
 * The sentence an assistant has to include when its answer rests on simulated figures.
 *
 * Kept as one string rather than left to the model, because an answer that mentions the demo in a
 * sentence the model composed differently each time is an answer a reader can miss.
 */
export function simulatedAnswerNotice(disclosure: FinancialDisclosure) {
  if (!disclosure.simulated) return null;
  return `${SIMULATED_FINANCIALS_NOTICE}. Datasett: ${disclosure.financialDatasetVersion}.`;
}
