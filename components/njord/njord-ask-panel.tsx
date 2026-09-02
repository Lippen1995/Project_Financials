"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { NjordMark } from "@/components/njord/njord-mark";
import { NJORD_PROMPT_SUGGESTIONS, njordAskHref } from "@/lib/njord-intro";

type NjordAskPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Startpanelet for Njord.
 *
 * Introsiden har ingen egen chat: den ville måttet finne på svar. Panelet er derfor en rampe
 * inn i det ekte AI-søket, der Njord er koblet til kildene og svarer med grunnlaget synlig.
 */
export function NjordAskPanel({ open, onOpenChange }: NjordAskPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const focusHandle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusHandle);
    };
  }, [open, onOpenChange]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2.5 rounded-full bg-[var(--px-panel)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(15,23,42,0.1)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2"
      >
        <NjordMark className="h-7 w-7 border-white/20" />
        Spør Njord
      </button>
    );
  }

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    router.push(njordAskHref(trimmed));
  };

  return (
    <aside
      aria-label="Spør Njord"
      className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-full flex-col border-l border-[var(--px-border)] bg-[var(--px-surface-strong)] shadow-[0_0_48px_rgba(15,23,42,0.14)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 bg-[var(--px-panel)] p-4 text-white">
        <div className="flex items-center gap-3">
          <NjordMark className="h-9 w-9 border-white/20" />
          <div>
            <div className="text-[14.5px] font-semibold tracking-[-0.01em]">Njord</div>
            <div className="data-label mt-0.5 text-[8.5px] uppercase text-white/60">
              Digital analytiker
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Lukk Njord"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
            close
          </span>
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <p className="text-[13px] leading-[1.55] text-[var(--px-muted)]">
          Hei — jeg er Njord, den digitale analytikeren i Fjord Insight. Jeg svarer på selskaper,
          regnskap, eierskap og hendelser, og viser alltid grunnlaget bak svaret.
        </p>
        <p className="text-[13px] leading-[1.55] text-[var(--px-muted)]">
          Denne siden forteller om meg — den svarer ikke. Velg et startpunkt, så åpner jeg søket der
          jeg er koblet til kildene.
        </p>

        <div className="flex flex-col gap-2">
          {NJORD_PROMPT_SUGGESTIONS.map((suggestion) => (
            <Link
              key={suggestion}
              href={njordAskHref(suggestion)}
              className="rounded-xl border border-[var(--px-border)] bg-[var(--px-bg)] px-3 py-2.5 text-left text-[12.5px] leading-5 text-[var(--px-text)] transition-colors hover:border-[var(--px-accent)] hover:text-[var(--px-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
            >
              {suggestion}
            </Link>
          ))}
        </div>
      </div>

      <form
        className="flex shrink-0 items-center gap-2 border-t border-[var(--px-border-subtle)] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Spør Njord om et selskap…"
          aria-label="Spør Njord"
          className="min-w-0 flex-1 rounded-full border border-[var(--px-border)] bg-[var(--px-bg)] px-3.5 py-2.5 text-[13px] text-[var(--px-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)]"
        />
        <button
          type="submit"
          aria-label="Åpne søket med spørsmålet"
          disabled={draft.trim().length === 0}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--px-accent)] text-white transition-opacity hover:bg-[var(--px-action-hover)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
            arrow_upward
          </span>
        </button>
      </form>
    </aside>
  );
}
