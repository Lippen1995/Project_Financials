"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Route } from "next";
import { useRouter } from "next/navigation";

import {
  DEFAULT_NAV_AI_SEARCH_ENABLED,
  buildNavSearchHref,
  canShowNavSearchSuggestions,
} from "@/lib/nav-search";
import type { NavSearchSuggestion as Suggestion } from "@/lib/nav-search";
import type { GlobalNavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const MAX_SUGGESTIONS = 8;
const DEBOUNCE_MS = 200;

/**
 * Toolbar search: expands into an inline input with company, person and role typeahead.
 * Selecting a suggestion opens its relevant workspace; Enter resolves the query scope.
 */
export function NavSearch({ item, active }: { item: GlobalNavItem; active: boolean }) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [aiEnabled, setAiEnabled] = useState(DEFAULT_NAV_AI_SEARCH_ENABLED);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  // Focus the input as soon as the search expands.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  // The dropdown is portalled to the body (the toolbar's overflow container would
  // clip an in-flow dropdown), so track the input's viewport position while open.
  useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const rect = pillRef.current?.getBoundingClientRect();
      if (rect) {
        setAnchor({ left: rect.left, top: rect.bottom, width: rect.width });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Debounced typeahead fetch. Stale responses are dropped via AbortController.
  useEffect(() => {
    const trimmed = query.trim();
    if (!open || !canShowNavSearchSuggestions(trimmed, aiEnabled)) {
      setSuggestions([]);
      setLoading(false);
      setSearchError(null);
      setHighlighted(-1);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setSearchError(null);
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?query=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        const payload = (await response.json()) as {
          data: Suggestion[];
          meta: { unavailableSources: string[] };
        };
        setSuggestions(payload.data.slice(0, MAX_SUGGESTIONS));
        const unavailableLabels = payload.meta.unavailableSources.map((source) =>
          source === "companies"
            ? "Selskapsøk"
            : source === "persons"
              ? "Personsøk"
              : "Rollesøk",
        );
        setSearchError(
          unavailableLabels.length > 0
            ? `${unavailableLabels.join(" og ")} er midlertidig utilgjengelig.`
            : null,
        );
        setHighlighted(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([]);
          setSearchError("Søket er midlertidig utilgjengelig.");
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [aiEnabled, query, open]);

  function close() {
    setOpen(false);
    setQuery("");
    setSuggestions([]);
    setLoading(false);
    setSearchError(null);
    setHighlighted(-1);
    setAiEnabled(DEFAULT_NAV_AI_SEARCH_ENABLED);
  }

  function goToSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    close();
    router.push(buildNavSearchHref(trimmed, aiEnabled, crypto.randomUUID()) as Route);
  }

  function toggleAi() {
    const next = !aiEnabled;
    setAiEnabled(next);
    setSuggestions([]);
    setLoading(false);
    setSearchError(null);
    setHighlighted(-1);
  }

  async function goToSuggestion(suggestion: Suggestion) {
    const submittedQuery = query.trim();
    try {
      if (suggestion.type === "company") {
        await fetch("/api/search-history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            eventKey: crypto.randomUUID(),
            query: submittedQuery,
            resultCount: suggestions.length,
          }),
          keepalive: true,
        });
      }
    } catch {
      // History must never block navigation to a real registry result.
    } finally {
      close();
      router.push(suggestion.href as Route);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      // Enter always searches the literal typed text — suggestions are chosen by
      // clicking, never by Enter, so a hovered row never overrides what was typed.
      event.preventDefault();
      goToSearch(query);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 border-b-2 px-3 py-1.5 text-sm transition-colors",
          active
            ? "border-[var(--px-accent)] font-semibold text-[var(--px-accent)]"
            : "border-transparent font-medium text-[var(--px-muted)] hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]",
        )}
      >
        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
        <span>{item.label}</span>
      </button>
    );
  }

  const showDropdown = canShowNavSearchSuggestions(query, aiEnabled);

  return (
    <div ref={containerRef} className="relative">
      <div
        ref={pillRef}
        className="flex h-9 w-[min(20rem,60vw)] items-center gap-2 rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-3 focus-within:border-[var(--px-accent)]"
      >
        <span className="material-symbols-outlined text-[18px] text-[var(--px-muted)]">
          {item.icon}
        </span>
        <input
          ref={inputRef}
          type="text"
          role={aiEnabled ? "searchbox" : "combobox"}
          aria-label={aiEnabled ? "AI-søk" : "Søk etter selskaper, personer og roller"}
          aria-expanded={aiEnabled ? undefined : suggestions.length > 0}
          aria-controls={aiEnabled ? undefined : listId}
          aria-autocomplete={aiEnabled ? undefined : "list"}
          value={query}
          placeholder={aiEnabled ? "Beskriv hva du vil finne…" : "Søk etter selskap, person eller rolle…"}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)]"
        />
        <button
          type="button"
          role="switch"
          aria-checked={aiEnabled}
          aria-label="AI-søk"
          title={aiEnabled ? "AI-søk er på" : "Slå på AI-søk"}
          onClick={toggleAi}
          className={cn(
            "data-label inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--px-accent)]",
            aiEnabled
              ? "border-[var(--px-accent)] bg-[var(--px-accent)] text-[var(--px-bg)]"
              : "border-[var(--px-border)] text-[var(--px-accent)] hover:bg-[var(--px-subtle)]",
          )}
        >
          AI
        </button>
      </div>

      {showDropdown && anchor
        ? createPortal(
            <ul
              ref={dropdownRef}
              id={listId}
              role="listbox"
              style={{
                position: "fixed",
                left: anchor.left,
                top: anchor.top + 6,
                width: Math.max(anchor.width, 288),
              }}
              className="z-[70] max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] py-1 shadow-[0_24px_38px_rgba(15,23,42,0.10)]"
            >
              {loading && suggestions.length === 0 ? (
                <li className="px-4 py-2.5 text-sm text-[var(--px-muted)]">Søker…</li>
              ) : searchError && suggestions.length === 0 ? (
                <li role="status" className="px-4 py-2.5 text-sm text-amber-700">
                  {searchError}
                </li>
              ) : suggestions.length === 0 ? (
                <li className="px-4 py-2.5 text-sm text-[var(--px-muted)]">Ingen treff</li>
              ) : (
                <>
                  {suggestions.map((suggestion, index) => (
                    <li key={`${suggestion.type}:${suggestion.id}`} role="option" aria-selected={index === highlighted}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlighted(index)}
                        onClick={() => goToSuggestion(suggestion)}
                        className={cn(
                          "flex w-full items-start gap-4 px-4 py-2 text-left transition-colors",
                          index === highlighted ? "bg-[var(--px-subtle)]" : "hover:bg-[var(--px-subtle)]",
                        )}
                      >
                        <span className="material-symbols-outlined mt-0.5 text-[18px] text-[var(--px-muted)]">
                          {suggestion.type === "company"
                            ? "apartment"
                            : suggestion.type === "person"
                              ? "person"
                              : "badge"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-4">
                            <span className="truncate text-sm font-semibold text-[var(--px-text)]">
                              {suggestion.title}
                            </span>
                            <span className="data-label shrink-0 text-[9px] font-semibold uppercase text-[var(--px-muted)]">
                              {suggestion.type === "company"
                                ? "Selskap"
                                : suggestion.type === "person"
                                  ? "Person"
                                  : "Rolle"}
                            </span>
                          </span>
                          <span className="block truncate text-xs tabular-nums text-[var(--px-muted)]">
                            {suggestion.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {searchError ? (
                    <li role="status" className="border-t border-[var(--px-border)] px-4 py-2 text-xs text-amber-700">
                      {searchError}
                    </li>
                  ) : null}
                </>
              )}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
