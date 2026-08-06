"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { CompanyTabId } from "./company-tabs";

/** Material Symbols icon per tab — matches the "5C" company profile design. */
const TAB_ICONS: Record<CompanyTabId, string> = {
  oversikt: "dashboard",
  regnskap: "account_balance",
  nokkeltall: "query_stats",
  konsern: "account_tree",
  aksjonaerer: "groups",
  kunngjoringer: "campaign",
  dokumenter: "folder",
  nyheter: "newspaper",
  nettilknytning: "bolt",
  sokkeleksponering: "oil_barrel",
  immaterielt: "copyright",
};

/** Slack space either side of the exact edge, so sub-pixel widths don't leave a dead arrow. */
const EDGE_EPSILON = 2;

export function CompanyTabsNav({
  companySlug,
  activeTab,
  activeDdRoomId,
  tabs,
}: {
  companySlug: string;
  activeTab: CompanyTabId;
  activeDdRoomId?: string | null;
  tabs: Array<{ id: CompanyTabId; label: string }>;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncArrows = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    setCanScrollLeft(scroller.scrollLeft > EDGE_EPSILON);
    setCanScrollRight(scroller.scrollLeft < maxScroll - EDGE_EPSILON);
  }, []);

  // Bring the active tab into view without ever scrolling the page vertically.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (scroller && active) {
      const overflowLeft = active.offsetLeft - scroller.scrollLeft;
      const overflowRight =
        active.offsetLeft + active.offsetWidth - (scroller.scrollLeft + scroller.clientWidth);
      if (overflowLeft < 0) {
        scroller.scrollLeft = Math.max(0, active.offsetLeft - 24);
      } else if (overflowRight > 0) {
        scroller.scrollLeft += overflowRight + 24;
      }
    }
    syncArrows();
  }, [activeTab, syncArrows]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(syncArrows);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [syncArrows]);

  const scrollByStep = useCallback((direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * Math.round(scroller.clientWidth * 0.7), behavior: "smooth" });
  }, []);

  return (
    <div className="sticky top-[4.25rem] z-30 -mx-4 border-b border-[var(--px-border)] bg-[var(--px-bg)]/95 backdrop-blur-sm sm:-mx-6 lg:-mx-10">
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={syncArrows}
          className="company-tabs-scroller overflow-x-auto overflow-y-hidden px-4 sm:px-6 lg:px-10"
        >
          <div className="flex min-w-max gap-1">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  ref={active ? activeRef : undefined}
                  href={`/companies/${companySlug}?tab=${tab.id}${activeDdRoomId ? `&ddRoom=${activeDdRoomId}` : ""}`}
                  className={cn(
                    "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-4 text-sm transition-colors",
                    active
                      ? "border-[var(--px-accent)] font-semibold text-[var(--px-text)]"
                      : "border-transparent font-medium text-[var(--px-muted)] hover:text-[var(--px-text)]",
                  )}
                >
                  <span className="material-symbols-outlined text-[19px]" aria-hidden="true">
                    {TAB_ICONS[tab.id]}
                  </span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        <TabArrow direction="left" visible={canScrollLeft} onClick={() => scrollByStep(-1)} />
        <TabArrow direction="right" visible={canScrollRight} onClick={() => scrollByStep(1)} />
      </div>
    </div>
  );
}

function TabArrow({
  direction,
  visible,
  onClick,
}: {
  direction: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  const isLeft = direction === "left";
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute inset-y-0 z-10 flex items-center transition-opacity duration-150",
        isLeft ? "left-0 pl-1 pr-8" : "right-0 pl-8 pr-1",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        background: `linear-gradient(to ${isLeft ? "right" : "left"}, var(--px-bg) 45%, transparent)`,
      }}
    >
      <button
        type="button"
        tabIndex={visible ? 0 : -1}
        onClick={onClick}
        aria-label={isLeft ? "Vis faner til venstre" : "Vis faner til høyre"}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] text-[var(--px-muted)] shadow-sm transition-colors hover:text-[var(--px-text)]",
          visible ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          {isLeft ? "chevron_left" : "chevron_right"}
        </span>
      </button>
    </div>
  );
}
