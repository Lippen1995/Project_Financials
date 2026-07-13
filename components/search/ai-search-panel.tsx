"use client";

import { FormEvent, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

/**
 * Docked conversational panel for AI search. Opens alongside the results when a search is
 * run with chat enabled (`ai=1`), so the user can see the companies AND refine them
 * in conversation at the same time — a side panel, not a modal, precisely so the results
 * stay visible while they tune.
 *
 * SHELL ONLY (Step 0.5): the composer and streaming are not wired to the agent yet. The
 * panel renders the conversation scaffold and the current query; Step 3/4
 * connect it to /api/ai-search. No LLM is called from here today.
 */
export function AiSearchPanel({ query }: { query: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    query
      ? [
          {
            id: "intro",
            role: "assistant",
            content: `Chatten er åpnet for søket «${query}». AI-samtalen kobles på i et senere steg – her vil du snart kunne diskutere og finjustere trefflisten sammen med meg.`,
          },
        ]
      : [
          {
            id: "intro-empty",
            role: "assistant",
            content:
              "Skriv et analytisk søk – for eksempel «konkurrenter av Claire Kids» – så finner vi og finjusterer trefflisten sammen.",
          },
        ],
  );
  const [draft, setDraft] = useState("");

  function closePanel() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ai");
    const qs = params.toString();
    router.push((qs ? `/search?${qs}` : "/search") as Route);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    // Local echo only for now — Step 4 replaces this with a streamed agent turn.
    setMessages((prev) => [
      ...prev,
      { id: `u-${prev.length}`, role: "user", content: trimmed },
      {
        id: `a-${prev.length}`,
        role: "assistant",
        content: "AI-samtalen er ikke koblet til ennå. Dette kommer i et senere steg.",
      },
    ]);
    setDraft("");
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-[60] flex w-full flex-col border-l border-[var(--px-border)] bg-[var(--px-surface)] shadow-[0_0_48px_rgba(15,23,42,0.16)] sm:w-[400px]"
      aria-label="AI-søk samtale"
    >
      <header className="flex items-center justify-between border-b border-[var(--px-border-subtle)] px-5 py-4">
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
        <button
          type="button"
          onClick={closePanel}
          aria-label="Lukk AI-søk"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-6 ${
                message.role === "user"
                  ? "rounded-2xl rounded-br-sm bg-[var(--px-panel)] text-white"
                  : "rounded-2xl rounded-bl-sm bg-[var(--px-subtle)] text-[var(--px-text)]"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="border-t border-[var(--px-border-subtle)] px-4 py-3.5"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={1}
            placeholder="Be om en justering – f.eks. «kun Vestland»…"
            className="max-h-32 min-h-[44px] flex-1 resize-none border border-[var(--px-border)] bg-[rgba(255,255,255,0.95)] px-3 py-2.5 text-sm text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)] focus:border-[var(--px-accent)]"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="flex h-[44px] w-[44px] items-center justify-center bg-[var(--px-panel)] text-white transition-colors hover:bg-[var(--px-action-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
          </button>
        </div>
      </form>
    </aside>
  );
}
