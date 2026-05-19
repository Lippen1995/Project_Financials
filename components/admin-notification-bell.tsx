"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  dismissAdminNotificationAction,
  markAdminNotificationReadAction,
  markAllAdminNotificationsReadAction,
} from "@/server/actions/admin-notification-actions";
import type { AdminNotificationSummary } from "@/server/services/admin-notification-service";

export type AdminNotificationBellProps = {
  notifications: AdminNotificationSummary[];
  unreadCount: number;
};

function formatRelativeNorwegian(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "akkurat nå";
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} dager siden`;
  return date.toLocaleDateString("nb-NO");
}

export function AdminNotificationBell({ notifications, unreadCount }: AdminNotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const handleClickNotification = (notificationId: string) => {
    startTransition(() => {
      markAdminNotificationReadAction(notificationId);
    });
  };

  const handleDismiss = (event: React.MouseEvent, notificationId: string) => {
    event.preventDefault();
    event.stopPropagation();
    startTransition(() => {
      dismissAdminNotificationAction(notificationId);
    });
  };

  const handleMarkAllRead = () => {
    startTransition(() => {
      markAllAdminNotificationsReadAction();
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Varsler (${unreadCount} uleste)`}
        className="relative flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--px-action)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-[var(--px-border-subtle)] bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-[var(--px-border-subtle)] px-4 py-3">
              <h3 className="text-sm font-semibold text-[var(--px-text)]">Admin-varsler</h3>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-[var(--px-muted)] hover:text-[var(--px-text)]"
                >
                  Marker alle som lest
                </button>
              ) : null}
            </div>

            <ul className="max-h-96 divide-y divide-[var(--px-border-subtle)] overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-[var(--px-muted)]">
                  Ingen varsler.
                </li>
              ) : (
                notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={
                      notification.status === "UNREAD"
                        ? "bg-[rgba(0,80,160,0.04)]"
                        : ""
                    }
                  >
                    <Link
                      href={notification.linkPath as never}
                      onClick={() => handleClickNotification(notification.id)}
                      className="block px-4 py-3 transition-colors hover:bg-[var(--px-subtle)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {notification.status === "UNREAD" ? (
                              <span
                                aria-hidden="true"
                                className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--px-action)]"
                              />
                            ) : null}
                            <p className="truncate text-sm font-semibold text-[var(--px-text)]">
                              {notification.title}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-[var(--px-muted)]">
                            {notification.body}
                          </p>
                          <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--px-muted)]">
                            {formatRelativeNorwegian(notification.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => handleDismiss(event, notification.id)}
                          aria-label="Skjul varsel"
                          className="flex-shrink-0 text-[var(--px-muted)] hover:text-[var(--px-text)]"
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                        </button>
                      </div>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
