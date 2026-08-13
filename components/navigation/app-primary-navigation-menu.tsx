"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { AppPrimaryNavigationPanel } from "@/components/navigation/app-primary-navigation-panel";
import {
  isGlobalNavItemActive,
  type GlobalNavMenuCategory,
  type GlobalNavMenuCategoryId,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

function categoryForPath(
  categories: GlobalNavMenuCategory[],
  pathname: string,
): GlobalNavMenuCategoryId {
  return (
    categories.find((category) =>
      category.items.some((item) => isGlobalNavItemActive(item, pathname)),
    )?.id ?? "explore"
  );
}

export function AppPrimaryNavigationMenu({
  categories,
}: {
  categories: GlobalNavMenuCategory[];
}) {
  const pathname = usePathname();
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<GlobalNavMenuCategoryId>(() =>
    categoryForPath(categories, pathname),
  );

  const hasActiveDestination = categories.some((category) =>
    category.items.some((item) => isGlobalNavItemActive(item, pathname)),
  );

  useEffect(() => {
    setOpen(false);
    setActiveCategory(categoryForPath(categories, pathname));
  }, [categories, pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    const focusHandle = window.setTimeout(() => {
      containerRef.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    }, 0);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusHandle);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? "Lukk hovedmeny" : "Åpne hovedmeny"}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "flex items-center gap-4 border-b-2 px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--px-bg)] sm:px-3",
          open || hasActiveDestination
            ? "border-[var(--px-accent)] text-[var(--px-accent)]"
            : "border-transparent text-[var(--px-muted)] hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]",
        )}
      >
        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">
          menu
        </span>
        <span>Meny</span>
        <span aria-hidden="true" className="material-symbols-outlined hidden text-[18px] sm:inline">
          {open ? "keyboard_arrow_up" : "keyboard_arrow_down"}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute left-0 top-full z-[60] mt-2 w-[min(46rem,calc(100vw-2rem))] shadow-[0_24px_38px_rgba(15,23,42,0.10)] max-sm:fixed max-sm:inset-x-2 max-sm:top-16 max-sm:mt-2 max-sm:w-auto"
        >
          <AppPrimaryNavigationPanel
            activeCategory={activeCategory}
            categories={categories}
            pathname={pathname}
            onCategoryChange={setActiveCategory}
            onNavigate={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
