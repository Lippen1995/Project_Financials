"use client";

import * as React from "react";

export type CompanyMapSignal = {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
};

const TONE_CLASS = {
  neutral: "text-white",
  positive: "text-[#8fe0c0]",
  negative: "text-[#f0a8a8]",
} as const;

export function CompanyMapSignalRail({
  open,
  onOpenChange,
  signals,
  loading,
  footnote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signals: CompanyMapSignal[];
  loading: boolean;
  footnote: string;
}) {
  const railId = React.useId();

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls={railId}
        onClick={() => onOpenChange(true)}
        className="absolute right-4 top-4 z-[7] flex items-center gap-2 rounded-xl border border-white/10 bg-[var(--px-panel)] px-3.5 py-2.5 text-white shadow-[0_6px_20px_rgba(15,23,42,0.24)] hover:bg-[#22334a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <span aria-hidden className="material-symbols-outlined text-[19px]">
          insights
        </span>
        <span className="text-[13px] font-semibold">Hovedsignaler</span>
      </button>
    );
  }

  return (
    <aside
      id={railId}
      aria-label="Hovedsignaler for gjeldende filter"
      className="absolute bottom-4 right-4 top-4 z-[7] flex w-[280px] max-w-[calc(100%-2rem)] flex-col overflow-y-auto rounded-2xl border border-white/10 bg-[var(--px-panel)] px-[22px] py-5 shadow-[0_12px_32px_rgba(15,23,42,0.28)]"
    >
      <div className="flex items-start justify-between gap-2.5">
        <p className="data-label m-0 text-[10px] text-white/60">
          HOVEDSIGNALER · FILTERUTVALG
        </p>
        <button
          type="button"
          aria-expanded
          aria-controls={railId}
          onClick={() => onOpenChange(false)}
          title="Skjul hovedsignaler"
          className="-mt-0.5 flex rounded-lg border border-white/15 bg-white/10 p-0.5 text-white/85 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <span aria-hidden className="material-symbols-outlined text-[18px]">
            right_panel_close
          </span>
          <span className="sr-only">Skjul hovedsignaler</span>
        </button>
      </div>
      <h2 className="mt-2.5 text-[15px] font-semibold text-white">
        Rask vurdering
      </h2>

      {loading ? (
        <p role="status" className="mt-4 text-[12.5px] text-white/70">
          Henter dekningstall …
        </p>
      ) : signals.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-white/70">
          Dekningstall vises når det publiserte datasettet er tilgjengelig.
        </p>
      ) : (
        <dl className="mt-4 flex flex-col">
          {signals.map((signal) => (
            <div
              key={signal.label}
              className="flex items-baseline justify-between gap-3 border-t border-white/10 py-3"
            >
              <dt className="text-[12.5px] text-white/70">{signal.label}</dt>
              <dd
                className={`m-0 text-right font-mono text-[14px] font-semibold tabular-nums ${
                  TONE_CLASS[signal.tone ?? "neutral"]
                }`}
              >
                {signal.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-4 text-[11px] leading-5 text-white/50">{footnote}</p>
    </aside>
  );
}
