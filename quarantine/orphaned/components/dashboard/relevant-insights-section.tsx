"use client";

import Link from "next/link";
import { useState } from "react";

import type { InsightItem, InsightVisual } from "@/server/news/dashboard-insights-service";
import type { NewsDataType } from "@/server/news/news-data-type";

const DATA_TYPE_FILTERS: Array<{ value: "all" | NewsDataType; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "company", label: "Selskapsnyheter" },
  { value: "industry", label: "Industrinyheter" },
  { value: "macro", label: "Makro" },
  { value: "regulatory", label: "Regulatorisk" },
];

function formatInsightDate(value: string, variant: "highlight" | "compact") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (variant === "compact") {
    return date.toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
    });
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).toUpperCase();
}

function VisualPanel({ visual, title }: { visual: InsightVisual | null; title: string }) {
  if (visual?.type === "image") {
    return (
      <img
        src={visual.imageUrl}
        alt={visual.imageAlt}
        className="w-full h-40 object-cover"
      />
    );
  }

  const eyebrow = visual?.type === "textual" ? visual.eyebrow : null;
  const value = visual?.type === "textual" ? visual.value : title;

  return (
    <div className="flex h-40 w-full flex-col justify-between border border-outline-variant bg-surface-container-low p-5">
      <span className="font-label-caps text-xs text-outline-variant tracking-widest">
        {eyebrow ?? "MARKET"}
      </span>
      <p className="font-headline-sm text-headline-sm text-primary">{value}</p>
    </div>
  );
}

function HighlightedInsightCard({ item, withBorder = true }: { item: InsightItem; withBorder?: boolean }) {
  return (
    <article className={`grid grid-cols-12 gap-6 ${withBorder ? "border-b border-outline-variant pb-8" : ""}`}>
      <div className="col-span-12 sm:col-span-3">
        {item.contextLabel ? (
          <p className="font-label-caps text-xs text-secondary tracking-widest mb-1">
            {item.contextLabel}
          </p>
        ) : null}
        <p className="font-label-caps text-xs text-outline-variant tracking-widest">
          {formatInsightDate(item.publishedAt, "highlight")}
        </p>
      </div>
      <div className="col-span-12 sm:col-span-6">
        <Link href={item.href as never} className="group">
          <h4 className="font-headline-sm text-headline-sm text-primary mb-3 transition-colors group-hover:text-secondary">
            {item.title}
          </h4>
        </Link>
        {item.summary ? (
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed line-clamp-3">
            {item.summary}
          </p>
        ) : null}
      </div>
      <Link href={item.href as never} className="col-span-12 sm:col-span-3">
        <VisualPanel visual={item.visual} title={item.title} />
      </Link>
    </article>
  );
}

function CompactInsightRow({ item }: { item: InsightItem }) {
  const secondary = [item.companyLabel, item.sourceLabel].filter(Boolean).join(" / ");

  return (
    <Link
      href={item.href as never}
      className="grid grid-cols-12 gap-4 border-b border-outline-variant py-4 transition-colors last:border-b-0 hover:bg-surface-container-low"
    >
      <div className="col-span-12 sm:col-span-3">
        {item.contextLabel ? (
          <p className="font-label-caps text-xs text-secondary tracking-widest mb-1">
            {item.contextLabel}
          </p>
        ) : null}
        <p className="font-label-caps text-xs text-outline-variant tracking-widest">
          {formatInsightDate(item.publishedAt, "compact")}
        </p>
      </div>
      <div className="col-span-12 sm:col-span-8">
        <h4 className="font-headline-sm text-headline-sm text-primary">{item.title}</h4>
        {secondary ? (
          <p className="mt-1 font-body-md text-sm text-on-surface-variant">{secondary}</p>
        ) : null}
      </div>
      <div className="col-span-12 hidden items-center justify-end sm:col-span-1 sm:flex">
        <span className="material-symbols-outlined text-outline-variant text-xl">arrow_forward</span>
      </div>
    </Link>
  );
}

export function RelevantInsightsSection({ items }: { items: InsightItem[] }) {
  const [selectedDataType, setSelectedDataType] = useState<"all" | NewsDataType>("all");
  const filteredItems =
    selectedDataType === "all"
      ? items
      : items.filter((item) => item.dataType === selectedDataType);
  const highlighted = filteredItems.slice(0, 2);
  const compact = filteredItems.slice(2, 8);

  return (
    <section className="max-w-container-max mx-auto px-margin-lg pb-16">
      <div className="border-b border-primary pb-3 mb-8 flex flex-wrap items-end justify-between gap-4">
        <h3 className="font-headline-md text-headline-md text-primary tracking-wide uppercase">
          Relevant innsikt for deg
        </h3>
        <div className="flex flex-wrap gap-2" aria-label="Filtrer innsikt etter datatype">
          {DATA_TYPE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={selectedDataType === filter.value}
              onClick={() => setSelectedDataType(filter.value)}
              className={`border px-3 py-1.5 font-label-caps text-xs tracking-widest transition-colors ${
                selectedDataType === filter.value
                  ? "border-primary bg-primary text-white"
                  : "border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="border-b border-outline-variant pb-8">
          <p className="font-headline-sm text-headline-sm text-primary mb-2">
            Ingen nye innsikter akkurat nå
          </p>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Nye saker vises her når de finnes i tilgjengelige kilder.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {highlighted.map((item, index) => (
            <HighlightedInsightCard
              key={item.id}
              item={item}
              withBorder={index < highlighted.length - 1 || compact.length > 0}
            />
          ))}

          {compact.length > 0 ? (
            <div className="border-t border-primary">
              {compact.map((item) => (
                <CompactInsightRow key={item.id} item={item} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
