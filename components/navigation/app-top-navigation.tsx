"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  buildAccountMenuSections,
  getViewerDisplayName,
  getViewerHeadline,
  getViewerInitials,
  getViewerProfileHref,
  isViewerVerified,
  type AppViewer,
} from "@/lib/account-menu";
import { type GlobalNavItem, isGlobalNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth-actions";
import { NavSearch } from "@/components/navigation/nav-search";

type AppTopNavigationProps = {
  adminNotification?: React.ReactNode;
  logoHref: string;
  navItems: GlobalNavItem[];
  viewer: AppViewer | null;
};

function MenuEntry({
  href,
  label,
  onNavigate,
}: {
  href: string;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href as never}
      role="menuitem"
      onClick={onNavigate}
      className="flex items-center rounded-xl px-3 py-2.5 text-sm text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--px-bg)]"
    >
      {label}
    </Link>
  );
}

function DisabledMenuEntry({ label }: { label: string }) {
  return (
    <div
      aria-disabled="true"
      className="flex cursor-not-allowed items-center rounded-xl px-3 py-2.5 text-sm text-[var(--px-muted)] opacity-65"
    >
      {label}
    </div>
  );
}

export function AppTopNavigation({
  adminNotification,
  logoHref,
  navItems,
  viewer,
}: AppTopNavigationProps) {
  const pathname = usePathname();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const firstMenuActionRef = useRef<HTMLAnchorElement | null>(null);

  const viewerDisplayName = getViewerDisplayName(viewer);
  const viewerInitials = getViewerInitials(viewer);
  const viewerHeadline = getViewerHeadline(viewer);
  const profileHref = getViewerProfileHref();
  const sections = buildAccountMenuSections(viewer);
  const showVerified = isViewerVerified(viewer);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    const focusHandle = window.setTimeout(() => {
      firstMenuActionRef.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusHandle);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--px-border-subtle)] bg-[rgba(248,249,255,0.92)] backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-8">
          <Link href={logoHref as never} className="shrink-0 flex-col -space-y-0.5">
            <span className="block text-[1.1rem] font-semibold tracking-[-0.03em] text-[var(--px-text)]">
              Fjord Insight
            </span>
            <span className="data-label block text-[9px] text-[var(--px-muted)] opacity-70">
              Enterprise Tier
            </span>
          </Link>

          <nav aria-label="Primærnavigasjon" className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-1 pr-2">
              {navItems.map((item) => {
                const active = isGlobalNavItemActive(item, pathname);

                if (item.href === "/search") {
                  return <NavSearch key={item.href} item={item} active={active} />;
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-3 py-1.5 text-sm transition-colors",
                      active
                        ? "border-[var(--px-accent)] font-semibold text-[var(--px-accent)]"
                        : "border-transparent font-medium text-[var(--px-muted)] hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]",
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {adminNotification}

          <div ref={containerRef} className="relative">
            {viewer ? (
              <>
              <button
                ref={buttonRef}
                type="button"
                aria-label={`${viewerDisplayName} konto`}
                aria-expanded={open}
                aria-haspopup="menu"
                aria-controls={menuId}
                onClick={() => setOpen((value) => !value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && !open) {
                    event.preventDefault();
                    setOpen(true);
                  }
                }}
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-transparent bg-[var(--px-accent-soft)] text-sm font-semibold text-[var(--px-text)] shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-all hover:border-[var(--px-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--px-bg)]"
              >
                {viewer.image ? (
                  <span
                    role="img"
                    aria-label={viewerDisplayName}
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url("${viewer.image}")` }}
                  />
                ) : (
                  <span>{viewerInitials}</span>
                )}
              </button>

                {open ? (
                  <div
                    id={menuId}
                    role="menu"
                    aria-label="Kontomeny"
                    className="absolute right-0 top-[calc(100%+8px)] z-[60] flex max-h-[calc(100vh-5rem)] w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-[var(--px-border)] bg-white shadow-[0_24px_38px_rgba(15,23,42,0.10)]"
                  >
                    <div className="shrink-0 border-b border-[var(--px-border-subtle)] px-5 py-5 text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--px-accent-soft)] text-lg font-semibold text-[var(--px-text)] shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
                        {viewer.image ? (
                          <span
                            role="img"
                            aria-label={viewerDisplayName}
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url("${viewer.image}")` }}
                          />
                        ) : (
                          <span>{viewerInitials}</span>
                        )}
                      </div>
                      <div className="mt-4 flex items-center justify-center gap-1">
                        <p className="text-[16px] font-semibold text-[var(--px-text)]">
                          {viewerDisplayName}
                        </p>
                        {showVerified ? (
                          <span className="material-symbols-outlined text-[18px] text-[var(--px-accent)]">
                            verified
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-5 text-[var(--px-muted)]">
                        {viewerHeadline}
                      </p>
                      {viewer?.email ? (
                        <p className="mt-1 text-xs text-[var(--px-muted)]">{viewer.email}</p>
                      ) : null}
                      <Link
                        ref={firstMenuActionRef}
                        href={profileHref as never}
                        role="menuitem"
                        onClick={() => setOpen(false)}
                        className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-[var(--px-accent)] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--px-accent)] transition-colors hover:bg-[var(--px-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--px-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                      >
                        Vis profil
                      </Link>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto py-3">
                      {sections.map((section) => (
                        <section key={section.label} className="px-2 py-1">
                          <div className="data-label px-3 text-[10px] font-semibold uppercase text-[var(--px-muted)] opacity-70">
                            {section.label}
                          </div>
                          <div className="mt-2 space-y-0.5">
                            {section.items.map((item) =>
                              item.href ? (
                                <MenuEntry
                                  key={`${section.label}-${item.label}`}
                                  href={item.href}
                                  label={item.label}
                                  onNavigate={() => setOpen(false)}
                                />
                              ) : (
                                <DisabledMenuEntry
                                  key={`${section.label}-${item.label}`}
                                  label={item.label}
                                />
                              ),
                            )}
                          </div>
                        </section>
                      ))}

                      <div className="mt-2 border-t border-[var(--px-border-subtle)] px-2 pt-3">
                        <form action={logoutAction}>
                          <button
                            type="submit"
                            role="menuitem"
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                          >
                            <span className="material-symbols-outlined text-[18px]">logout</span>
                            <span>Logg ut</span>
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--px-action-hover)]"
              >
                Logg inn
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
