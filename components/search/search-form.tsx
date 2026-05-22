"use client";

import { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SearchForm({
  compact = false,
  placeholder = "S\u00f8k etter selskap, person eller organisasjonsnummer",
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
      className={`flex w-full flex-col gap-2 sm:flex-row ${
        compact ? "max-w-none" : "max-w-2xl"
      }`}
    >
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
        {"S\u00f8k selskaper"}
      </button>
    </form>
  );
}
