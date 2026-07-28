import React from "react";
import type { NjordClaimEvidenceResult } from "@/server/ai-search/evidence/claim-evidence";

const kindLabels = {
  DOCUMENTED_FACT: "Dokumentert fakta",
  CALCULATION: "Beregning",
  EXPLANATION: "Forklaring",
} as const;

export function stripNjordCitationMarkers(answer: string) {
  return answer.replace(
    /\s*[\[(](?:knowledge:[A-Za-z0-9:_-]+|source:\d+|calculation:\d+)[\])]/g,
    "",
  );
}

function SourceDetails({
  source,
}: {
  source: NjordClaimEvidenceResult["sources"][number];
}) {
  return (
    <div className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-xs font-semibold text-[var(--px-text)]">
          {source.label ?? source.sourceSystem}
        </span>
        {source.sourceUrl ? (
          <a
            href={source.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--px-border)] px-3 py-1 text-xs font-semibold text-[var(--px-text)] hover:bg-[var(--px-subtle)]"
          >
            Åpne kilde
          </a>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-4 text-xs text-[var(--px-muted)]">
        <div>
          <dt className="data-label text-[9px] uppercase">Kildesystem</dt>
          <dd className="mt-1 break-all text-[var(--px-text)]">{source.sourceSystem}</dd>
        </div>
        <div>
          <dt className="data-label text-[9px] uppercase">Kildetype</dt>
          <dd className="mt-1 break-all text-[var(--px-text)]">{source.sourceEntityType}</dd>
        </div>
        <div>
          <dt className="data-label text-[9px] uppercase">Kilde-ID</dt>
          <dd className="mt-1 break-all text-[var(--px-text)]">{source.sourceId}</dd>
        </div>
        <div>
          <dt className="data-label text-[9px] uppercase">Hentet</dt>
          <dd className="mt-1 text-[var(--px-text)]">
            <time dateTime={source.fetchedAt}>{source.fetchedAt}</time>
          </dd>
        </div>
        <div>
          <dt className="data-label text-[9px] uppercase">Normalisert</dt>
          <dd className="mt-1 text-[var(--px-text)]">
            <time dateTime={source.normalizedAt}>{source.normalizedAt}</time>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function NjordClaimEvidence({
  evidence,
}: {
  evidence: NjordClaimEvidenceResult;
}) {
  if (evidence.claims.length === 0) return null;

  return (
    <section
      className="mt-3 w-full rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5"
      aria-label="Påstandsgrunnlag"
    >
      <h3 className="data-label text-[10px] uppercase text-[var(--px-muted)]">
        Påstandsgrunnlag
      </h3>
      <div className="mt-4 grid gap-4">
        {evidence.claims.map((claim, claimIndex) => (
          <details
            key={`${claim.citationIds.join("-")}-${claimIndex}`}
            className="rounded-xl border border-[var(--px-border)] bg-[var(--px-subtle)] p-5"
          >
            <summary className="cursor-pointer text-sm text-[var(--px-text)]">
              <span className="data-label mr-2 text-[9px] uppercase text-[var(--px-muted)]">
                {kindLabels[claim.kind]}
              </span>
              {claim.text}
            </summary>
            <div className="mt-4 grid gap-4">
              {claim.sources.map((source) => (
                <SourceDetails key={source.citationId} source={source} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
