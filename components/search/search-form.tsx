"use client";

import { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SearchForm({
  compact = false,
  placeholder = "Søk etter selskap, person eller organisasjonsnummer",
}: {
  compact?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full flex-col gap-3 rounded-2xl border border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.92)] p-2 sm:flex-row"
    >
      <input
        name="query"
        defaultValue={searchParams.get("query") ?? ""}
        placeholder={placeholder}
        className="min-h-14 flex-1 rounded-xl bg-transparent px-4 text-[15px] text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)]"
      />
      <button
        type="submit"
        className={`min-h-14 rounded-xl px-5 text-sm font-semibold ${
          compact
            ? "border border-[rgba(15,23,42,0.12)] bg-[var(--px-subtle)] text-[var(--px-text)]"
            : "bg-[var(--px-action)] text-white hover:bg-[var(--px-action-hover)]"
        }`}
      >
        Søk selskaper
      </button>
    </form>
  );
}
