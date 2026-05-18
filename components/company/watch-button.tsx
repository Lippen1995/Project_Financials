"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Star } from "lucide-react";

import {
  unwatchCompanyAction,
  watchCompanyAction,
} from "@/server/actions/workspace-collaboration-actions";
import { cn } from "@/lib/utils";

function StarIcon({ filled, pending }: { filled: boolean; pending: boolean }) {
  const { pending: formPending } = useFormStatus();
  const isDisabled = pending || formPending;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      title={filled ? "Fjern fra watchlist" : "Legg til i watchlist"}
      className={cn(
        "rounded-full p-2 transition-colors",
        isDisabled && "opacity-50",
        filled
          ? "text-amber-500 hover:text-amber-400"
          : "text-slate-400 hover:text-amber-500",
      )}
    >
      <Star
        className={cn("h-5 w-5", filled && "fill-current")}
        aria-hidden="true"
      />
      <span className="sr-only">{filled ? "Fjern fra watchlist" : "Legg til i watchlist"}</span>
    </button>
  );
}

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
  const [, watchAction, watchPending] = useActionState(watchCompanyAction, null);
  const [, unwatchAction, unwatchPending] = useActionState(unwatchCompanyAction, null);
  const pending = watchPending || unwatchPending;

  if (isWatched && watchId) {
    return (
      <form action={unwatchAction}>
        <input type="hidden" name="watchId" value={watchId} />
        <input type="hidden" name="slug" value={slug} />
        <StarIcon filled pending={pending} />
      </form>
    );
  }

  return (
    <form action={watchAction}>
      <input type="hidden" name="orgNumber" value={orgNumber} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="slug" value={slug} />
      <StarIcon filled={false} pending={pending} />
    </form>
  );
}
