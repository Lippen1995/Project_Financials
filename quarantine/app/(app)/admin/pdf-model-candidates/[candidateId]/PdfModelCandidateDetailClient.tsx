"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { PdfModelCandidateRecord } from "@/server/persistence/pdf-model-candidate-repository";

function statusClass(status: string) {
  if (status === "APPROVED_FOR_SHADOW") return "border-green-200 bg-green-50 text-green-700";
  if (status === "READY_FOR_REVIEW") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-yellow-200 bg-yellow-50 text-yellow-700";
}

function fmtDate(value?: Date | string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function summaryRows(summary: unknown): Array<[string, string]> {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  return Object.entries(summary as Record<string, unknown>).map(([key, value]) => [
    key,
    value == null || typeof value === "object" ? JSON.stringify(value) : String(value),
  ]);
}

function ArtifactSummary({
  label,
  artifact,
}: {
  label: string;
  artifact: PdfModelCandidateRecord["manifestArtifact"];
}) {
  if (!artifact) {
    return (
      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
        <p className="mt-2 text-sm text-slate-400">Not linked.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-100 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 font-mono text-xs text-slate-700">{artifact.id}</div>
      <div className="mt-1 text-xs text-slate-500">{artifact.kind}</div>
      <dl className="mt-3 grid grid-cols-1 gap-1 text-xs">
        {summaryRows(artifact.summary).slice(0, 8).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4">
            <dt className="text-slate-400">{key}</dt>
            <dd className="max-w-[260px] truncate text-right text-slate-600">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function actionForStatus(status: string): Array<{ label: string; action: string }> {
  if (status === "DRAFT") {
    return [
      { label: "Submit for review", action: "submit" },
      { label: "Archive", action: "archive" },
    ];
  }
  if (status === "READY_FOR_REVIEW") {
    return [
      { label: "Approve for shadow", action: "approve-shadow" },
      { label: "Reject", action: "reject" },
      { label: "Archive", action: "archive" },
    ];
  }
  if (status === "REJECTED" || status === "APPROVED_FOR_SHADOW") {
    return [{ label: "Archive", action: "archive" }];
  }
  return [];
}

export default function PdfModelCandidateDetailClient({
  candidateId,
}: {
  candidateId: string;
}) {
  const [candidate, setCandidate] = useState<PdfModelCandidateRecord | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pdf-model-candidates/${candidateId}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load candidate.");
      const payload = (await response.json()) as { data: PdfModelCandidateRecord };
      setCandidate(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const actions = useMemo(() => actionForStatus(candidate?.status ?? ""), [candidate?.status]);

  async function runAction(action: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/pdf-model-candidates/${candidateId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not update candidate.");
      }
      setNote("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading...</p>;
  if (!candidate) {
    return (
      <div className="space-y-3">
        <Link href={"/admin/pdf-model-candidates" as never} className="text-sm text-slate-500">
          Back to candidates
        </Link>
        <p className="text-sm text-red-600">{error ?? "Candidate not found."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={"/admin/pdf-model-candidates" as never} className="text-sm text-slate-500">
          Back to candidates
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#162233]">
          {candidate.modelId}@{candidate.modelVersion}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Candidate approval is for shadow use only. It does not activate production routing,
          review, publishing, reprocessing, or model loading.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        APPROVED_FOR_SHADOW records review intent only. There is no production activation path on
        this page.
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</div>
          <span
            className={`mt-2 inline-block rounded border px-2 py-0.5 text-xs font-semibold ${statusClass(candidate.status)}`}
          >
            {candidate.status}
          </span>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Target</div>
          <div className="mt-2 text-sm text-slate-700">{candidate.modelTarget}</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Algorithm</div>
          <div className="mt-2 text-sm text-slate-700">{candidate.algorithm ?? "-"}</div>
        </div>
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Schema</div>
          <div className="mt-2 text-sm text-slate-700">
            {candidate.featureSchemaVersion ?? "-"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ArtifactSummary label="Manifest artifact" artifact={candidate.manifestArtifact} />
        <ArtifactSummary label="Gate artifact" artifact={candidate.gateArtifact} />
        <ArtifactSummary label="Analysis artifact" artifact={candidate.analysisArtifact} />
      </div>

      {actions.length > 0 && (
        <div className="rounded-lg border border-slate-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Review Action</h2>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="mt-3 min-h-20 w-full rounded border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.action}
                type="button"
                disabled={saving}
                onClick={() => void runAction(action.action)}
                className="rounded bg-[#162233] px-3 py-1.5 text-sm text-white hover:bg-[#1e2f45] disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Audit Log</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-2 pr-3 text-left text-slate-500">Decision</th>
                <th className="pb-2 pr-3 text-left text-slate-500">Note</th>
                <th className="pb-2 text-left text-slate-500">Created</th>
              </tr>
            </thead>
            <tbody>
              {candidate.decisions.map((decision) => (
                <tr key={decision.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-mono text-slate-700">{decision.decisionType}</td>
                  <td className="py-2 pr-3 text-slate-600">{decision.note ?? "-"}</td>
                  <td className="py-2 text-slate-500">{fmtDate(decision.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidate.decisions.length === 0 && (
            <p className="mt-3 text-sm text-slate-400">No candidate decisions recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
