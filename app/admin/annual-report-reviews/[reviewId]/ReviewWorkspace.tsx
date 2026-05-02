"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Fact = {
  id: string;
  metricKey: string;
  fiscalYear: number;
  value: bigint | null;
  unitScale: number;
  sourcePage: number | null;
  confidenceScore: number | null;
  rawLabel: string | null;
  statementType: string;
};

type ValidationIssue = {
  id: string;
  severity: string;
  ruleCode: string;
  message: string;
};

type Artifact = {
  id: string;
  artifactType: string;
  storageKey: string;
  mimeType: string;
  metadata: unknown;
};

type Decision = {
  id: string;
  decisionType: string;
  correctionNotes: string | null;
  createdAt: Date;
  reviewer: { id: string; name: string | null; email: string | null };
};

type ReviewDetail = {
  id: string;
  status: string;
  fiscalYear: number;
  qualityScore: number | null;
  sourcePrecedenceAttempted: string | null;
  blockingRuleCodes: string[];
  blockingIssueCount: number;
  latestActionNote: string | null;
  reviewPayload: unknown;
  company: { orgNumber: string; name: string; slug: string };
  filing: {
    id: string;
    status: string;
    sourceUrl: string | null;
    lastError: string | null;
    artifacts: Artifact[];
    validationIssues: ValidationIssue[];
  };
  extractionRun: {
    id: string;
    status: string;
    confidenceScore: number | null;
    validationScore: number | null;
    documentEngine: string | null;
    documentEngineMode: string | null;
    parserVersion: string;
    rawSummary: unknown;
    facts: Fact[];
    validationIssues: ValidationIssue[];
  } | null;
  decisions: Decision[];
};

type EditableFact = {
  metricKey: string;
  fiscalYear: number;
  value: string;
  rawLabel: string;
  sourcePage: string;
  unitScale: string;
};

function bigintToDisplay(v: bigint | null): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function groupFacts(facts: Fact[]) {
  const income: Fact[] = [];
  const balance: Fact[] = [];
  const other: Fact[] = [];
  for (const f of facts) {
    if (f.statementType === "INCOME_STATEMENT") income.push(f);
    else if (f.statementType === "BALANCE_SHEET") balance.push(f);
    else other.push(f);
  }
  return { income, balance, other };
}

function getPdfArtifactUrl(artifacts: Artifact[], filing: ReviewDetail["filing"]): string | null {
  if (!artifacts || artifacts.length === 0) {
    return filing.sourceUrl ?? null;
  }
  const pdf = artifacts.find((a) => a.artifactType === "PDF");
  if (pdf) {
    return filing.sourceUrl ?? null;
  }
  return filing.sourceUrl ?? null;
}

export function ReviewWorkspace({ review }: { review: ReviewDetail }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "correct">("view");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const facts = review.extractionRun?.facts ?? [];
  const { income, balance } = groupFacts(facts);
  const issues = [
    ...(review.extractionRun?.validationIssues ?? []),
    ...review.filing.validationIssues,
  ];
  const pdfUrl = getPdfArtifactUrl(review.filing.artifacts, review.filing);

  const payload =
    review.reviewPayload && typeof review.reviewPayload === "object"
      ? (review.reviewPayload as Record<string, unknown>)
      : null;

  // Correction form state
  const [editableFacts, setEditableFacts] = useState<EditableFact[]>(
    facts.map((f) => ({
      metricKey: f.metricKey,
      fiscalYear: f.fiscalYear,
      value: bigintToDisplay(f.value),
      rawLabel: f.rawLabel ?? "",
      sourcePage: String(f.sourcePage ?? ""),
      unitScale: String(f.unitScale),
    })),
  );
  const [boardReportText, setBoardReportText] = useState(
    (payload?.boardReportText as string | undefined) ?? "",
  );
  const [auditorReportText, setAuditorReportText] = useState(
    (payload?.auditorReportText as string | undefined) ?? "",
  );
  const [auditorOpinion, setAuditorOpinion] = useState<string>(
    (payload as Record<string, unknown> | null)?.auditorOpinion != null &&
    typeof (payload as Record<string, unknown>)?.auditorOpinion === "object"
      ? String(
          ((payload as Record<string, unknown>).auditorOpinion as Record<string, unknown>)
            ?.opinionType ?? "UNKNOWN",
        )
      : "UNKNOWN",
  );

  async function call(path: string, body: unknown) {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/annual-report-reviews/${review.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Feil fra server.");
      router.refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ukjent feil.");
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    call("accept", { notes: notes || undefined });
  }

  function handleReject() {
    if (!reason.trim()) {
      setActionError("Begrunnelse er påkrevd.");
      return;
    }
    call("reject", { reason });
  }

  function handleReprocess() {
    if (!reason.trim()) {
      setActionError("Begrunnelse er påkrevd.");
      return;
    }
    call("reprocess", { reason });
  }

  function handleUnreadable() {
    if (!reason.trim()) {
      setActionError("Begrunnelse er påkrevd.");
      return;
    }
    call("unreadable", { reason });
  }

  function handleCorrect() {
    const correctedFacts = editableFacts
      .map((f) => ({
        metricKey: f.metricKey,
        fiscalYear: f.fiscalYear,
        value: f.value.trim() !== "" ? f.value.trim() : null,
        rawLabel: f.rawLabel || null,
        sourcePage: f.sourcePage.trim() !== "" ? parseInt(f.sourcePage, 10) : null,
        unitScale: f.unitScale.trim() !== "" ? parseInt(f.unitScale, 10) : null,
      }))
      .filter((f) => !isNaN(f.fiscalYear));

    const sections: { sectionType: string; text: string }[] = [];
    if (boardReportText.trim()) {
      sections.push({ sectionType: "BOARD_REPORT", text: boardReportText.trim() });
    }
    if (auditorReportText.trim()) {
      sections.push({ sectionType: "AUDITOR_REPORT", text: auditorReportText.trim() });
    }

    const corrections: Record<string, unknown> = { facts: correctedFacts };
    if (sections.length > 0) {
      corrections.sections = sections;
    }
    if (auditorOpinion !== "UNKNOWN") {
      corrections.auditorOpinion = { opinionType: auditorOpinion };
    }

    call("correct", {
      corrections,
      notes: notes || undefined,
    });
  }

  const isResolved =
    review.status === "ACCEPTED" || review.status === "REJECTED" || review.status === "RESOLVED_BY_NEW_RUN";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      {/* ---- Left: PDF viewer ---- */}
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            PDF-dokument
          </h2>
          {pdfUrl ? (
            <div className="flex flex-col gap-2">
              <iframe
                src={pdfUrl}
                className="h-[600px] w-full rounded border border-[rgba(15,23,42,0.08)]"
                title="Årsrapport PDF"
              />
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#31495f] underline"
              >
                Åpne PDF i nytt vindu
              </a>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Ingen PDF-visning tilgjengelig.</p>
          )}

          {review.filing.artifacts.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Artefakter
              </h3>
              <ul className="space-y-1">
                {review.filing.artifacts.map((a) => (
                  <li key={a.id} className="font-mono text-xs text-slate-500">
                    {a.artifactType} — {a.storageKey}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Previous decisions */}
        {review.decisions.length > 0 && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Audit trail
            </h2>
            <ul className="space-y-3">
              {review.decisions.map((d) => (
                <li key={d.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <span className="font-medium text-[#162233]">{d.decisionType}</span>
                  <span className="ml-2 text-slate-400">
                    {new Date(d.createdAt).toLocaleString("nb-NO")}
                  </span>
                  <span className="ml-2 text-slate-500">av {d.reviewer.name ?? d.reviewer.email}</span>
                  {d.correctionNotes && (
                    <p className="mt-1 text-slate-500">{d.correctionNotes}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ---- Right: Review workspace ---- */}
      <div className="flex flex-col gap-4">
        {/* Summary */}
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Sammendrag
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Org.nr</dt>
            <dd className="font-mono font-medium text-[#162233]">{review.company.orgNumber}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd className="font-medium text-[#162233]">{review.status}</dd>
            <dt className="text-slate-500">Regnskapsår</dt>
            <dd className="font-medium text-[#162233]">{review.fiscalYear}</dd>
            <dt className="text-slate-500">Kvalitetsscore</dt>
            <dd className="font-medium text-[#162233]">
              {review.qualityScore != null ? `${(review.qualityScore * 100).toFixed(1)}%` : "—"}
            </dd>
            <dt className="text-slate-500">Parser</dt>
            <dd className="font-mono text-xs text-slate-600">
              {review.extractionRun?.documentEngine ?? review.sourcePrecedenceAttempted ?? "—"}
            </dd>
            <dt className="text-slate-500">Blokkeringer</dt>
            <dd className="font-medium text-amber-700">
              {review.blockingRuleCodes.length > 0
                ? review.blockingRuleCodes.join(", ")
                : "Ingen"}
            </dd>
          </dl>
          {review.latestActionNote && (
            <p className="mt-3 text-sm text-slate-500">
              <span className="font-medium">Siste notat:</span> {review.latestActionNote}
            </p>
          )}
        </div>

        {/* Validation issues */}
        {issues.length > 0 && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Valideringsfeil ({issues.length})
            </h2>
            <ul className="space-y-2">
              {issues.slice(0, 20).map((issue) => (
                <li key={issue.id} className="text-sm">
                  <span
                    className={`mr-2 font-mono text-xs font-semibold ${
                      issue.severity === "ERROR"
                        ? "text-red-600"
                        : issue.severity === "WARNING"
                          ? "text-amber-600"
                          : "text-slate-500"
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <span className="font-mono text-xs text-slate-500">{issue.ruleCode}</span>
                  <span className="ml-2 text-slate-700">{issue.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Proposed facts */}
        {mode === "view" && (income.length > 0 || balance.length > 0) && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Foreslåtte tall
            </h2>
            {income.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Resultatregnskap
                </h3>
                <FactTable facts={income} />
              </div>
            )}
            {balance.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Balanse
                </h3>
                <FactTable facts={balance} />
              </div>
            )}
          </div>
        )}

        {/* Correction form */}
        {mode === "correct" && (
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
              Korriger verdier
            </h2>
            <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Korrigerte verdier lagres som audit trail og treningslabels. De publiseres ikke automatisk.
            </p>
            <div className="space-y-2">
              {editableFacts.map((f, i) => (
                <div key={f.metricKey + f.fiscalYear} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 text-xs">
                  <span className="font-mono text-slate-600 self-center">{f.metricKey}</span>
                  <input
                    value={f.value}
                    onChange={(e) => {
                      const next = [...editableFacts];
                      next[i] = { ...next[i], value: e.target.value };
                      setEditableFacts(next);
                    }}
                    placeholder="Verdi"
                    className="rounded border border-[rgba(15,23,42,0.12)] px-2 py-1 font-mono text-xs text-slate-700 focus:outline-none"
                  />
                  <input
                    value={f.sourcePage}
                    onChange={(e) => {
                      const next = [...editableFacts];
                      next[i] = { ...next[i], sourcePage: e.target.value };
                      setEditableFacts(next);
                    }}
                    placeholder="Side"
                    className="rounded border border-[rgba(15,23,42,0.12)] px-2 py-1 font-mono text-xs text-slate-700 focus:outline-none"
                  />
                  <input
                    value={f.unitScale}
                    onChange={(e) => {
                      const next = [...editableFacts];
                      next[i] = { ...next[i], unitScale: e.target.value };
                      setEditableFacts(next);
                    }}
                    placeholder="Skala"
                    className="rounded border border-[rgba(15,23,42,0.12)] px-2 py-1 font-mono text-xs text-slate-700 focus:outline-none"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Styrets beretning (tekst)
                </label>
                <textarea
                  value={boardReportText}
                  onChange={(e) => setBoardReportText(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-xs text-slate-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Revisorberetning (tekst)
                </label>
                <textarea
                  value={auditorReportText}
                  onChange={(e) => setAuditorReportText(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-xs text-slate-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Revisjonskonklusjon
                </label>
                <select
                  value={auditorOpinion}
                  onChange={(e) => setAuditorOpinion(e.target.value)}
                  className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="UNKNOWN">Ukjent</option>
                  <option value="CLEAN">Ren (Clean)</option>
                  <option value="QUALIFIED">Modifisert (Qualified)</option>
                  <option value="ADVERSE">Negativ (Adverse)</option>
                  <option value="DISCLAIMER">Fraskrivelse (Disclaimer)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Notes / reason field */}
        <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-4">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            {mode === "correct" ? "Korrigeringsnotat" : "Begrunnelse / notat"}
          </label>
          <textarea
            value={mode === "correct" ? notes : reason}
            onChange={(e) =>
              mode === "correct" ? setNotes(e.target.value) : setReason(e.target.value)
            }
            rows={3}
            placeholder={mode === "correct" ? "Valgfritt notat..." : "Påkrevd for avvis/reprocess/uleselig"}
            className="w-full rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
          />
        </div>

        {actionError && (
          <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-700">{actionError}</p>
        )}

        {/* Action buttons */}
        {!isResolved && (
          <div className="flex flex-wrap gap-2">
            {mode === "view" ? (
              <>
                <button
                  onClick={handleAccept}
                  disabled={loading}
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Godkjenn
                </button>
                <button
                  onClick={() => setMode("correct")}
                  disabled={loading}
                  className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Korriger
                </button>
                <button
                  onClick={handleReprocess}
                  disabled={loading}
                  className="rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  Send til reprocess
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="rounded border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Avvis
                </button>
                <button
                  onClick={handleUnreadable}
                  disabled={loading}
                  className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                >
                  Uleselig
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCorrect}
                  disabled={loading}
                  className="rounded bg-[#31495f] px-4 py-2 text-sm font-medium text-white hover:bg-[#223246] disabled:opacity-50"
                >
                  Lagre korrigeringer
                </button>
                <button
                  onClick={() => setMode("view")}
                  disabled={loading}
                  className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Avbryt
                </button>
              </>
            )}
          </div>
        )}

        {isResolved && (
          <div className="rounded bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Denne saken er avsluttet med status <strong>{review.status}</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

function FactTable({ facts }: { facts: Fact[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-[rgba(15,23,42,0.06)]">
          <th className="pb-1 text-left font-medium text-slate-400">Nøkkel</th>
          <th className="pb-1 text-right font-medium text-slate-400">Verdi (NOK)</th>
          <th className="pb-1 text-right font-medium text-slate-400">Skala</th>
          <th className="pb-1 text-right font-medium text-slate-400">Side</th>
          <th className="pb-1 text-right font-medium text-slate-400">Conf</th>
        </tr>
      </thead>
      <tbody>
        {facts.map((f) => (
          <tr key={f.id} className="border-b border-[rgba(15,23,42,0.04)] last:border-0">
            <td className="py-1 font-mono text-slate-600">{f.metricKey}</td>
            <td className="py-1 text-right font-mono text-[#162233]">
              {f.value != null ? Number(f.value).toLocaleString("nb-NO") : "—"}
            </td>
            <td className="py-1 text-right font-mono text-slate-400">{f.unitScale}</td>
            <td className="py-1 text-right font-mono text-slate-400">{f.sourcePage ?? "—"}</td>
            <td className="py-1 text-right font-mono text-slate-400">
              {f.confidenceScore != null ? `${(f.confidenceScore * 100).toFixed(0)}%` : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
