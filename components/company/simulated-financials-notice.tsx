import React from "react";

import {
  SIMULATED_LINE_MARKER,
  SIMULATED_LINE_NOTICE,
  type FinancialDisclosure,
} from "@/lib/financial-simulation-disclosure";
import { cn } from "@/lib/utils";

/**
 * How simulated figures are marked on screen, from FI-SIM-2026.1 section 12.
 *
 * One module because the statement table, the key figures and the graphs must say the same thing
 * in the same words. A reader who learns what the marker means in one place has learned it
 * everywhere, and a surface that quietly stops marking is a surface that stands out here rather
 * than in a demo.
 *
 * Nothing is communicated by colour alone: the marker is a text abbreviation with a screen-reader
 * sentence behind it, and the chart caption is prose.
 */

/** The marker on a single simulated figure. */
export function SimulatedValueMarker() {
  return (
    <sup
      data-value-origin="synthetic"
      title={SIMULATED_LINE_NOTICE}
      className="ml-1 align-super font-sans text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--px-muted)]"
    >
      <span aria-hidden="true">{SIMULATED_LINE_MARKER}</span>
      <span className="sr-only">{SIMULATED_LINE_NOTICE}</span>
    </sup>
  );
}

/** The persistent statement-level banner. */
export function SimulatedFinancialsBanner({
  disclosure,
  className,
}: {
  disclosure: FinancialDisclosure;
  className?: string;
}) {
  return (
    <div
      role="note"
      data-financial-dataset-mode={disclosure.financialDatasetMode}
      className={cn(
        "rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-3",
        className,
      )}
    >
      <p className="text-[13px] font-semibold text-[var(--px-text)]">{disclosure.notice}</p>
      <p className="mt-1 text-[12px] text-[var(--px-muted)]">
        Tall merket <span className="font-semibold">{SIMULATED_LINE_MARKER}</span> er generert for
        demonstrasjon og er ikke hentet fra virksomhetens innsendte regnskap. Datasett{" "}
        <span className="font-mono">{disclosure.financialDatasetVersion}</span>.
      </p>
    </div>
  );
}

/**
 * The caption under a chart drawn on simulated figures.
 *
 * A chart cannot mark individual points the way a table marks a row — a marker on every data point
 * would be unreadable, and one on the series would be invisible at a glance. So the graph says it
 * in words, right where the eye leaves the picture. Without this, a graph drawn on generated
 * numbers looks exactly like one drawn on reported numbers, which is the failure mode the whole
 * disclosure exists to prevent.
 */
export function SimulatedChartCaption({
  disclosure,
  className,
}: {
  disclosure: FinancialDisclosure;
  className?: string;
}) {
  return (
    <p
      data-financial-dataset-mode={disclosure.financialDatasetMode}
      className={cn("mt-2 text-[11px] text-[var(--px-muted)]", className)}
    >
      <span className="font-semibold">{SIMULATED_LINE_MARKER}</span> {disclosure.notice}. Grafen leser
      FI-SIM-demonstrasjonsdatasettet, som kan kombinere rapporterte ankere og syntetiske datapunkter.
      Syntetiske datapunkter er ikke rapporterte selskapsdata. Datasett{" "}
      <span className="font-mono">{disclosure.financialDatasetVersion}</span>.
    </p>
  );
}
