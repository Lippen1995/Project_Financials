"use client";

import { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SearchForm({
  compact = false,
  placeholder = "Søk på selskapsnavn, person eller organisasjonsnummer",
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
      className="flex w-full flex-col gap-3 rounded-[1rem] border border-[rgba(15,23,42,0.1)] bg-[rgba(255,255,255,0.92)] p-2 sm:flex-row"
    >
      <input
        name="query"
        defaultValue={searchParams.get("query") ?? ""}
        placeholder={placeholder}
        className="min-h-14 flex-1 rounded-[0.85rem] bg-transparent px-4 text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
      />
      <button
        type="submit"
        className={`min-h-14 rounded-[0.85rem] px-5 text-sm font-semibold ${
          compact
            ? "border border-[rgba(15,23,42,0.12)] bg-[rgba(49,73,95,0.06)] text-slate-800"
            : "bg-[#182535] text-white"
        }`}
      >
        Søk i ProjectX
      </button>
    </form>
  );
}
