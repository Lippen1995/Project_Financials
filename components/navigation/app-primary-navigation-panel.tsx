import React from "react";
import Link from "next/link";

import {
  isGlobalNavItemActive,
  type GlobalNavMenuCategory,
  type GlobalNavMenuCategoryId,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

type AppPrimaryNavigationPanelProps = {
  activeCategory: GlobalNavMenuCategoryId;
  categories: GlobalNavMenuCategory[];
  pathname: string;
  onCategoryChange: (category: GlobalNavMenuCategoryId) => void;
  onNavigate: () => void;
};

export function AppPrimaryNavigationPanel({
  activeCategory,
  categories,
  pathname,
  onCategoryChange,
  onNavigate,
}: AppPrimaryNavigationPanelProps) {
  const selectedCategory =
    categories.find((category) => category.id === activeCategory) ?? categories[0];

  if (!selectedCategory) {
    return null;
  }

  function moveCategoryFocus(
    event: React.KeyboardEvent<HTMLButtonElement>,
    categoryIndex: number,
  ) {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (categoryIndex + direction + categories.length) % categories.length;
    const nextCategory = categories[nextIndex];
    if (!nextCategory) {
      return;
    }

    onCategoryChange(nextCategory.id);
    const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
      '[role="tab"]',
    );
    tabs?.[nextIndex]?.focus();
  }

  return (
    <div
      role="dialog"
      aria-label="Hovedmeny"
      className="grid grid-cols-[8rem_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] sm:grid-cols-[10rem_minmax(0,1fr)]"
    >
      <div
        role="tablist"
        aria-label="Menykategorier"
        aria-orientation="vertical"
        className="flex flex-col bg-[var(--px-panel)] p-2 sm:p-4"
      >
        {categories.map((category, index) => {
          const selected = category.id === selectedCategory.id;

          return (
            <button
              key={category.id}
              id={`primary-nav-tab-${category.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`primary-nav-panel-${category.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onCategoryChange(category.id)}
              onKeyDown={(event) => moveCategoryFocus(event, index)}
              className={cn(
                "data-label relative flex flex-none items-center px-3 py-4 text-left text-xs font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--px-surface)] sm:px-5",
                selected
                  ? "text-[var(--px-bg)] before:absolute before:left-2 before:h-7 before:w-0.5 before:bg-[var(--px-surface)]"
                  : "text-[var(--px-bg)] opacity-65 hover:bg-slate-700 hover:opacity-100",
              )}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <div
        id={`primary-nav-panel-${selectedCategory.id}`}
        role="tabpanel"
        aria-labelledby={`primary-nav-tab-${selectedCategory.id}`}
        className="min-w-0 bg-[var(--px-surface)]"
      >
        {selectedCategory.items.map((item, index) => {
          const active = isGlobalNavItemActive(item, pathname);

          return (
            <Link
              key={item.href}
              href={item.href as never}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "grid grid-cols-[2.5rem_minmax(0,1fr)_2rem] items-center gap-4 border-b border-[var(--px-border)] px-5 py-4 text-[var(--px-text)] transition-colors last:border-b-0 hover:bg-[var(--px-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--px-accent)]",
                active && "bg-[var(--px-subtle)] font-semibold text-[var(--px-accent)]",
              )}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined text-[22px] text-[var(--px-muted)]"
              >
                {item.icon}
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="data-label text-right text-xs tabular-nums text-[var(--px-muted)]">
                {String(index + 1).padStart(2, "0")}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
