"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent } from "react";

export function SearchForm({
  compact = false,
  placeholder = "Søk på selskapsnavn eller organisasjonsnummer",
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
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
      <input
        name="query"
        defaultValue={searchParams.get("query") ?? ""}
        placeholder={placeholder}
        className="min-h-12 flex-1 rounded-full border border-ink/10 bg-white px-5 text-sm outline-none transition focus:border-tide"
      />
      <button
        type="submit"
        className={`rounded-full px-5 py-3 text-sm font-semibold text-white ${compact ? "bg-ember" : "bg-tide"}`}
      >
        Søk i ProjectX
      </button>
    </form>
  );
}
