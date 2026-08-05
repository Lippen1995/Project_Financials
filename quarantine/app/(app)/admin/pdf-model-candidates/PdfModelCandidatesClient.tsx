"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PdfModelCandidateRecord } from "@/server/persistence/pdf-model-candidate-repository";

type Filters = {
  status: string;
  modelTarget: string;
  modelId: string;
  limit: string;
};

function toSearchParams(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim());
  }
  return params;
}

function statusClass(status: string) {
  if (status === "APPROVED_FOR_SHADOW") return "border-green-200 bg-green-50 text-green-700";
  if (status === "READY_FOR_REVIEW") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-yellow-200 bg-yellow-50 text-yellow-700";
}

function fmtDate(value: Date | string) {
  return new Date(value).toLocaleString();
}

export default function PdfModelCandidatesClient({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [candidates, setCandidates] = useState<PdfModelCandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/pdf-model-candidates?${toSearchParams(appliedFilters).toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load model candidates.");
      const payload = (await response.json()) as { data: PdfModelCandidateRecord[] };
      setCandidates(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    setAppliedFilters(filters);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#162233]">
          PDF Model Candidates
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Admin-only lifecycle for shadow model candidates. Approving a candidate for shadow
          does not activate production routing, review, or publishing.
        </p>
      </div>

      <form className="flex flex-wrap items-center gap-3" onSubmit={handleApply}>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="rounded border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="READY_FOR_REVIEW">Ready for review</option>
          <option value="APPROVED_FOR_SHADOW">Approved for shadow</option>
          <option value="REJECTED">Rejected</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <input
          type="text"
          placeholder="Model target"
          value={filters.modelTarget}
          onChange={(e) => setFilters((f) => ({ ...f, modelTarget: e.target.value }))}
          className="w-44 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          type="text"
          placeholder="Model ID"
          value={filters.modelId}
          onChange={(e) => setFilters((f) => ({ ...f, modelId: e.target.value }))}
          className="w-44 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          type="number"
          placeholder="Limit"
          value={filters.limit}
          onChange={(e) => setFilters((f) => ({ ...f, limit: e.target.value }))}
          className="w-24 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-[#162233] px-4 py-1 text-sm text-white hover:bg-[#1e2f45]"
        >
          Apply
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading...</p>}

      {!loading && (
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-2 pr-3 text-left text-slate-500">Model</th>
                  <th className="pb-2 pr-3 text-left text-slate-500">Target</th>
                  <th className="pb-2 pr-3 text-left text-slate-500">Status</th>
                  <th className="pb-2 pr-3 text-left text-slate-500">Schema</th>
                  <th className="pb-2 pr-3 text-left text-slate-500">Created</th>
                  <th className="pb-2 pr-3 text-left text-slate-500">Updated</th>
                  <th className="pb-2 text-left text-slate-500">Detail</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-slate-700">
                      {candidate.modelId}@{candidate.modelVersion}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{candidate.modelTarget}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`rounded border px-2 py-0.5 text-xs font-semibold ${statusClass(candidate.status)}`}
                      >
                        {candidate.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">
                      {candidate.featureSchemaVersion ?? "-"}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{fmtDate(candidate.createdAt)}</td>
                    <td className="py-2 pr-3 text-slate-500">{fmtDate(candidate.updatedAt)}</td>
                    <td className="py-2">
                      <Link
                        href={`/admin/pdf-model-candidates/${candidate.id}` as never}
                        className="text-[#162233] underline underline-offset-2"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {candidates.length === 0 && (
            <p className="mt-4 text-sm text-slate-400">No model candidates found.</p>
          )}
        </div>
      )}
    </div>
  );
}
