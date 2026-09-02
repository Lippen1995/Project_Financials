"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminSubNavItem = {
  key: string;
  label: string;
  href: string;
};

export type AdminSubNavGroup = {
  label: string;
  items: AdminSubNavItem[];
};

type AdminSubNavProps = {
  groups: AdminSubNavGroup[];
};

function isActive(pathname: string, href: string) {
  // "/admin" must not light up for every child route, so the overview link is
  // matched exactly while section links also match their own subtrees.
  return href === "/admin" ? pathname === href : pathname.startsWith(href);
}

/**
 * Sticky admin rail. Sits directly under the app header and stays put while a
 * page scrolls, with a filter box for finding a surface by name once the list
 * outgrows a glance.
 */
export function AdminSubNav({ groups }: AdminSubNavProps) {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !normalizedQuery || item.label.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="sticky top-16 z-20 -mx-4 border-b border-[var(--px-border)] bg-[rgba(248,249,255,0.94)] backdrop-blur-md sm:-mx-6 lg:-mx-10">
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 sm:px-6 lg:px-10">
        {/* Narrow screens get one scrollable strip; from sm the groups wrap instead. */}
        <nav
          aria-label="Administrasjon"
          className="flex flex-1 items-center gap-x-5 gap-y-2 overflow-x-auto sm:flex-wrap sm:overflow-x-visible"
        >
          {visibleGroups.map((group) => (
            <div key={group.label} className="flex shrink-0 items-center gap-x-2 gap-y-1 sm:flex-wrap">
              <span className="data-label pr-0.5 text-[9px] text-[var(--px-muted)]">
                {group.label}
              </span>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href as never}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-[13px] transition-colors ${
                      active
                        ? "bg-[var(--px-accent-soft)] font-semibold text-[var(--px-text)]"
                        : "text-[var(--px-muted)] hover:border-[var(--px-border)] hover:bg-[var(--px-subtle)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
          {visibleGroups.length === 0 ? (
            <span className="text-[13px] text-[var(--px-muted)]">Ingen adminsider matcher.</span>
          ) : null}
        </nav>

        <label className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--px-border)] bg-[var(--px-surface-strong)] px-3 py-1.5">
          <span aria-hidden className="material-symbols-outlined text-[16px] text-[var(--px-muted)]">
            search
          </span>
          <span className="sr-only">Finn adminside</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Finn adminside"
            className="w-[130px] border-none bg-transparent text-[13px] text-[var(--px-text)] outline-none placeholder:text-[var(--px-muted)]"
          />
        </label>
      </div>
    </div>
  );
}
