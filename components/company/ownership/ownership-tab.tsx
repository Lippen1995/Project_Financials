"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, X } from "lucide-react";

import { relationshipLabel } from "@/server/ownership/ownership-thresholds";
import type { CompanyHolding, GroupNode, OwnershipOverview } from "@/server/ownership/types";

import { OwnershipChart } from "./ownership-chart";
import { OwnershipTree } from "./ownership-tree";

type GroupView = "structure" | "network";

const percentFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 });

function formatPercent(value: number | null) {
  if (value === null) return "Ikke oppgitt";
  return `${percentFormat.format(value)} %`;
}

function statusLabel(status: GroupNode["status"]) {
  if (status === "DISSOLVED") return "Oppløst";
  if (status === "BANKRUPT") return "Konkurs";
  if (status === "ACTIVE") return "Aktiv";
  return "Ukjent";
}

function statusClass(status: GroupNode["status"]) {
  if (status === "DISSOLVED" || status === "BANKRUPT") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "ACTIVE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  return "border-[var(--px-border)] bg-[var(--px-subtle)] text-[var(--px-muted)]";
}

function findParent(groupNodes: GroupNode[], node: GroupNode | null) {
  if (!node?.parentOrgNumber) return null;
  return groupNodes.find((candidate) => candidate.orgNumber === node.parentOrgNumber) ?? null;
}

function buildSummary(overview: OwnershipOverview) {
  const group = overview.group;
  if (!group || group.membershipStatus !== "RESOLVED") return null;

  const currentNode = group.nodes.find((node) => node.orgNumber === group.currentOrgNumber) ?? null;
  const parent = findParent(group.nodes, currentNode);
  const subsidiaries = group.nodes.filter((node) => node.relationshipToParent === "SUBSIDIARY").length;
  const associated = group.nodes.filter((node) => node.relationshipToParent === "ASSOCIATED").length;
  const dissolved = group.nodes.filter((node) => node.status === "DISSOLVED").length;

  return {
    currentNode,
    parent,
    subsidiaries,
    associated,
    dissolved,
    lead: group.ultimateParent
      ? `${overview.companyName} inngår i konsernet ${group.ultimateParent.name}.`
      : `${overview.companyName} er konsernspiss i den rekonstruerte strukturen.`,
  };
}

function YearSelect({
  availableYears,
  selectedYear,
  disabled,
  onChange,
}: {
  availableYears: number[];
  selectedYear: number | null;
  disabled: boolean;
  onChange: (year: number) => void;
}) {
  if (availableYears.length === 0 || selectedYear === null) return null;

  return (
    <label className="flex items-center gap-2 text-sm text-[var(--px-muted)]">
      <span className="data-label text-[11px] font-semibold uppercase">År</span>
      <select
        value={selectedYear}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)] px-3 py-2 text-sm font-semibold tabular-nums text-[var(--px-text)] outline-none transition-colors hover:border-[var(--px-accent)] disabled:opacity-50"
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewSwitch({ view, onChange }: { view: GroupView; onChange: (view: GroupView) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
        Visning
      </span>
      <div className="flex overflow-hidden rounded-xl border border-[var(--px-border)] bg-[var(--px-surface)]">
        {(
          [
            { id: "structure", label: "Struktur" },
            { id: "network", label: "Nettverk" },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`px-3 py-2 text-[11px] font-semibold transition-colors ${
              view === option.id
                ? "bg-[var(--px-action)] text-white"
                : "text-[var(--px-muted)] hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({
  node,
  parent,
  selectedYear,
  onClose,
}: {
  node: GroupNode;
  parent: GroupNode | null;
  selectedYear: number | null;
  onClose: () => void;
}) {
  const role =
    node.relationshipToParent === null ? "Konsernspiss" : relationshipLabel(node.relationshipToParent);

  return (
    <aside className="sticky top-36 h-fit rounded-2xl border border-[var(--px-border)] bg-[var(--px-surface)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
            Selskapsdetaljer
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-tight text-[var(--px-text)]">
            {node.name}
          </h3>
          <p className="mt-1 text-xs tabular-nums text-[var(--px-muted)]">Org.nr. {node.orgNumber}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--px-border)] p-2 text-[var(--px-muted)] transition-colors hover:border-[var(--px-accent)] hover:text-[var(--px-text)]"
          aria-label="Lukk detaljpanel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-5 space-y-3 border-t border-[var(--px-border)] pt-4 text-sm">
        <DetailRow label="Nåværende status">
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(
              node.status,
            )}`}
          >
            {statusLabel(node.status)}
          </span>
        </DetailRow>
        <DetailRow label="Rolle i valgt struktur">{role}</DetailRow>
        <DetailRow label="Forelder i valgt år">{parent?.name ?? "Ingen"}</DetailRow>
        <DetailRow label="Eierandel i valgt år">{formatPercent(node.ownershipPercent)}</DetailRow>
        <DetailRow label="Valgt år">{selectedYear ?? "Ikke valgt"}</DetailRow>
        <DetailRow label="I konsernet valgt år">Ja, node inngår i rekonstruert struktur.</DetailRow>
        {node.status === "DISSOLVED" ? (
          <>
            <DetailRow label="Dagens status">Oppløst</DetailRow>
            <DetailRow label="Oppløsningsdato">Ikke tilgjengelig i strukturdata</DetailRow>
          </>
        ) : null}
        <DetailRow label="Nøkkeltall">Ikke tilgjengelig i strukturdata</DetailRow>
        <DetailRow label="Ansatte">Ikke tilgjengelig i strukturdata</DetailRow>
        <DetailRow label="Siste regnskapsår">Ikke tilgjengelig i strukturdata</DetailRow>
      </div>

      <Link
        href={`/companies/${node.orgNumber}?tab=konsern`}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--px-action)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--px-action-hover)]"
      >
        Åpne selskap
        <ExternalLink className="h-4 w-4" />
      </Link>
    </aside>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-[rgba(15,23,42,0.06)] pb-3 last:border-b-0 last:pb-0">
      <dt className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">
        {label}
      </dt>
      <dd className="text-[var(--px-text)]">{children}</dd>
    </div>
  );
}

function formatShares(value: string) {
  try {
    return new Intl.NumberFormat("nb-NO").format(BigInt(value));
  } catch {
    return value;
  }
}

function FinancialPositions({
  positions,
  expanded,
  onToggleExpanded,
  showEmpty,
}: {
  positions: CompanyHolding[];
  expanded: boolean;
  onToggleExpanded: () => void;
  showEmpty: boolean;
}) {
  if (positions.length === 0 && !showEmpty) return null;

  const visiblePositions = expanded ? positions : positions.slice(0, 10);
  const hiddenCount = Math.max(positions.length - visiblePositions.length, 0);

  return (
    <section className="space-y-3 border-t border-[var(--px-border)] pt-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--px-text)]">Finansielle posisjoner</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--px-muted)]">
            Aksjeposter under 20 %, og offentlige eierposter i AS/ASA uansett eierandel, vises som
            finansielle posisjoner. De inngår ikke i konsern- eller tilknyttet selskapsstruktur.
          </p>
        </div>
        {positions.length > 0 ? (
          <div className="data-label text-[11px] font-semibold uppercase text-[var(--px-muted)]">
            {positions.length} posisjoner
          </div>
        ) : null}
      </div>

      {positions.length > 0 ? (
        <div className="overflow-x-auto border-y border-[var(--px-border)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--px-border)] text-left">
                <th className="data-label py-2 pr-4 text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Selskap
                </th>
                <th className="data-label py-2 pr-4 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Aksjer
                </th>
                <th className="data-label py-2 pr-4 text-right text-[10px] font-semibold uppercase text-[var(--px-muted)]">
                  Eierandel
                </th>
                <th className="w-10 py-2" aria-label="Åpne selskap" />
              </tr>
            </thead>
            <tbody>
              {visiblePositions.map((position) => (
                <tr
                  key={position.orgNumber}
                  className="border-b border-[rgba(15,23,42,0.06)] transition-colors last:border-b-0 hover:bg-[var(--px-subtle)]"
                >
                  <td className="py-2 pr-4">
                    <div className="font-semibold text-[var(--px-text)]">{position.name}</div>
                    <div className="text-xs tabular-nums text-[var(--px-muted)]">
                      Org.nr. {position.orgNumber}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-[var(--px-text)]">
                    {formatShares(position.shares)}
                  </td>
                  <td className="py-2 pr-4 text-right font-semibold tabular-nums text-[var(--px-text)]">
                    {formatPercent(position.ownershipPercent)}
                  </td>
                  <td className="py-2 text-right">
                    <Link
                      href={`/companies/${position.orgNumber}?tab=konsern`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--px-muted)] transition-colors hover:bg-[var(--px-subtle)] hover:text-[var(--px-text)]"
                      aria-label={`Åpne ${position.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-3 text-sm leading-6 text-[var(--px-muted)]">
          Ingen finansielle posisjoner er registrert for valgt år.
        </p>
      )}

      {hiddenCount > 0 || expanded ? (
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-xs font-semibold text-[var(--px-accent)] hover:underline"
        >
          {expanded ? "Vis færre" : `Vis alle ${positions.length} posisjoner`}
        </button>
      ) : null}
    </section>
  );
}

export function OwnershipTab({ slug, initial }: { slug: string; initial: OwnershipOverview }) {
  const [overview, setOverview] = useState<OwnershipOverview>(initial);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [view, setView] = useState<GroupView>("structure");
  const [selectedOrgNumber, setSelectedOrgNumber] = useState<string | null>(null);
  const [financialPositionsExpanded, setFinancialPositionsExpanded] = useState(false);

  useEffect(() => {
    setOverview(initial);
    setSelectedOrgNumber(null);
    setFinancialPositionsExpanded(false);
    setRequestError(null);
  }, [initial]);

  async function selectYear(year: number) {
    if (year === overview.year || loading) return;
    setLoading(true);
    setRequestError(null);
    try {
      const response = await fetch(`/api/companies/${slug}/group-structure?year=${year}`);
      if (!response.ok) {
        setRequestError("Kunne ikke hente konsernstruktur for valgt år.");
        return;
      }
      const payload = (await response.json()) as { data: OwnershipOverview };
      setOverview(payload.data);
      setSelectedOrgNumber(null);
      setFinancialPositionsExpanded(false);
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => buildSummary(overview), [overview]);
  const selectedNode = useMemo(
    () => overview.group?.nodes.find((node) => node.orgNumber === selectedOrgNumber) ?? null,
    [overview.group, selectedOrgNumber],
  );
  const selectedParent = useMemo(
    () => findParent(overview.group?.nodes ?? [], selectedNode),
    [overview.group, selectedNode],
  );
  const financialPositions = useMemo(
    () =>
      overview.holdings
        .filter(
          (holding) =>
            holding.relationship === "MINORITY" || holding.relationship === "FINANCIAL_POSITION",
        )
        .sort((left, right) => (right.ownershipPercent ?? -1) - (left.ownershipPercent ?? -1)),
    [overview.holdings],
  );
  const hasGroupStructure = Boolean(
    overview.group?.membershipStatus === "RESOLVED" && overview.group.nodes.length > 1,
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <h2 className="editorial-display text-3xl font-semibold text-[var(--px-text)]">
            Konsernstruktur
          </h2>
          {summary ? (
            <div className="mt-3 space-y-1 text-sm leading-6 text-[var(--px-muted)]">
              <p className="text-[var(--px-text)]">{summary.lead}</p>
              <p>
                Morselskap: {summary.parent?.name ?? "Ingen"} · Direkte eierandel:{" "}
                {formatPercent(summary.currentNode?.ownershipPercent ?? null)}
              </p>
              <p>
                {summary.subsidiaries} datterselskaper · {summary.associated} tilknyttede selskaper ·{" "}
                {summary.dissolved} oppløste selskaper
              </p>
              {overview.year !== null ? (
                <p>Eierskapsstruktur per 31. desember {overview.year}.</p>
              ) : null}
              {overview.sourceImportStatus === "PARTIAL" ? (
                <p>
                  Kildeimporten er delvis: ugyldige kilderader er utelatt og kan gi manglende
                  relasjoner.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[var(--px-muted)]">
              {overview.group?.membershipStatus === "CONFLICT"
                ? "Konserntilhørighet vises ikke fordi eierskapskildene gir en motstridende kontrollkjede."
                : overview.group?.membershipStatus === "UNKNOWN"
                  ? "Konserntilhørighet vises ikke fordi den kontrollerende eierkjeden er ufullstendig."
                  : "Konsernstruktur vises når en komplett aksjonærregisterimport og publisert gruppestruktur er tilgjengelig."}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-y border-[var(--px-border)] py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <YearSelect
              availableYears={overview.availableYears}
              selectedYear={overview.year}
              disabled={loading}
              onChange={selectYear}
            />
            <ViewSwitch view={view} onChange={setView} />
          </div>
          {loading ? (
            <span className="text-xs font-medium text-[var(--px-muted)]">Laster valgt år...</span>
          ) : null}
        </div>
      </section>

      {requestError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {requestError}
        </p>
      ) : null}

      {overview.availabilityMessage ? (
        <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-3 text-sm leading-6 text-[var(--px-muted)]">
          {overview.availabilityMessage}
        </p>
      ) : null}

      {hasGroupStructure && overview.group ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {view === "network" ? (
              <OwnershipChart
                group={overview.group}
                selectedOrgNumber={selectedOrgNumber}
                onSelectNode={setSelectedOrgNumber}
              />
            ) : (
              <OwnershipTree
                group={overview.group}
                selectedOrgNumber={selectedOrgNumber}
                onSelectNode={setSelectedOrgNumber}
              />
            )}
          </div>

          {selectedNode ? (
            <DetailPanel
              node={selectedNode}
              parent={selectedParent}
              selectedYear={overview.year}
              onClose={() => setSelectedOrgNumber(null)}
            />
          ) : (
            <aside className="hidden rounded-2xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] p-5 text-sm leading-6 text-[var(--px-muted)] lg:block">
              Klikk på en rad eller node for detaljer om rolle, status og eierandel i valgt år.
            </aside>
          )}
        </div>
      ) : overview.group && financialPositions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--px-border)] bg-[var(--px-subtle)] px-4 py-3 text-sm leading-6 text-[var(--px-muted)]">
          Ingen registrerte konsernrelasjoner for valgt år.
        </p>
      ) : null}

      <FinancialPositions
        positions={financialPositions}
        expanded={financialPositionsExpanded}
        onToggleExpanded={() => setFinancialPositionsExpanded((current) => !current)}
        showEmpty={!hasGroupStructure}
      />

      {overview.group?.truncated ? (
        <p className="text-xs text-amber-700">
          Visningen er begrenset fordi konsernet er stort. Dataene er ikke komplettert med syntetiske noder.
        </p>
      ) : null}

      <p className="border-t border-[var(--px-border)] pt-3 text-xs leading-5 text-[var(--px-muted)]">
        Kilde: Rekonstruert konsernstruktur basert på Skatteetatens aksjonærregister,
        Enhetsregisteret og historiske selskapsstatuser. Valgt år betyr historisk
        rekonstruksjon av konsernstruktur, ikke aksjonærregister-snapshot.
      </p>
    </div>
  );
}
