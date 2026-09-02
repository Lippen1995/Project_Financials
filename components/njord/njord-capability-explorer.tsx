"use client";

import { useState } from "react";

import { NJORD_CAPABILITIES } from "@/lib/njord-intro";
import { cn } from "@/lib/utils";

/**
 * Venstre kolonne lister de seks arbeidsmåtene; høyre kolonne står klistret og viser stegene
 * for den valgte. Listen er en radiogruppe fordi det alltid er nøyaktig én aktiv rad.
 */
export function NjordCapabilityExplorer() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = NJORD_CAPABILITIES[activeIndex];

  return (
    <div className="mt-14 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="border-t border-[var(--px-border)]" role="radiogroup" aria-label="Slik arbeider Njord">
        {NJORD_CAPABILITIES.map((capability, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={capability.num}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "flex w-full items-start gap-4 border-b border-l-2 border-[var(--px-border)] px-4 py-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--px-accent)]",
                isActive
                  ? "border-l-[var(--px-accent)] bg-[var(--px-accent-soft)]"
                  : "border-l-transparent bg-transparent hover:bg-[var(--px-subtle)]",
              )}
            >
              <span
                className={cn(
                  "data-label pt-1 text-[9px]",
                  isActive ? "text-[var(--px-accent)]" : "text-[var(--px-muted)]",
                )}
              >
                {capability.num}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[17px] font-semibold tracking-[-0.02em]",
                    isActive ? "text-[var(--px-accent)]" : "text-[var(--px-text)]",
                  )}
                >
                  {capability.title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-[var(--px-muted)]">
                  {capability.lead}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "material-symbols-outlined pt-0.5 text-[20px]",
                  isActive ? "text-[var(--px-accent)]" : "text-[var(--px-border)]",
                )}
              >
                {capability.icon}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-bg)] p-8 lg:sticky lg:top-24">
        <div className="data-label text-[9px] uppercase text-[var(--px-muted)]">Slik arbeider han</div>
        <h3 className="mt-3 text-2xl font-medium tracking-[-0.03em] text-[var(--px-text)]">
          {active.title}
        </h3>
        <p className="mt-3 text-[15px] leading-[1.62] text-[var(--px-muted)]">{active.body}</p>

        <div className="mt-6 grid gap-2.5">
          {active.steps.map((step) => (
            <div
              key={step}
              className="flex gap-3 rounded-xl border border-[var(--px-border-subtle)] bg-[var(--px-surface-strong)] px-3.5 py-3"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-[var(--px-accent)]">
                chevron_right
              </span>
              <span className="text-sm leading-6 text-[var(--px-text)]">{step}</span>
            </div>
          ))}
        </div>

        <div className="data-label mt-6 text-[9px] uppercase text-[var(--px-muted)]">Kilder i bruk</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {active.sources.map((source) => (
            <span
              key={source}
              className="data-label rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-3 py-1.5 text-[9px] uppercase text-[var(--px-text)]"
            >
              {source}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
