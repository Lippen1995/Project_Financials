"use client";

import { useEffect, useRef, useState } from "react";

import { NjordMark } from "@/components/njord/njord-mark";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "Hvilke selskaper har verdier verdt å by på i et bo?",
  "Hvor er konkurspresset størst akkurat nå?",
  "Er noen av disse en risikabel motpart å handle med?",
];

export function DistressNjord({ workspaceId, universeCount }: { workspaceId: string; universeCount: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const turn = useRef(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, isBusy]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isBusy) {
      return;
    }

    turn.current += 1;
    const id = turn.current;
    setMessages((previous) => [...previous, { id: `u-${id}`, role: "user", content: trimmed }]);
    setDraft("");
    setIsBusy(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/distress/njord`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await response.json()) as { answer?: string; error?: string };
      setMessages((previous) => [
        ...previous,
        {
          id: `a-${id}`,
          role: "assistant",
          content: response.ok ? (data.answer ?? "Fant ikke noe svar.") : (data.error ?? "Noe gikk galt."),
        },
      ]);
    } catch {
      setMessages((previous) => [
        ...previous,
        { id: `a-${id}`, role: "assistant", content: "Beklager, jeg klarte ikke å svare akkurat nå. Prøv igjen om litt." },
      ]);
    } finally {
      setIsBusy(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-[55] inline-flex items-center gap-2 rounded-full bg-[var(--px-panel)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)]"
      >
        <NjordMark className="h-7 w-7" />
        Spør Njord
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[55] flex h-[580px] max-h-[calc(100vh-48px)] w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface-strong)] shadow-[var(--shadow-md)]">
      <div className="flex shrink-0 items-center justify-between bg-[var(--px-panel)] p-4 text-white">
        <div className="flex items-center gap-4">
          <NjordMark className="h-9 w-9" />
          <div>
            <div className="text-[14.5px] font-semibold tracking-[-0.01em]">Njord</div>
            <div className="data-label text-[8.5px] text-white/60">Analyseassistent · distress</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:bg-white/10"
          aria-label="Lukk Njord"
        >
          ×
        </button>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3.5">
            <div className="text-[13px] leading-[1.55] text-[var(--px-muted)]">
              Hei — jeg er Njord. Jeg kjenner de {universeCount.toLocaleString("nb-NO")} selskapene i utvalget og svarer
              på et fast sett spørsmål om verdier, konkurspress og motpartsrisiko. Jeg regner på tallene i tabellen — jeg
              er ikke en språkmodell, så jeg gjetter ikke utenfor det jeg kan slå opp.
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-lg border border-[var(--px-border)] bg-[var(--px-bg)] px-3 py-2.5 text-left text-[12.5px] leading-[1.4] text-[var(--px-text)] hover:border-[var(--px-accent)] hover:text-[var(--px-accent)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl border px-3 py-2.5 text-[13px] leading-[1.55] ${
                message.role === "user"
                  ? "border-[var(--px-accent)] bg-[var(--px-accent)] text-white"
                  : "border-[var(--px-border-subtle)] bg-[rgba(248,249,250,0.95)] text-[var(--px-text)]"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {isBusy ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-[var(--px-border-subtle)] bg-[rgba(248,249,250,0.95)] px-3 py-2.5 text-[12.5px] text-[var(--px-muted)]">
              Njord vurderer tallene…
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--px-border-subtle)] p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(draft);
            }
          }}
          placeholder="Spør Njord om selskapene…"
          aria-label="Spør Njord"
          className="min-w-0 flex-1 rounded-full border border-[var(--px-border)] bg-[var(--px-bg)] px-3 py-2.5 text-[13px] text-[var(--px-text)]"
        />
        <button
          type="button"
          onClick={() => void ask(draft)}
          disabled={isBusy || !draft.trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--px-accent)] text-white disabled:opacity-40"
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
