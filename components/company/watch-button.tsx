"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";

import {
  unwatchCompanyAction,
  watchCompanyAction,
} from "@/server/actions/workspace-collaboration-actions";
import { cn } from "@/lib/utils";

export function WatchButton({
  isWatched,
  watchId,
  workspaceId,
  orgNumber,
  slug,
  variant = "icon",
}: {
  isWatched: boolean;
  watchId: string | null;
  workspaceId: string;
  orgNumber: string;
  slug: string;
  /** "icon" = compact star toggle; "pill" = filled "Overvåk" action pill (5C header). */
  variant?: "icon" | "pill";
}) {
  const [isPending, startTransition] = useTransition();
  const [optimisticWatched, setOptimisticWatched] = useOptimistic(isWatched);

  function handleToggle() {
    startTransition(async () => {
      setOptimisticWatched(!optimisticWatched);
      const formData = new FormData();
      formData.set("slug", slug);
      // Decide from the confirmed server state — the unwatch action needs the real watchId.
      if (isWatched && watchId) {
        formData.set("watchId", watchId);
        await unwatchCompanyAction(null, formData);
      } else {
        formData.set("orgNumber", orgNumber);
        formData.set("workspaceId", workspaceId);
        await watchCompanyAction(null, formData);
      }
    });
  }

  const filled = optimisticWatched;
  const label = filled ? "Fjern fra watchlist" : "Legg til i watchlist";

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={filled}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors",
          isPending && "opacity-50",
          filled
            ? "border border-[var(--px-border)] bg-white text-[var(--px-text)] hover:border-[var(--px-accent)]"
            : "border border-transparent bg-[var(--px-action)] text-white hover:bg-[var(--px-action-hover)]",
        )}
      >
        <Star className={cn("h-[18px] w-[18px]", filled && "fill-current text-[var(--px-watch)]")} aria-hidden="true" />
        {filled ? "Overvåkes" : "Overvåk"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      title={label}
      aria-pressed={filled}
      className={cn(
        "rounded-full p-2 transition-colors",
        isPending && "opacity-50",
        filled
          ? "text-amber-500 hover:text-amber-400"
          : "text-slate-400 hover:text-amber-500",
      )}
    >
      <Star className={cn("h-5 w-5", filled && "fill-current")} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </button>
  );
}
