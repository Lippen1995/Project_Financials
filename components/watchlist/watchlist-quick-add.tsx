"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addToWatchlistAction } from "@/server/actions/workspace-collaboration-actions";
import { cn } from "@/lib/utils";

type Suggestion = {
  orgNumber: string;
  name: string;
  municipality: string | null;
};

const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 200;

/**
 * "+ Legg til selskap" on the watchlist page: opens an inline company typeahead.
 * Selecting a result adds the company to the watchlist immediately (no navigation)
 * and refreshes the list, keeping the panel open so several companies can be added.
 */
export function WatchlistQuickAdd({
  workspaceId,
  watchedOrgNumbers,
}: {
  workspaceId: string;
  watchedOrgNumbers: string[];
}) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedNow, setAddedNow] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !containerRef.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Debounced typeahead fetch; stale responses dropped via AbortController.
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/companies/search?query=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("search failed");
        const payload = (await response.json()) as {
          data: Array<{
            company: { orgNumber: string; name: string; municipality?: string | null };
          }>;
        };
        setSuggestions(
          payload.data.slice(0, MAX_SUGGESTIONS).map((result) => ({
            orgNumber: result.company.orgNumber,
            name: result.company.name,
            municipality: result.company.municipality ?? null,
          })),
        );
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query, open]);

  const alreadyWatched = new Set(watchedOrgNumbers);

  function handleAdd(suggestion: Suggestion) {
    if (adding || alreadyWatched.has(suggestion.orgNumber) || addedNow.has(suggestion.orgNumber)) {
      return;
    }
    setError(null);
    setAdding(suggestion.orgNumber);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("orgNumber", suggestion.orgNumber);
      formData.set("workspaceId", workspaceId);
      const result = await addToWatchlistAction(formData);
      setAdding(null);
      if (!result.ok) {
        setError(result.message ?? "Kunne ikke legge til selskapet.");
        return;
      }
      setAddedNow((prev) => new Set(prev).add(suggestion.orgNumber));
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--px-action-hover)]"
      >
        + Legg til selskap
      </button>
    );
  }

  const showDropdown = query.trim().length >= MIN_QUERY_LENGTH;

  return (
    <div ref={containerRef} className="relative w-[min(24rem,80vw)]">
      <div className="flex h-10 items-center gap-2 rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 focus-within:border-[var(--px-accent)]">
        <span className="material-symbols-outlined text-[18px] text-[var(--px-muted)]">search</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          placeholder="Søk etter selskap å følge…"
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)]"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Lukk søk"
          className="text-[var(--px-muted)] hover:text-[var(--px-text)]"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {error ? (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      {showDropdown ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--px-border)] bg-white py-1 shadow-[0_24px_38px_rgba(15,23,42,0.10)]"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-[var(--px-muted)]">Søker…</li>
          ) : suggestions.length === 0 ? (
            <li className="px-4 py-2.5 text-sm text-[var(--px-muted)]">Ingen treff</li>
          ) : (
            suggestions.map((suggestion) => {
              const isWatched =
                alreadyWatched.has(suggestion.orgNumber) || addedNow.has(suggestion.orgNumber);
              const isAdding = adding === suggestion.orgNumber;
              return (
                <li key={suggestion.orgNumber} role="option" aria-selected={false}>
                  <button
                    type="button"
                    disabled={isWatched || isAdding}
                    onClick={() => handleAdd(suggestion)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors",
                      isWatched ? "cursor-default opacity-70" : "hover:bg-[var(--px-subtle)]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--px-text)]">
                        {suggestion.name}
                      </span>
                      <span className="block text-xs tabular-nums text-[var(--px-muted)]">
                        Org.nr. {suggestion.orgNumber}
                        {suggestion.municipality ? ` · ${suggestion.municipality}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold">
                      {isAdding ? (
                        <span className="text-[var(--px-muted)]">Legger til…</span>
                      ) : isWatched ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          Fulgt
                        </span>
                      ) : (
                        <span className="text-[var(--px-accent)]">+ Følg</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
