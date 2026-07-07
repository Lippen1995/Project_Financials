"use client";

import { ArrowUpRight, ChevronDown, ChevronsUpDown, ChevronUp, Info, LoaderCircle, Search } from "lucide-react";
import { ReactNode, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Card } from "@/components/ui/card";
import { IPRightType, IpCaseDetailView, IpRightListItem } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { loadIpCaseDetailAction } from "@/server/ip/ip-actions";

type TypeFilter = "all" | IPRightType;
type StatusFilter = "all" | "active" | "inactive" | "pending";
type SortKey = "type" | "title" | "status" | "registrationOrGrantDate" | "expiryDate" | "lastEventDate" | "ownerName";
type SortDir = "asc" | "desc";

type Props = {
  orgNumber: string;
  rights: IpRightListItem[];
};

const DEFAULT_VISIBLE = 10;
const numberFormat = new Intl.NumberFormat("nb-NO");
const DATE_SORT_KEYS = new Set<SortKey>(["registrationOrGrantDate", "expiryDate", "lastEventDate"]);

const TYPE_LABELS: Record<IPRightType, string> = {
  patent: "Patent",
  trademark: "Varemerke",
  design: "Design",
  elCertificate: "Elsertifikat",
};

const TYPE_EXPLANATIONS: Record<IPRightType, string> = {
  patent:
    "Patent gir tidsbegrenset enerett til a utnytte en teknisk oppfinnelse kommersielt, normalt i inntil 20 ar fra soknadsdato.",
  trademark:
    "Varemerke beskytter et kjennetegn, som navn, logo eller slagord, for bestemte varer og tjenester, og kan fornyes hvert 10. ar.",
  design:
    "Design beskytter det ytre utseendet og utformingen til et produkt, som form, monster og farge, i inntil 25 ar.",
  elCertificate:
    "Elsertifikater er en offentlig stotteordning for fornybar kraftproduksjon. NVE oppgir godkjente anlegg, eier, ytelse, produksjon og tildelingsperiode.",
};

const TYPE_PLURAL: Record<TypeFilter, string> = {
  all: "saker",
  patent: "patenter",
  trademark: "varemerker",
  design: "design",
  elCertificate: "elsertifikater",
};

const TYPE_OPTIONS: Array<{ id: TypeFilter; label: string }> = [
  { id: "all", label: "Alle typer" },
  { id: "patent", label: "Patenter" },
  { id: "trademark", label: "Varemerker" },
  { id: "design", label: "Design" },
  { id: "elCertificate", label: "Elsertifikater" },
];

const STATUS_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "Alle statuser" },
  { id: "active", label: "Aktiv" },
  { id: "inactive", label: "Historisk" },
  { id: "pending", label: "Under behandling" },
];

function toTime(value: string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function matchesStatus(item: IpRightListItem, status: StatusFilter) {
  if (status === "all") return true;
  if (status === "active") return item.isActive === true;
  if (status === "inactive") return item.isActive === false;
  return item.isActive === null;
}

function compareRows(left: IpRightListItem, right: IpRightListItem, key: SortKey) {
  if (DATE_SORT_KEYS.has(key)) {
    return toTime(left[key] as string | null) - toTime(right[key] as string | null);
  }
  if (key === "type") {
    return TYPE_LABELS[left.type].localeCompare(TYPE_LABELS[right.type], "nb-NO");
  }
  return String(left[key] ?? "").localeCompare(String(right[key] ?? ""), "nb-NO");
}

function StatusBadge({ status, isActive }: { status: string | null; isActive: boolean | null }) {
  const tone =
    isActive === true
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : isActive === false
        ? "border-slate-200 bg-slate-100 text-slate-600"
        : "border-amber-200 bg-amber-50 text-amber-700";
  const dot = isActive === true ? "bg-emerald-500" : isActive === false ? "bg-slate-400" : "bg-amber-500";

  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {status ?? "Ukjent"}
    </span>
  );
}

function InfoTooltip({ children, text }: { children: ReactNode; text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  return (
    <span
      className="relative inline-flex cursor-help items-center gap-1"
      onMouseEnter={(event) => setPos({ x: event.clientX, y: event.clientY })}
      onMouseMove={(event) => setPos({ x: event.clientX, y: event.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos
        ? createPortal(
            <span
              style={{ position: "fixed", left: pos.x + 14, top: pos.y + 16, zIndex: 60 }}
              className="pointer-events-none max-w-xs rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-xs leading-5 text-slate-700 shadow-lg"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

export function IpPortfolio({ orgNumber, rights }: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastEventDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, IpCaseDetailView | null>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const direction = sortDir === "asc" ? 1 : -1;
    return rights
      .filter((item) => (typeFilter === "all" ? true : item.type === typeFilter))
      .filter((item) => matchesStatus(item, statusFilter))
      .filter((item) => {
        if (!q) return true;
        return [item.title, item.applicationNumber, item.status, item.ownerName, ...item.supportingFacts.map((fact) => fact.value)]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q));
      })
      .sort((left, right) => compareRows(left, right, sortKey) * direction);
  }, [query, rights, sortDir, sortKey, statusFilter, typeFilter]);

  const stats = useMemo(() => {
    const latestActivityDate =
      filtered
        .map((item) => item.lastEventDate)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => toTime(right) - toTime(left))[0] ?? null;

    return {
      total: filtered.length,
      patents: filtered.filter((item) => item.type === "patent").length,
      trademarks: filtered.filter((item) => item.type === "trademark").length,
      designs: filtered.filter((item) => item.type === "design").length,
      elCertificates: filtered.filter((item) => item.type === "elCertificate").length,
      active: filtered.filter((item) => item.isActive === true).length,
      latestActivityDate,
    };
  }, [filtered]);

  const isCollapsible = filtered.length > DEFAULT_VISIBLE;
  const visible = expanded || !isCollapsible ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = filtered.length - DEFAULT_VISIBLE;
  const selected = filtered.find((item) => item.id === selectedId) ?? null;
  const selectedDetail = selected ? details[selected.id] : null;

  function toggleSort(key: SortKey) {
    setExpanded(false);
    if (key === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(DATE_SORT_KEYS.has(key) ? "desc" : "asc");
  }

  function selectRow(item: IpRightListItem) {
    setSelectedId(item.id);
    if (item.id in details || !item.applicationNumber) return;

    setLoadingId(item.id);
    startTransition(async () => {
      const detail = await loadIpCaseDetailAction({
        type: item.type,
        applicationNumber: item.applicationNumber!,
        orgNumber,
      });
      setDetails((current) => ({ ...current, [item.id]: detail }));
      setLoadingId((current) => (current === item.id ? null : current));
    });
  }

  function SortHeader({ label, columnKey }: { label: string; columnKey: SortKey }) {
    const active = sortKey === columnKey;
    return (
      <th className="px-3 py-2 font-semibold">
        <button
          type="button"
          onClick={() => toggleSort(columnKey)}
          className="inline-flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800"
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300" />
          )}
        </button>
      </th>
    );
  }

  const cards: Array<[string, string]> = [
    ["Totalt", numberFormat.format(stats.total)],
    ["Patenter", numberFormat.format(stats.patents)],
    ["Varemerker", numberFormat.format(stats.trademarks)],
    ["Design", numberFormat.format(stats.designs)],
    ["Elsertifikater", numberFormat.format(stats.elCertificates)],
    ["Aktive", numberFormat.format(stats.active)],
    ["Siste aktivitet", stats.latestActivityDate ? formatDate(stats.latestActivityDate) : "Ukjent"],
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        {cards.map(([label, value]) => (
          <Card key={label} className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)] p-4">
            <div className="data-label text-[11px] font-semibold uppercase text-slate-500">{label}</div>
            <div className="mt-1.5 text-lg font-semibold text-slate-950">{value}</div>
          </Card>
        ))}
      </section>

      <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
        <div className="grid gap-3 lg:grid-cols-[auto,auto,1fr] lg:items-center">
          <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700">
            <span className="text-slate-500">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value as TypeFilter);
                setExpanded(false);
              }}
              className="bg-transparent font-medium outline-none"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-700">
            <span className="text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setExpanded(false);
              }}
              className="bg-transparent font-medium outline-none"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="inline-flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-3 py-2 text-sm text-slate-600">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setExpanded(false);
              }}
              placeholder="Sok i portefoljen"
              className="w-full bg-transparent outline-none"
            />
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(15,23,42,0.08)] text-left text-slate-500">
                <SortHeader label="Type" columnKey="type" />
                <SortHeader label="Tittel / navn" columnKey="title" />
                <SortHeader label="Status" columnKey="status" />
                <SortHeader label="Registrert" columnKey="registrationOrGrantDate" />
                <SortHeader label="Utloper" columnKey="expiryDate" />
                <SortHeader label="Siste aktivitet" columnKey="lastEventDate" />
                <SortHeader label="Eier / soker" columnKey="ownerName" />
                <th className="px-3 py-2 font-semibold">Kilde</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item.id}
                  className={cn(
                    "cursor-pointer border-b border-[rgba(15,23,42,0.06)] hover:bg-[rgba(248,249,250,0.55)]",
                    selected?.id === item.id ? "bg-[rgba(248,249,250,0.75)]" : "",
                  )}
                  onClick={() => selectRow(item)}
                >
                  <td className="px-3 py-3">
                    <InfoTooltip text={TYPE_EXPLANATIONS[item.type]}>
                      <span>{TYPE_LABELS[item.type]}</span>
                      <Info className="h-3.5 w-3.5 text-slate-400" />
                    </InfoTooltip>
                  </td>
                  <td className="px-3 py-3 font-medium text-slate-900">{item.title ?? "Uten tittel"}</td>
                  <td className="px-3 py-3">
                    <StatusBadge status={item.status} isActive={item.isActive} />
                  </td>
                  <td className="px-3 py-3">
                    {item.registrationOrGrantDate ? formatDate(item.registrationOrGrantDate) : "-"}
                  </td>
                  <td className="px-3 py-3">{item.expiryDate ? formatDate(item.expiryDate) : "-"}</td>
                  <td className="px-3 py-3">{item.lastEventDate ? formatDate(item.lastEventDate) : "Ukjent"}</td>
                  <td className="px-3 py-3">{item.ownerName ?? "Ukjent"}</td>
                  <td className="px-3 py-3">
                    {item.caseUrl ? (
                      <a
                        href={item.caseUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex items-center gap-1 text-slate-700 underline"
                      >
                        Apne <ArrowUpRight className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-slate-500">Ingen lenke</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Ingen saker matcher valgt filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {isCollapsible ? (
          <div className="flex justify-center border-t border-[var(--px-border)] py-3">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="data-label cursor-pointer border-b-2 border-[var(--px-accent)] pb-[3px] text-[11px] uppercase text-[var(--px-accent)] outline-none transition-colors"
            >
              {expanded ? "Vis faerre" : `Se alle (${numberFormat.format(hiddenCount)} andre ${TYPE_PLURAL[typeFilter]})`}
            </button>
          </div>
        ) : null}
      </Card>

      {selected ? (
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.86)]">
          <div className="data-label text-[11px] font-semibold uppercase text-slate-500">Detaljvisning</div>

          {isPending && loadingId === selected.id ? (
            <div className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Laster detaljer...
            </div>
          ) : null}

          {selectedDetail ? (
            <PatentstyretDetail detail={selectedDetail} selected={selected} />
          ) : selected.supportingFacts.length > 0 ? (
            <SourceFactDetail selected={selected} />
          ) : !isPending && selected.id in details ? (
            <p className="mt-3 text-sm text-slate-600">Fant ikke utvidede detaljer for denne saken.</p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

function PatentstyretDetail({ detail, selected }: { detail: IpCaseDetailView; selected: IpRightListItem }) {
  return (
    <div className="mt-4 grid gap-6 md:grid-cols-2">
      <div>
        <div className="text-sm font-semibold text-slate-900">{detail.title ?? "Uten tittel"}</div>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>Type: {TYPE_LABELS[detail.type]}</li>
          <li className="flex items-center gap-2">
            Status: <StatusBadge status={detail.status} isActive={selected.isActive} />
          </li>
          <li>Soknadsdato: {detail.applicationDate ? formatDate(detail.applicationDate) : "Ukjent"}</li>
          <li>Registrert: {detail.registrationOrGrantDate ? formatDate(detail.registrationOrGrantDate) : "-"}</li>
          <li>Utloper: {detail.expiryDate ? formatDate(detail.expiryDate) : "Ukjent"}</li>
          {detail.classifications.length > 0 ? <li>Klassifisering: {detail.classifications.join(", ")}</li> : null}
        </ul>
      </div>
      <div>
        {detail.inventors.length > 0 ? (
          <>
            <div className="text-sm font-semibold text-slate-900">Oppfinnere</div>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {detail.inventors.map((inventor) => (
                <li key={inventor}>{inventor}</li>
              ))}
            </ul>
          </>
        ) : null}
        {detail.owners.length > 0 ? (
          <div className={detail.inventors.length > 0 ? "mt-4" : ""}>
            <div className="text-sm font-semibold text-slate-900">Eier / soker</div>
            <ul className="mt-2 space-y-1 text-sm text-slate-600">
              {detail.owners.map((owner) => (
                <li key={`${owner.name}-${owner.orgNumber ?? ""}`}>{owner.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SourceFactDetail({ selected }: { selected: IpRightListItem }) {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div>
        <div className="text-sm font-semibold text-slate-900">{selected.title ?? "Uten tittel"}</div>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>Type: {TYPE_LABELS[selected.type]}</li>
          <li className="flex items-center gap-2">
            Status: <StatusBadge status={selected.status} isActive={selected.isActive} />
          </li>
          <li>Startdato: {selected.registrationOrGrantDate ? formatDate(selected.registrationOrGrantDate) : "Ukjent"}</li>
          <li>Sluttdato: {selected.expiryDate ? formatDate(selected.expiryDate) : "Ukjent"}</li>
          <li>Eier: {selected.ownerName ?? "Ukjent"}</li>
        </ul>
      </div>
      <div className="grid gap-2">
        {selected.supportingFacts.map((fact) => (
          <div
            key={`${fact.label}-${fact.value}`}
            className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.62)] p-3"
          >
            <div className="data-label text-[10px] font-semibold uppercase text-slate-500">{fact.label}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{fact.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
