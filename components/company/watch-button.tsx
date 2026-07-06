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
}: {
  isWatched: boolean;
  watchId: string | null;
  workspaceId: string;
  orgNumber: string;
  slug: string;
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
