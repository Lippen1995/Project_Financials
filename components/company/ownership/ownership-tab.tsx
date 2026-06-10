"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/card";
import { relationshipLabel } from "@/server/ownership/ownership-thresholds";
import type {
  CompanyHolding,
  DirectShareholder,
  OwnershipOverview,
} from "@/server/ownership/types";

import { OwnershipChart } from "./ownership-chart";
import { OwnershipTree } from "./ownership-tree";

const numberFormat = new Intl.NumberFormat("nb-NO");

function formatPercent(value: number | null) {
  if (value === null) return "–";
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value)} %`;
}

function relationshipBadgeClass(relationship: CompanyHolding["relationship"]) {
  if (relationship === "SUBSIDIARY") return "border-[#D4E2F4] bg-[#F5F9FF] text-[#173B71]";
  if (relationship === "ASSOCIATED") return "border-[#E6D9C7] bg-[#FCF7EF] text-[#704E23]";
  return "border-[rgba(15,23,42,0.1)] bg-[rgba(248,249,250,0.8)] text-slate-600";
}

function SectionHeader({ label, title, lead }: { label: string; title: string; lead: string }) {
  return (
    <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
      <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">{title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-slate-500">{lead}</p>
    </div>
  );
}

function ShareholderTable({ shareholders }: { shareholders: DirectShareholder[] }) {
  if (shareholders.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-6 text-slate-600">
        Ingen registrerte aksjonærer for valgt år.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[rgba(15,23,42,0.08)] text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-4 font-semibold">Aksjonær</th>
            <th className="py-2 pr-4 font-semibold">Type</th>
            <th className="py-2 pr-4 text-right font-semibold">Aksjer</th>
            <th className="py-2 text-right font-semibold">Eierandel</th>
          </tr>
        </thead>
        <tbody>
          {shareholders.map((shareholder, index) => (
            <tr
              key={`${shareholder.orgNumber ?? shareholder.name}-${shareholder.birthYear ?? index}`}
              className="border-b border-[rgba(15,23,42,0.05)]"
            >
              <td className="py-2 pr-4">
                {shareholder.orgNumber ? (
                  <Link
                    href={`/companies/${shareholder.orgNumber}?tab=eierskap`}
                    className="font-semibold text-[var(--px-text)] hover:underline"
                  >
                    {shareholder.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-slate-900">{shareholder.name}</span>
                )}
                <div className="text-[11px] text-slate-500">
                  {shareholder.orgNumber
                    ? `Org.nr. ${shareholder.orgNumber}`
                    : shareholder.birthYear
                      ? `Født ${shareholder.birthYear}`
                      : ""}
                  {shareholder.postalPlace ? ` · ${shareholder.postalPlace}` : ""}
                </div>
              </td>
              <td className="py-2 pr-4 text-slate-600">
                {shareholder.type === "PERSON"
                  ? "Person"
                  : shareholder.type === "COMPANY"
                    ? "Selskap"
                    : "Uavklart"}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-slate-700">
                {numberFormat.format(BigInt(shareholder.shares))}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums text-slate-900">
                {formatPercent(shareholder.ownershipPercent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldingsList({ holdings }: { holdings: CompanyHolding[] }) {
  if (holdings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-6 text-slate-600">
        Selskapet eier ingen registrerte aksjeposter i andre selskaper for valgt år.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {holdings.map((holding) => (
        <Link
          key={holding.orgNumber}
          href={`/companies/${holding.orgNumber}?tab=eierskap`}
          className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 transition-colors hover:border-[rgba(15,23,42,0.16)]"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{holding.name}</div>
            <div className="text-[11px] text-slate-500">Org.nr. {holding.orgNumber}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-sm font-semibold tabular-nums text-slate-900">
              {formatPercent(holding.ownershipPercent)}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${relationshipBadgeClass(
                holding.relationship,
              )}`}
            >
              {relationshipLabel(holding.relationship)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function OwnershipTab({
  slug,
  initial,
}: {
  slug: string;
  initial: OwnershipOverview;
}) {
  const [overview, setOverview] = useState<OwnershipOverview>(initial);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"chart" | "list">("list");

  useEffect(() => {
    setOverview(initial);
  }, [initial]);

  async function selectYear(year: number) {
    if (year === overview.year || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/companies/${slug}/group-structure?year=${year}`);
      if (response.ok) {
        const payload = (await response.json()) as { data: OwnershipOverview };
        setOverview(payload.data);
      }
    } finally {
      setLoading(false);
    }
  }

  const { group } = overview;
  const subsidiaryCount = group?.nodes.filter((n) => n.relationshipToParent === "SUBSIDIARY").length ?? 0;
  const associatedCount = group?.nodes.filter((n) => n.relationshipToParent === "ASSOCIATED").length ?? 0;
  const currentNode = group?.nodes.find((n) => n.orgNumber === group.currentOrgNumber);
  const immediateParentName = currentNode?.parentOrgNumber
    ? (group?.nodes.find((n) => n.orgNumber === currentNode.parentOrgNumber)?.name ?? null)
    : null;

  return (
    <div className="space-y-6">
      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">
              Eierskap og konsern
            </div>
            <h2 className="mt-2 text-[1.55rem] font-semibold text-slate-950">
              Konsern- og aksjonærstruktur
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
              Eierbasert struktur fra Skatteetatens aksjonærregister: datterselskaper (&gt;50 %),
              tilknyttede selskaper (20–50 %) og hele konsernet over deg når du er kontrollert.
            </p>
          </div>
          {overview.availableYears.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {overview.availableYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  onClick={() => selectYear(year)}
                  disabled={loading}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold tabular-nums transition-colors disabled:opacity-50 ${
                    year === overview.year
                      ? "border-[var(--px-action)] bg-[var(--px-action)] text-white"
                      : "border-[rgba(15,23,42,0.12)] bg-white text-slate-700 hover:border-[rgba(15,23,42,0.2)]"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      {overview.availabilityMessage ? (
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
          <p className="text-sm leading-6 text-slate-600">{overview.availabilityMessage}</p>
        </Card>
      ) : (
        <>
          {group ? (
            <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
              <SectionHeader
                label="Konsernstruktur"
                title="Konsernstruktur"
                lead={
                  group.ultimateParent
                    ? `${overview.companyName} inngår i et konsern.${
                        immediateParentName ? ` Morselskapet er ${immediateParentName}.` : ""
                      }`
                    : `${overview.companyName} er konsernspiss i sitt eget konsern.`
                }
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span className="font-semibold tabular-nums text-slate-900">
                    {subsidiaryCount}
                  </span>
                  <span className="-ml-2">datterselskaper</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {associatedCount}
                  </span>
                  <span className="-ml-2">tilknyttede</span>
                  {group.truncated ? (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-amber-700">Begrenset visning for store konsern</span>
                    </>
                  ) : null}
                </div>
                {group.nodes.length > 1 ? (
                  <div className="flex overflow-hidden rounded-lg border border-[rgba(15,23,42,0.12)]">
                    {(
                      [
                        { id: "list", label: "Struktur" },
                        { id: "chart", label: "Kart" },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setView(option.id)}
                        className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                          view === option.id
                            ? "bg-[var(--px-accent)] text-white"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mt-4">
                {group.nodes.length > 1 ? (
                  view === "chart" ? (
                    <OwnershipChart group={group} />
                  ) : (
                    <OwnershipTree group={group} />
                  )
                ) : (
                  <p className="rounded-xl border border-dashed border-[rgba(15,23,42,0.14)] bg-[rgba(248,249,250,0.62)] p-6 text-sm leading-6 text-slate-600">
                    Ingen registrerte konsernrelasjoner (datter- eller morselskap) for valgt år.
                  </p>
                )}
              </div>
            </Card>
          ) : null}

          <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
            <SectionHeader
              label="Aksjonærer"
              title="Hvem eier selskapet"
              lead="Direkte aksjonærer med eierandel, aggregert over aksjeklasser."
            />
            <div className="mt-4">
              <ShareholderTable shareholders={overview.directShareholders} />
            </div>
          </Card>

          <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
            <SectionHeader
              label="Eierposter"
              title="Hva selskapet eier"
              lead="Aksjeposter selskapet selv har i andre selskaper."
            />
            <div className="mt-4">
              <HoldingsList holdings={overview.holdings} />
            </div>
          </Card>

          {overview.year ? (
            <p className="px-1 text-xs text-slate-400">
              Datakilde: Skatteetatens aksjonærregister · skatteåret {overview.year}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
