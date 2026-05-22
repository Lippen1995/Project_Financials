"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { type GlobalNavItem } from "@/lib/navigation";

function isNavItemActive(href: string, pathname: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (pathname === href) {
    return true;
  }

  return pathname.startsWith(`${href}/`);
}

export function AppLayoutPrimaryNav({ items }: { items: GlobalNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active = isNavItemActive(item.href, pathname);

        return (
          <Link
            key={item.href}
            href={item.href as never}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 border-b-2 px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-[var(--px-accent)] font-semibold text-[var(--px-accent)]"
                : "border-transparent font-medium text-[var(--px-muted)] hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
