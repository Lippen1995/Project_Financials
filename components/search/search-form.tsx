"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const AI_PREFERENCE_KEY = "px:ai-search-enabled";

export function SearchForm({
  compact = false,
  placeholder = "Søk etter selskap, person eller organisasjonsnummer",
}: {
  compact?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // AI search is opt-in (the UI guard): off unless the user turns it on. The choice is
  // sticky across searches via localStorage, but an explicit `ai` in the URL wins so a
  // shared/bookmarked AI search restores correctly.
  const [aiEnabled, setAiEnabled] = useState(false);
  useEffect(() => {
    if (searchParams.get("ai") === "1") {
      setAiEnabled(true);
      return;
    }
    setAiEnabled(window.localStorage.getItem(AI_PREFERENCE_KEY) === "1");
  }, [searchParams]);

  function toggleAi(next: boolean) {
    setAiEnabled(next);
    window.localStorage.setItem(AI_PREFERENCE_KEY, next ? "1" : "0");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = String(formData.get("query") ?? "").trim();
    const params = new URLSearchParams(searchParams.toString());

    if (query) {
      params.set("query", query);
    } else {
      params.delete("query");
    }

    // Only tag the search as AI when the user opted in AND actually typed something —
    // an empty AI search has nothing for the agent to reason about.
    if (aiEnabled && query) {
      params.set("ai", "1");
    } else {
      params.delete("ai");
    }

    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`flex w-full flex-col gap-3 ${compact ? "max-w-none" : "max-w-2xl"}`}
    >
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <input
          name="query"
          defaultValue={searchParams.get("query") ?? ""}
          placeholder={placeholder}
          className="min-h-14 flex-1 border border-[var(--px-border)] bg-[rgba(255,255,255,0.9)] px-4 text-[15px] text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)]"
        />
        <button
          type="submit"
          className="min-h-14 border border-[var(--px-panel)] bg-[var(--px-panel)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--px-action-hover)] sm:min-w-[168px]"
        >
          {aiEnabled ? "Søk med AI" : "Søk selskaper"}
        </button>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--px-muted)]">
        <button
          type="button"
          role="switch"
          aria-checked={aiEnabled}
          onClick={() => toggleAi(!aiEnabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
            aiEnabled
              ? "border-[var(--px-accent)] bg-[var(--px-accent)]"
              : "border-[var(--px-border)] bg-[rgba(255,255,255,0.9)]"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              aiEnabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </button>
        <span className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
          <span className={aiEnabled ? "font-semibold text-[var(--px-text)]" : ""}>
            {"AI-søk"}
          </span>
          <span className="text-xs text-[var(--px-muted)]">
            {aiEnabled
              ? "– diskuter og finjuster søket med AI"
              : "– slå på for analytiske søk (konkurrenter, oppkjøp, kjeder)"}
          </span>
        </span>
      </label>
    </form>
  );
}
