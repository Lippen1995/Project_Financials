"use client";

import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

type AnnualReportRefreshButtonProps = {
  scope: "filing" | "affected";
  filingId?: string;
  label: string;
  pendingLabel?: string;
  className?: string;
  helperText?: string;
};

type FilingRefreshResponse = {
  filingId: string;
  skipped?: boolean;
  reason?: string;
};

type AffectedRefreshResponse = {
  affectedFilings: Array<{ filingId: string }>;
  refreshResult: {
    results: Array<{ filingId: string; skipped?: boolean }>;
  };
};

function buildEndpoint(scope: AnnualReportRefreshButtonProps["scope"], filingId?: string) {
  if (scope === "affected") {
    return "/api/admin/annual-report-filings/refresh-affected";
  }

  if (!filingId) {
    throw new Error("filingId is required when scope is 'filing'.");
  }

  return `/api/admin/annual-report-filings/${filingId}/refresh`;
}

export function AnnualReportRefreshButton({
  scope,
  filingId,
  label,
  pendingLabel = "Starter...",
  className,
  helperText,
}: AnnualReportRefreshButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(buildEndpoint(scope, filingId), {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Kunne ikke starte ny behandling.");
      }

      if (scope === "affected") {
        const data = json.data as AffectedRefreshResponse;
        const total = data.affectedFilings.length;
        const started = data.refreshResult.results.filter((item) => !item.skipped).length;
        const skipped = data.refreshResult.results.filter((item) => item.skipped).length;
        setMessage(
          total === 0
            ? "Ingen berørte saker å oppfriske akkurat nå."
            : `Ny behandling sendt for ${started} sak${started === 1 ? "" : "er"}${skipped > 0 ? `, ${skipped} hoppet over fordi de allerede kjører` : ""}.`,
        );
      } else {
        const data = json.data as FilingRefreshResponse;
        setMessage(
          data.skipped
            ? data.reason ?? "Saken kjører allerede og ble ikke startet på nytt."
            : "Ny behandling er startet for denne saken.",
        );
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukjent feil.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={className}
      >
        {pending ? pendingLabel : label}
      </button>
      {helperText ? <p className="text-xs leading-5 text-slate-500">{helperText}</p> : null}
      {message ? <p className="text-xs leading-5 text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs leading-5 text-red-600">{error}</p> : null}
    </div>
  );
}
