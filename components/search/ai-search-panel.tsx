"use client";

import {
  FormEvent,
  KeyboardEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Route } from "next";
import type { CompanySearchRow } from "@/lib/company-search-sort";
import { useRouter, useSearchParams } from "next/navigation";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type AiSearchUsageSummary = {
  enabled: boolean;
  tokenLimit: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;
  resetAt: string | null;
};

const tokenFormatter = new Intl.NumberFormat("nb-NO");
const resetDateFormatter = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Oslo",
});

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;
export const NJORD_DEFAULT_PANEL_WIDTH = 400;

export function clampNjordPanelWidth(width: number, viewportWidth: number) {
  const availableWidth = Math.max(MIN_PANEL_WIDTH, viewportWidth - 24);
  return Math.min(Math.max(MIN_PANEL_WIDTH, width), Math.min(MAX_PANEL_WIDTH, availableWidth));
}

function TokenConsumptionBar({ usage }: { usage: AiSearchUsageSummary }) {
  const percent = Math.min(100, Math.max(0, usage.usagePercent));
  const resetLabel = usage.resetAt
    ? `Tilbakestilles ${resetDateFormatter.format(new Date(usage.resetAt))}`
    : "Tilbakestilling er ikke tilgjengelig";

  return (
    <div className="group relative mt-3" tabIndex={0} aria-describedby="njord-token-tooltip">
      <div className="mb-1 flex items-center justify-between gap-4">
        <span className="data-label text-[9px] uppercase text-[var(--px-muted)]">Tokenforbruk</span>
        <span className="data-label text-[9px] tabular-nums text-[var(--px-muted)]">
          {usage.enabled ? `${percent} %` : "Ikke aktivert"}
        </span>
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-[var(--px-subtle)]"
        role="progressbar"
        aria-label="Brukt tokenkvote"
        aria-valuemin={0}
        aria-valuemax={Math.max(1, usage.tokenLimit)}
        aria-valuenow={usage.usedTokens}
      >
        <div
          className="h-full rounded-full bg-[var(--px-accent)] transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div
        id="njord-token-tooltip"
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-panel)] p-3 text-[11px] leading-5 text-[var(--px-bg)] shadow-[0_8px_24px_rgba(15,23,42,0.14)] group-hover:block group-focus-visible:block"
      >
        {usage.enabled ? (
          <>
            <div className="flex justify-between gap-4">
              <span>Brukt</span>
              <span className="tabular-nums">
                {tokenFormatter.format(usage.usedTokens)} av {tokenFormatter.format(usage.tokenLimit)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Gjenstår</span>
              <span className="tabular-nums">{tokenFormatter.format(usage.remainingTokens)}</span>
            </div>
            <div className="mt-1 text-[rgba(255,255,255,0.9)]">{resetLabel}</div>
          </>
        ) : (
          "Tokenkvote er ikke aktivert for abonnementet."
        )}
      </div>
    </div>
  );
}

function ChatHeaderAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group relative flex h-5 w-5 items-center justify-center rounded-full text-[var(--px-muted)] opacity-60 transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)] hover:opacity-100 focus-visible:bg-[var(--px-subtle)] focus-visible:text-[var(--px-text)] focus-visible:opacity-100 focus-visible:outline-none"
    >
      <span className="material-symbols-outlined !text-[10px]" aria-hidden="true">{icon}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden whitespace-nowrap rounded-xl border border-[var(--px-border)] bg-[var(--px-panel)] px-2 py-1 text-[9px] font-normal text-[var(--px-bg)] shadow-[0_8px_24px_rgba(15,23,42,0.14)] group-hover:block group-focus-visible:block"
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Docked conversational panel for AI search. Opens alongside the results when a search is
 * run with chat enabled (`ai=1`), so the user can see the companies AND refine them
 * in conversation at the same time — a side panel, not a modal, precisely so the results
 * stay visible while they tune.
 *
 * Wired to /api/ai-search, which runs the agent loop over the retrieval tools. The model behind
 * it is currently the deterministic rule-based client (zero API cost) — real reasoning arrives when
 * a paid adapter is enabled server-side; this component does not change when that swap happens.
 */
export function AiSearchPanel({
  query,
  usage: initialUsage,
  width,
  minimized,
  onWidthChange,
  onMinimizedChange,
  onCompanies,
}: {
  query: string | null;
  usage: AiSearchUsageSummary;
  width: number;
  minimized: boolean;
  onWidthChange: (width: number) => void;
  onMinimizedChange: (minimized: boolean) => void;
  /** Hands the companies the agent surfaced up to the workspace so they can drive the result table. */
  onCompanies?: (rows: CompanySearchRow[]) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    query
      ? [{ id: "intro", role: "assistant", content: `Analyserer «${query}» …` }]
      : [
          {
            id: "intro-empty",
            role: "assistant",
            content:
              "Skriv et analytisk søk – for eksempel «oppkjøpsmål for Fjord Defence» – så finner og finjusterer vi trefflisten sammen.",
          },
        ],
  );
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [usage, setUsage] = useState(initialUsage);
  const seq = useRef(0);
  const autoRan = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const runAgentQuery = useCallback(async (text: string, echoUser: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    seq.current += 1;
    const turn = seq.current;
    if (echoUser) {
      setMessages((prev) => [...prev, { id: `u-${turn}`, role: "user", content: trimmed }]);
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/ai-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = (await res.json()) as {
        answer?: string;
        error?: string;
        quota?: AiSearchUsageSummary;
        companies?: CompanySearchRow[];
      };
      const content = res.ok
        ? (data.answer ?? "Fant ikke noe svar.")
        : (data.error ?? "Noe gikk galt med AI-søket.");
      setMessages((prev) => [...prev, { id: `a-${turn}`, role: "assistant", content }]);
      if (data.quota) setUsage(data.quota);
      // Let the agent's ranked companies take over the result table.
      if (res.ok && data.companies) onCompanies?.(data.companies);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `a-${turn}`, role: "assistant", content: "Klarte ikke å kontakte AI-søket. Prøv igjen." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [onCompanies]);

  useEffect(() => {
    if (!minimized) messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, isLoading, minimized]);

  useEffect(() => setUsage(initialUsage), [initialUsage]);

  useEffect(() => {
    function keepPanelInsideViewport() {
      onWidthChange(clampNjordPanelWidth(width, window.innerWidth));
    }
    window.addEventListener("resize", keepPanelInsideViewport);
    return () => window.removeEventListener("resize", keepPanelInsideViewport);
  }, [onWidthChange, width]);

  // Auto-run the agent on the page query when the panel opens.
  useEffect(() => {
    if (query && !autoRan.current) {
      autoRan.current = true;
      void runAgentQuery(query, false);
    }
  }, [query, runAgentQuery]);

  function closePanel() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ai");
    const qs = params.toString();
    router.push((qs ? `/search?${qs}` : "/search") as Route);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    void runAgentQuery(trimmed, true);
    setDraft("");
  }

  function resizePanel(nextWidth: number) {
    onWidthChange(clampNjordPanelWidth(nextWidth, window.innerWidth));
  }

  function onResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = width;
    handle.setPointerCapture(event.pointerId);

    function onPointerMove(moveEvent: globalThis.PointerEvent) {
      resizePanel(startWidth + startX - moveEvent.clientX);
    }

    function onPointerUp(upEvent: globalThis.PointerEvent) {
      handle.releasePointerCapture(upEvent.pointerId);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
    }

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  }

  function onResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    resizePanel(width + (event.key === "ArrowLeft" ? 24 : -24));
  }

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => onMinimizedChange(false)}
        className="fixed bottom-5 right-5 z-[60] flex min-h-11 items-center gap-4 rounded-full border border-[var(--px-border)] bg-[var(--px-panel)] px-4 text-sm font-semibold text-[var(--px-bg)] shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition-colors hover:bg-[var(--px-action-hover)]"
        aria-label={`Åpne Njord-chatten igjen. ${messages.length} meldinger er bevart.`}
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chat</span>
        Njord
        <span className="data-label rounded-full border border-[var(--px-border)] px-2 py-0.5 text-[9px] tabular-nums">
          {messages.length}
        </span>
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-[var(--px-border)] bg-[var(--px-surface)] shadow-[0_0_48px_rgba(15,23,42,0.14)] sm:w-[var(--njord-width)]"
      style={{ "--njord-width": `${width}px` } as React.CSSProperties}
      aria-label="AI-søk samtale"
    >
      <div
        role="separator"
        aria-label="Endre bredden på Njord-chatten"
        aria-orientation="vertical"
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onResizePointerDown}
        onDoubleClick={() => resizePanel(NJORD_DEFAULT_PANEL_WIDTH)}
        onKeyDown={onResizeKeyDown}
        title="Dobbeltklikk for standardbredde"
        className="absolute inset-y-0 left-0 z-10 hidden w-2 -translate-x-1/2 cursor-ew-resize touch-none after:absolute after:inset-y-4 after:left-1/2 after:w-px after:bg-transparent hover:after:bg-[var(--px-accent)] focus-visible:bg-[var(--px-accent-soft)] focus-visible:outline-none focus-visible:after:bg-[var(--px-accent)] sm:block"
      />
      <header className="relative flex items-center border-b border-[var(--px-border-subtle)] px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-[var(--px-accent)]">
            auto_awesome
          </span>
          <div>
            <div className="text-sm font-semibold text-[var(--px-text)]">Njord</div>
            <div className="text-xs text-[var(--px-muted)]">
              Spør Njord, vår AI-hjelper, for å finjustere søket ditt
            </div>
          </div>
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-[6px]">
          <ChatHeaderAction
            label="Tilbakestill størrelse"
            icon="width_normal"
            onClick={() => resizePanel(NJORD_DEFAULT_PANEL_WIDTH)}
          />
          <ChatHeaderAction
            label="Minimer"
            icon="minimize"
            onClick={() => onMinimizedChange(true)}
          />
          <ChatHeaderAction label="Lukk" icon="close" onClick={closePanel} />
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-6 ${
                message.role === "user"
                  ? "rounded-2xl bg-[var(--px-panel)] text-[var(--px-bg)]"
                  : "rounded-2xl bg-[var(--px-subtle)] text-[var(--px-text)]"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start" aria-live="polite">
            <div className="rounded-2xl bg-[var(--px-subtle)] px-3.5 py-2.5 text-sm text-[var(--px-muted)]">
              Njord tenker …
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-[var(--px-border-subtle)] px-4 py-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder="Be om en justering – f.eks. «kun Vestland»…"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2.5 text-sm text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)] focus:border-[var(--px-accent)]"
          />
          <button
            type="submit"
            disabled={!draft.trim() || isLoading}
            aria-label="Send"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-[var(--px-panel)] text-[var(--px-bg)] transition-colors hover:bg-[var(--px-action-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
          </button>
        </div>
        <TokenConsumptionBar usage={usage} />
      </form>
    </aside>
  );
}
