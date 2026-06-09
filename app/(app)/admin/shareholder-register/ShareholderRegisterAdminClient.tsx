"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Database, RefreshCw, Upload } from "lucide-react";

import type { ShareholderRegisterYearSummary } from "@/server/shareholdings/shareholder-register-repository";

type Props = {
  initialImports: ShareholderRegisterYearSummary[];
};

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; importId: string; uploadPercent: number; uploadedBytes: number; totalBytes: number }
  | { status: "queued"; importId: string }
  | { status: "failed"; message: string };

const ACTIVE_STATUSES = new Set(["UPLOADED", "VALIDATING", "IMPORTING"]);

function formatNumber(value: number) {
  return value.toLocaleString("nb-NO");
}

function formatBytes(value: string | number | null) {
  if (value === null) return "-";
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toLocaleString("nb-NO", {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  })} ${units[unitIndex]}`;
}

function formatDate(value: Date | string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("nb-NO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(status: string) {
  switch (status) {
    case "UPLOADED":
      return "Kø / opplasting";
    case "VALIDATING":
      return "Validerer";
    case "IMPORTING":
      return "Importerer";
    case "COMPLETED":
      return "Ferdig";
    case "PARTIAL":
      return "Ferdig med avvik";
    case "FAILED":
      return "Feilet";
    default:
      return status;
  }
}

function statusClasses(status: string) {
  switch (status) {
    case "COMPLETED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PARTIAL":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "FAILED":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "IMPORTING":
    case "VALIDATING":
    case "UPLOADED":
      return "border-[var(--px-border)] bg-[var(--px-subtle)] text-[var(--px-text)]";
    default:
      return "border-[var(--px-border)] bg-[var(--px-surface)] text-[var(--px-muted)]";
  }
}

function progressPercent(row: ShareholderRegisterYearSummary) {
  const total = row.totalBytes ? Number(row.totalBytes) : 0;
  const processed = Number(row.processedBytes);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(processed)) return 0;
  return Math.min(100, Math.max(0, Math.round((processed / total) * 100)));
}

function inferYearFromName(name: string) {
  const match = name.match(/(?:^|_)(20\d{2}|19\d{2})(?:\.|_|$)/);
  return match ? match[1] : "";
}

export default function ShareholderRegisterAdminClient({ initialImports }: Props) {
  const [imports, setImports] = useState(initialImports);
  const [file, setFile] = useState<File | null>(null);
  const [taxYear, setTaxYear] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeImports = useMemo(
    () => imports.filter((item) => ACTIVE_STATUSES.has(item.status)),
    [imports],
  );
  const newestImport = imports[0] ?? null;

  const refreshImports = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/shareholder-register/imports", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { imports: ShareholderRegisterYearSummary[] };
      setImports(data.imports);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (activeImports.length === 0 && uploadState.status !== "uploading" && uploadState.status !== "queued") {
      return;
    }

    const timer = setInterval(() => {
      void refreshImports();
    }, 2000);

    return () => clearInterval(timer);
  }, [activeImports.length, refreshImports, uploadState.status]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && !taxYear) {
      setTaxYear(inferYearFromName(selected.name));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setUploadState({ status: "failed", message: "Velg en CSV-fil først." });
      return;
    }
    const parsedYear = Number.parseInt(taxYear, 10);
    if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      setUploadState({ status: "failed", message: "Oppgi et gyldig inntektsår." });
      return;
    }

    const importId = crypto.randomUUID();
    const request = new XMLHttpRequest();
    request.open("POST", "/api/admin/shareholder-register/imports");
    request.setRequestHeader("x-import-id", importId);
    request.setRequestHeader("x-tax-year", String(parsedYear));
    request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    request.setRequestHeader("content-type", "text/csv");

    setUploadState({
      status: "uploading",
      importId,
      uploadPercent: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
    });

    request.upload.onprogress = (progressEvent) => {
      const total = progressEvent.total || file.size;
      const loaded = progressEvent.loaded;
      setUploadState({
        status: "uploading",
        importId,
        uploadPercent: total > 0 ? Math.round((loaded / total) * 100) : 0,
        uploadedBytes: loaded,
        totalBytes: total,
      });
    };

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        setUploadState({ status: "queued", importId });
        void refreshImports();
        return;
      }
      setUploadState({
        status: "failed",
        message: `Opplasting feilet med HTTP ${request.status}.`,
      });
      void refreshImports();
    };

    request.onerror = () => {
      setUploadState({ status: "failed", message: "Nettverksfeil under opplasting." });
      void refreshImports();
    };

    request.send(file);
  }

  const uploadProgress =
    uploadState.status === "uploading" ? uploadState.uploadPercent : uploadState.status === "queued" ? 100 : 0;

  return (
    <div className="space-y-8 pb-14">
      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-accent)]">
              Admin
            </p>
            <h1 className="editorial-display mt-3 text-[2.4rem] leading-tight text-[var(--px-text)]">
              Aksjonærregister
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--px-muted)]">
              Last opp årlige CSV-uttrekk fra Skatteetaten og følg importen inn i den strukturerte
              eierskapstabellen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshImports()}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-2 text-sm font-medium text-[var(--px-text)] transition-colors hover:bg-[var(--px-subtle)]"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Oppdater
          </button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
            År importert
          </p>
          <p className="editorial-display mt-3 text-[2.2rem] leading-none text-[var(--px-text)]">
            {formatNumber(imports.length)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
            Rader i registeret
          </p>
          <p className="editorial-display mt-3 text-[2.2rem] leading-none text-[var(--px-text)]">
            {formatNumber(imports.reduce((sum, item) => sum + item.importedRowCount, 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
          <p className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
            Siste import
          </p>
          <p className="mt-3 text-lg font-semibold text-[var(--px-text)]">
            {newestImport ? newestImport.taxYear : "-"}
          </p>
          <p className="mt-1 text-sm text-[var(--px-muted)]">
            {newestImport ? formatDate(newestImport.completedAt ?? newestImport.startedAt) : "Ingen import"}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--px-subtle)] text-[var(--px-text)]">
            <Upload className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-[var(--px-text)]">Last opp nytt årsuttrekk</h2>
            <p className="text-sm text-[var(--px-muted)]">
              Eksisterende import for samme år erstattes når bakgrunnsjobben starter.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1fr_160px_auto] lg:items-end">
          <label className="block">
            <span className="data-label mb-2 block text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
              CSV-fil
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] file:mr-4 file:rounded-full file:border-0 file:bg-[var(--px-action)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
          </label>
          <label className="block">
            <span className="data-label mb-2 block text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
              Inntektsår
            </span>
            <input
              value={taxYear}
              onChange={(event) => setTaxYear(event.target.value)}
              inputMode="numeric"
              placeholder="2025"
              className="block w-full rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-4 py-3 text-sm text-[var(--px-text)] outline-none focus:border-[var(--px-accent)]"
            />
          </label>
          <button
            type="submit"
            disabled={uploadState.status === "uploading"}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--px-action)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--px-action-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            Start import
          </button>
        </form>

        {uploadState.status !== "idle" ? (
          <div className="mt-5 rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-4">
            {uploadState.status === "failed" ? (
              <p className="text-sm font-medium text-rose-700">{uploadState.message}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--px-text)]">
                  <span className="font-medium">
                    {uploadState.status === "uploading" ? "Laster opp CSV" : "CSV mottatt, importjobb startet"}
                  </span>
                  <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
                    {uploadState.status === "uploading"
                      ? `${formatBytes(uploadState.uploadedBytes)} / ${formatBytes(uploadState.totalBytes)}`
                      : "100 %"}
                  </span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--px-surface)]">
                  <div
                    className="h-full rounded-full bg-[var(--px-action)] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      {activeImports.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-[var(--px-accent)]" />
            <h2 className="text-lg font-semibold text-[var(--px-text)]">Aktiv import</h2>
          </div>
          <div className="grid gap-3">
            {activeImports.map((item) => {
              const percent = progressPercent(item);
              return (
                <div
                  key={`${item.taxYear}-${item.sourceFileName}`}
                  className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--px-text)]">
                        {item.taxYear} · {item.sourceFileName}
                      </p>
                      <p className="mt-1 text-sm text-[var(--px-muted)]">
                        {statusLabel(item.status)} · {formatNumber(item.importedRowCount)} rader importert
                      </p>
                    </div>
                    <span className="data-label text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
                      {percent} %
                    </span>
                  </div>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--px-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--px-action)] transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--px-text)]">Importhistorikk</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="data-label border-b border-[var(--px-border)] text-[11px] uppercase tracking-widest text-[var(--px-muted)]">
              <tr>
                <th className="py-3 pr-4">År</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Rader</th>
                <th className="py-3 pr-4">Avvik</th>
                <th className="py-3 pr-4">Fil</th>
                <th className="py-3 pr-4">Ferdig</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--px-border)]">
              {imports.map((item) => (
                <tr key={`${item.taxYear}-${item.sourceFileName}`} className="align-top">
                  <td className="py-3 pr-4 font-semibold text-[var(--px-text)]">{item.taxYear}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                    {item.failureMessage ? (
                      <p className="mt-2 max-w-sm text-xs text-rose-700">{item.failureMessage}</p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-4 text-[var(--px-text)]">
                    {formatNumber(item.importedRowCount)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--px-muted)]">
                    {formatNumber(item.skippedRowCount)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--px-muted)]">
                    <span className="block max-w-xs truncate">{item.sourceFileName}</span>
                    <span className="data-label mt-1 block text-[10px] uppercase tracking-widest text-[var(--px-muted)]">
                      {formatBytes(item.totalBytes)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-[var(--px-muted)]">
                    {formatDate(item.completedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
