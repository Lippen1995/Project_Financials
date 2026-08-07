"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  FinancialDatasetMode,
  FinancialDatasetVersion,
  FinancialStatementOrigin,
} from "@/lib/types";
import { addToWatchlistAction, archiveWatchlistCompanyAction } from "@/server/actions/workspace-collaboration-actions";

/* ------------------------------------------------------------------ *
 * Types — the serialisable contract the server page passes down.
 * All financials are real numbers in NOK (converted from BigInt on the
 * server); dates are ISO strings. Fields the backend genuinely lacks are
 * null and rendered as honest "—" placeholders rather than fabricated.
 * ------------------------------------------------------------------ */

export type WatchlistStatement = {
  year: number;
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  equity: number | null;
  assets: number | null;
  statementOrigin: FinancialStatementOrigin;
  financialDatasetVersion: FinancialDatasetVersion;
};

export type WatchlistCompany = {
  watchId: string;
  orgNumber: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "DISSOLVED" | "BANKRUPT";
  legalForm: string | null;
  industry: string | null;
  watchedSince: string;
  foundedAt: string | null;
  employeeCount: number | null;
  website: string | null;
  statements: WatchlistStatement[];
};

export type WatchlistNews = {
  id: string;
  title: string;
  summary: string | null;
  company: string;
  orgNumber: string;
  category: string;
  url: string;
  external: boolean;
  date: string;
};

export type WatchlistAlert = {
  id: string;
  type: string;
  title: string;
  body: string;
  companyName: string | null;
  orgNumber: string | null;
  createdAt: string;
};

export type WatchlistDdRoom = {
  id: string;
  name: string;
  companyName: string;
  orgNumber: string;
  slug: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  lastActivityAt: string;
};

export type WatchlistViewProps = {
  workspaceId: string;
  companies: WatchlistCompany[];
  news: WatchlistNews[];
  alerts: WatchlistAlert[];
  ddRooms: WatchlistDdRoom[];
  financialDatasetMode: FinancialDatasetMode;
  financialDatasetVersion: FinancialDatasetVersion;
};

/* ------------------------------------------------------------------ *
 * Client-only grouping model. Section headers ("inndelinger") and the
 * row order are the user's own organisation of real companies — they are
 * persisted to localStorage (keyed by workspace), never to the DB, and
 * never invent company data.
 * ------------------------------------------------------------------ */

type Arrangement = Array<
  | { kind: "header"; id: string; name: string; collapsed: boolean }
  | { kind: "company"; org: string }
>;

const months = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const nbNum = new Intl.NumberFormat("nb-NO");
const nbCompact = new Intl.NumberFormat("nb-NO", { notation: "compact", maximumFractionDigits: 1 });

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return nbCompact.format(n).replace(/ /g, " ");
}

function fmtMnok(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(n / 1e6);
}

function pctSigned(x: number | null): string {
  if (x === null || Number.isNaN(x)) return "—";
  const sign = x >= 0 ? "+" : "−";
  return `${sign}${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(x * 100))} %`;
}

const STATUS_META: Record<
  WatchlistCompany["status"],
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  ACTIVE: { label: "Aktiv", color: "var(--px-success)", bg: "var(--px-success-soft)", border: "var(--px-success-border)", dot: "var(--px-success)" },
  DISSOLVED: { label: "Avviklet", color: "var(--px-muted)", bg: "rgba(15,23,42,0.06)", border: "var(--px-border-subtle)", dot: "var(--px-muted)" },
  BANKRUPT: { label: "Konkurs", color: "var(--px-error)", bg: "var(--px-error-soft)", border: "rgba(190,18,60,0.22)", dot: "var(--px-error)" },
};

const STATUS_RANK: Record<WatchlistCompany["status"], number> = { ACTIVE: 0, DISSOLVED: 1, BANKRUPT: 2 };

function latestStatement(c: WatchlistCompany): WatchlistStatement | null {
  return c.statements.length ? c.statements[c.statements.length - 1] : null;
}

function revenueDelta(c: WatchlistCompany): number | null {
  const s = c.statements;
  if (s.length < 2) return null;
  const cur = s[s.length - 1].revenue;
  const prev = s[s.length - 2].revenue;
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

/* ------------------------------------------------------------------ *
 * Small presentational primitives (recreated from the Fjord Insight
 * design-system components referenced in the source design).
 * ------------------------------------------------------------------ */

function StatusPill({ status }: { status: WatchlistCompany["status"] }) {
  const m = STATUS_META[status];
  return (
    <span
      className="data-label"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10,
        fontWeight: 600,
        color: m.color,
        background: m.bg,
        border: `1px solid ${m.border}`,
        borderRadius: "var(--radius-full)",
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot }} />
      {m.label}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length < 2) {
    return <span style={{ fontSize: 13, color: "var(--px-muted)" }}>—</span>;
  }
  const w = 92;
  const h = 36;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / span) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = up ? "var(--px-success)" : "var(--px-error)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--px-border-subtle)",
        background: "var(--px-surface-strong)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
      }}
    >
      <div className="data-label" style={{ fontSize: 9.5, color: "var(--px-muted)", marginBottom: 8, lineHeight: 1.3 }}>
        {label}
      </div>
      <div className="tabular-nums" style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--px-text)" }}>
        {value}
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  border: "1px solid var(--px-border)",
  background: "var(--px-surface-strong)",
  borderRadius: "var(--radius-md)",
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--px-text)",
  cursor: "pointer",
  fontFamily: "var(--font-sans), sans-serif",
};

/* ------------------------------------------------------------------ */

export function WatchlistView({ workspaceId, companies, news, alerts, ddRooms }: WatchlistViewProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const companyByOrg = useMemo(() => {
    const map = new Map<string, WatchlistCompany>();
    companies.forEach((c) => map.set(c.orgNumber, c));
    return map;
  }, [companies]);

  const storageKey = `fjord-watchlist-arrangement:${workspaceId}`;

  const [arrangement, setArrangement] = useState<Arrangement>([]);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const dragId = useRef<string | null>(null);

  // Reconcile the persisted arrangement with the real company set on load
  // and whenever the company set changes: keep known headers + ordering,
  // drop companies that are no longer watched, append newly watched ones.
  useEffect(() => {
    let stored: Arrangement = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) stored = JSON.parse(raw) as Arrangement;
    } catch {
      stored = [];
    }
    setArrangement(reconcile(stored, companies));
    setHydrated(true);
  }, [storageKey, companies]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(arrangement));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [arrangement, hydrated, storageKey]);

  const headers = arrangement.filter((e): e is Extract<Arrangement[number], { kind: "header" }> => e.kind === "header");
  const allCollapsed = headers.length > 0 && headers.every((h) => h.collapsed);

  /* -------------------------------- mutations -------------------------------- */

  function idOf(e: Arrangement[number]): string {
    return e.kind === "header" ? e.id : e.org;
  }

  function moveBefore(dragged: string | null, targetId: string) {
    if (!dragged || dragged === targetId) return;
    setArrangement((arr) => {
      const from = arr.findIndex((e) => idOf(e) === dragged);
      if (from < 0) return arr;
      const copy = arr.slice();
      const [moved] = copy.splice(from, 1);
      let to = copy.findIndex((e) => idOf(e) === targetId);
      if (to < 0) to = copy.length;
      copy.splice(to, 0, moved);
      return copy;
    });
    dragId.current = null;
  }

  function addHeader() {
    const id = `h${Date.now()}`;
    setArrangement((arr) => [{ kind: "header", id, name: "Ny inndeling", collapsed: false }, ...arr]);
    setEditingId(id);
  }

  function renameHeader(id: string, name: string) {
    setArrangement((arr) => arr.map((e) => (e.kind === "header" && e.id === id ? { ...e, name } : e)));
  }

  function toggleHeader(id: string) {
    setArrangement((arr) => arr.map((e) => (e.kind === "header" && e.id === id ? { ...e, collapsed: !e.collapsed } : e)));
  }

  function deleteHeader(id: string) {
    setArrangement((arr) => arr.filter((e) => !(e.kind === "header" && e.id === id)));
    setEditingId((cur) => (cur === id ? null : cur));
  }

  function toggleAll() {
    const collapse = !allCollapsed;
    setArrangement((arr) => arr.map((e) => (e.kind === "header" ? { ...e, collapsed: collapse } : e)));
  }

  function removeCompany(watchId: string) {
    const form = new FormData();
    form.set("watchId", watchId);
    startTransition(async () => {
      await archiveWatchlistCompanyAction(form);
      router.refresh();
    });
  }

  function toggleSort(col: string) {
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortCol(null);
      setSortDir("asc");
    }
  }

  /* -------------------------------- derived rows -------------------------------- */

  const q = query.trim().toLowerCase();
  const matches = (c: WatchlistCompany) =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    c.orgNumber.includes(q) ||
    (c.industry ?? "").toLowerCase().includes(q);

  const cmp = (a: WatchlistCompany, b: WatchlistCompany): number => {
    const dir = sortDir === "desc" ? -1 : 1;
    const la = latestStatement(a);
    const lb = latestStatement(b);
    let r = 0;
    switch (sortCol) {
      case "name":
        r = a.name.localeCompare(b.name, "nb");
        break;
      case "status":
        r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        break;
      case "sector":
        r = (a.industry ?? "").localeCompare(b.industry ?? "", "nb");
        break;
      case "oms":
        r = (la?.revenue ?? -Infinity) - (lb?.revenue ?? -Infinity);
        break;
      case "ebit":
        r = (la?.operatingProfit ?? -Infinity) - (lb?.operatingProfit ?? -Infinity);
        break;
      case "ek":
        r = (la?.equity ?? -Infinity) - (lb?.equity ?? -Infinity);
        break;
      case "trend":
        r = (revenueDelta(a) ?? -Infinity) - (revenueDelta(b) ?? -Infinity);
        break;
      default:
        r = 0;
    }
    return r * dir;
  };

  // Build segments: a leading (headerless) segment, then one per header.
  type Segment = { header: (Arrangement[number] & { kind: "header" }) | null; orgs: string[] };
  const segments: Segment[] = [{ header: null, orgs: [] }];
  arrangement.forEach((e) => {
    if (e.kind === "header") segments.push({ header: e, orgs: [] });
    else segments[segments.length - 1].orgs.push(e.org);
  });

  type RenderRow =
    | { type: "header"; id: string; name: string; collapsed: boolean; count: number }
    | { type: "company"; company: WatchlistCompany };

  const rows: RenderRow[] = [];
  let anyCompanyVisible = false;
  segments.forEach((seg) => {
    const all = seg.orgs.map((org) => companyByOrg.get(org)).filter((c): c is WatchlistCompany => Boolean(c));
    let visible = all.filter(matches);
    if (sortCol) visible = visible.slice().sort(cmp);
    if (seg.header) {
      rows.push({ type: "header", id: seg.header.id, name: seg.header.name, collapsed: seg.header.collapsed, count: all.length });
      if (seg.header.collapsed) return;
    }
    visible.forEach((c) => {
      anyCompanyVisible = true;
      rows.push({ type: "company", company: c });
    });
  });

  const noResults = Boolean(q) && !anyCompanyVisible;
  const hasRows = companies.length > 0 && (anyCompanyVisible || !q);

  const selected = selectedOrg ? companyByOrg.get(selectedOrg) ?? null : null;

  const ddOpenCount = ddRooms.filter((r) => r.status === "ACTIVE").length;
  const ddClosedCount = ddRooms.filter((r) => r.status === "ARCHIVED").length;

  const sortHead = (col: string) => {
    const active = sortCol === col;
    return {
      icon: !active ? "unfold_more" : sortDir === "asc" ? "arrow_upward" : "arrow_downward",
      color: active ? "var(--px-accent)" : "var(--px-muted)",
      opacity: active ? 1 : 0.45,
    };
  };

  /* -------------------------------- render -------------------------------- */

  return (
    <div style={{ fontFamily: "var(--font-sans), sans-serif", color: "var(--px-text)" }}>
      <style>{`
        .wl-input::placeholder { color: var(--px-muted); opacity: 0.7; }
        .wl-hedit { border: 1px solid var(--px-accent); background: #fff; outline: none; box-shadow: 0 0 0 3px var(--px-accent-soft); }
        .wl-row { transition: background-color 120ms cubic-bezier(0.2,0,0,1); }
        .wl-row:hover { background: rgba(248,249,250,0.62); }
        .wl-news { position: relative; }
        .wl-news:hover { background: rgba(248,249,250,0.62); }
        .wl-tip { opacity: 0; visibility: hidden; transform: translateY(4px); transition: opacity 120ms cubic-bezier(0.2,0,0,1), transform 120ms cubic-bezier(0.2,0,0,1); }
        .wl-news:hover .wl-tip { opacity: 1; visibility: visible; transform: translateY(0); }
        .wl-sortbtn:hover { color: var(--px-accent) !important; }
      `}</style>

      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          paddingBottom: 24,
          marginBottom: 24,
          borderBottom: "1px solid var(--px-text)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <h1 className="editorial-display" style={{ fontSize: 40, color: "var(--px-text)", margin: "0 0 10px", letterSpacing: "-0.04em" }}>
            Overvåkningsliste
          </h1>
        </div>
        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
          <div style={{ border: "1px solid var(--px-border-subtle)", background: "rgba(248,249,250,0.72)", borderRadius: "var(--radius-md)", padding: "14px 18px", minWidth: 96 }}>
            <div className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", marginBottom: 6 }}>SELSKAPER</div>
            <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{companies.length}</div>
          </div>
          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            title="Vis alle varsler"
            style={{ textAlign: "left", border: "1px solid var(--px-warning-border)", background: "var(--px-warning-soft)", borderRadius: "var(--radius-md)", padding: "14px 18px", minWidth: 96, cursor: "pointer", fontFamily: "var(--font-sans), sans-serif", position: "relative" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span className="data-label" style={{ fontSize: 10, color: "var(--px-warning)" }}>VARSLER</span>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--px-warning)", opacity: 0.7, marginLeft: "auto" }}>open_in_full</span>
            </div>
            <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--px-warning)" }}>{alerts.length}</div>
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 360, minWidth: 220 }}>
          <span className="material-symbols-outlined" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "var(--px-muted)" }}>search</span>
          <input
            className="wl-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrér på navn, org.nr eller bransje…"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--px-border)", background: "var(--px-surface-strong)", borderRadius: "var(--radius-md)", padding: "9px 12px 9px 38px", fontSize: 14, fontFamily: "var(--font-sans), sans-serif", color: "var(--px-text)", outline: "none" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={toggleAll} style={btnGhost} disabled={headers.length === 0}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--px-muted)" }}>{allCollapsed ? "unfold_more" : "unfold_less"}</span>
            {allCollapsed ? "Utvid alle" : "Minimér alle"}
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--px-accent)", background: "var(--px-accent)", borderRadius: "var(--radius-md)", padding: "9px 15px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans), sans-serif" }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>Legg til selskap
          </button>
          <button type="button" onClick={addHeader} style={{ ...btnGhost, fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--px-muted)" }}>create_new_folder</span>Ny inndeling
          </button>
        </div>
      </div>

      {/* Empty states */}
      {companies.length === 0 ? (
        <div style={{ border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-lg)", padding: "64px 24px", textAlign: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--px-muted)", opacity: 0.5 }}>star</span>
          <p style={{ fontSize: 16, color: "var(--px-text)", margin: "16px 0 4px", fontWeight: 500 }}>Ingen selskaper i overvåkningslisten ennå</p>
          <p style={{ fontSize: 14, color: "var(--px-muted)", margin: 0 }}>Bruk «Legg til selskap» for å begynne å følge selskaper.</p>
        </div>
      ) : noResults ? (
        <div style={{ border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-lg)", padding: "64px 24px", textAlign: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--px-muted)", opacity: 0.5 }}>search_off</span>
          <p style={{ fontSize: 16, color: "var(--px-text)", margin: "16px 0 4px", fontWeight: 500 }}>Ingen selskaper matcher filteret</p>
          <p style={{ fontSize: 14, color: "var(--px-muted)", margin: 0 }}>Juster søket for å se listen igjen.</p>
        </div>
      ) : hasRows ? (
        <>
          <div style={{ overflowX: "auto", borderTop: "1px solid var(--px-border-subtle)" }}>
            <table style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "rgba(248,249,250,0.62)", borderBottom: "1px solid var(--px-border-subtle)" }}>
                  <th style={{ width: 32 }} />
                  <th style={{ width: 40 }} />
                  {(
                    [
                      { key: "name", label: "Selskap", align: "flex-start" },
                      { key: "status", label: "Status", align: "flex-start" },
                      { key: "sector", label: "Bransje", align: "flex-start" },
                      { key: "oms", label: "Omsetning", align: "flex-end" },
                      { key: "ebit", label: "EBIT", align: "flex-end" },
                      { key: "ek", label: "Egenkapital", align: "flex-end" },
                      { key: "trend", label: "Trend", align: "center" },
                    ] as const
                  ).map((col) => {
                    const h = sortHead(col.key);
                    return (
                      <th key={col.key} style={{ padding: 0 }}>
                        <button
                          type="button"
                          className="data-label wl-sortbtn"
                          onClick={() => toggleSort(col.key)}
                          style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: col.align, gap: 5, textAlign: "left", padding: "13px 16px", fontSize: 11, fontWeight: 600, color: h.color, whiteSpace: "nowrap", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-mono), monospace" }}
                        >
                          {col.label}
                          <span className="material-symbols-outlined" style={{ fontSize: 15, opacity: h.opacity }}>{h.icon}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  if (row.type === "header") {
                    const editing = editingId === row.id;
                    return (
                      <tr
                        key={row.id}
                        className="wl-row"
                        draggable
                        onDragStart={() => (dragId.current = row.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          moveBefore(dragId.current, row.id);
                        }}
                        style={{ background: "var(--px-subtle)", borderTop: "1px solid var(--px-border)", borderBottom: "1px solid var(--px-border-subtle)" }}
                      >
                        <td style={{ textAlign: "center", verticalAlign: "middle", color: "var(--px-muted)", cursor: "grab" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: 0.55 }}>drag_indicator</span>
                        </td>
                        <td colSpan={8} style={{ padding: "10px 16px 10px 4px", verticalAlign: "middle" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <button type="button" onClick={() => toggleHeader(row.id)} title="Minimér inndeling" style={{ border: "none", background: "none", cursor: "pointer", padding: 2, display: "inline-flex", color: "var(--px-text)" }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{row.collapsed ? "chevron_right" : "expand_more"}</span>
                            </button>
                            {editing ? (
                              <input
                                autoFocus
                                className="wl-hedit data-label"
                                value={row.name}
                                onChange={(e) => renameHeader(row.id, e.target.value)}
                                onBlur={() => setEditingId(null)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "Escape") {
                                    (e.target as HTMLInputElement).blur();
                                    setEditingId(null);
                                  }
                                }}
                                style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--px-text)", padding: "5px 10px", borderRadius: "var(--radius-md)", width: 320, maxWidth: "60vw", fontFamily: "var(--font-mono), monospace" }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingId(row.id)}
                                title="Gi nytt navn"
                                style={{ border: "none", background: "none", cursor: "text", padding: "4px 6px", margin: "-4px -6px", borderRadius: "var(--radius-md)", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono), monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--px-text)" }}
                              >
                                {row.name}
                                <span className="material-symbols-outlined" style={{ fontSize: 15, color: "var(--px-muted)", opacity: 0.6 }}>edit</span>
                              </button>
                            )}
                            <span className="tabular-nums data-label" style={{ fontSize: 11, color: "var(--px-muted)", background: "var(--px-surface-strong)", border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-full)", padding: "2px 9px", whiteSpace: "nowrap" }}>
                              {row.count === 1 ? "1 selskap" : `${row.count} selskaper`}
                            </span>
                            {row.collapsed ? (
                              <span className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", opacity: 0.7 }}>MINIMERT</span>
                            ) : null}
                            <span style={{ flex: 1 }} />
                            <button type="button" onClick={() => deleteHeader(row.id)} title="Fjern inndeling" style={{ border: "none", background: "none", cursor: "pointer", padding: 4, display: "inline-flex", color: "var(--px-muted)" }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const c = row.company;
                  const latest = latestStatement(c);
                  const delta = revenueDelta(c);
                  const deltaColor = delta === null ? "var(--px-muted)" : delta >= 0 ? "var(--px-success)" : "var(--px-error)";
                  const series = c.statements.map((s) => s.revenue).filter((v): v is number => v !== null);
                  return (
                    <tr
                      key={c.orgNumber}
                      className="wl-row"
                      draggable
                      onDragStart={() => (dragId.current = c.orgNumber)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        moveBefore(dragId.current, c.orgNumber);
                      }}
                      onClick={() => setSelectedOrg(c.orgNumber)}
                      style={{ borderBottom: "1px solid rgba(15,23,42,0.06)", cursor: "pointer" }}
                    >
                      <td style={{ textAlign: "center", verticalAlign: "middle", color: "var(--px-muted)", cursor: "grab" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, opacity: 0.4 }}>drag_indicator</span>
                      </td>
                      <td style={{ padding: "14px 0 14px 8px", verticalAlign: "middle" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCompany(c.watchId);
                          }}
                          title="Fjern fra liste"
                          style={{ border: "none", background: "none", cursor: "pointer", padding: 4, display: "inline-flex", color: "var(--px-watch)" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>star</span>
                        </button>
                      </td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", minWidth: 180 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 500, color: "var(--px-text)", letterSpacing: "-0.01em", lineHeight: 1.25, whiteSpace: "nowrap" }}>{c.name}</div>
                          <div className="data-label tabular-nums" style={{ fontSize: 10, color: "var(--px-muted)", marginTop: 4, lineHeight: 1 }}>{c.orgNumber}</div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle" }}>
                        <StatusPill status={c.status} />
                      </td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", fontSize: 13, color: "var(--px-muted)", maxWidth: 190 }}>{c.industry ?? "—"}</td>
                      <td className="tabular-nums" style={{ padding: "14px 16px", verticalAlign: "middle", textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: 13 }}>
                        <div>{fmtCompact(latest?.revenue)}</div>
                        {delta !== null ? <div style={{ fontSize: 11, marginTop: 3, color: deltaColor }}>{pctSigned(delta)}</div> : null}
                      </td>
                      <td className="tabular-nums" style={{ padding: "14px 16px", verticalAlign: "middle", textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: 13 }}>{fmtCompact(latest?.operatingProfit)}</td>
                      <td className="tabular-nums" style={{ padding: "14px 16px", verticalAlign: "middle", textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: 13 }}>{fmtCompact(latest?.equity)}</td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", textAlign: "center" }}>
                        <div style={{ display: "inline-flex" }}>
                          <Sparkline values={series} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", opacity: 0.75, margin: "14px 2px 0", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>drag_indicator</span>
            Dra en rad for å flytte den, eller slipp et selskap under en inndeling for å knytte det dit. Inndelinger lagres kun i denne nettleseren.
          </p>
        </>
      ) : null}

      {/* Due diligence */}
      {ddRooms.length > 0 ? (
        <section style={{ marginTop: 64 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, paddingBottom: 20, marginBottom: 20, borderBottom: "1px solid var(--px-text)", flexWrap: "wrap" }}>
            <div style={{ maxWidth: 640 }}>
              <h2 className="editorial-display" style={{ fontSize: 30, color: "var(--px-text)", margin: "0 0 8px", letterSpacing: "-0.03em" }}>Due diligence</h2>
              <p style={{ fontSize: 14, color: "var(--px-muted)", margin: 0, lineHeight: 1.5 }}>Selskaper med pågående eller avsluttet gjennomgang. Klikk på raden for å åpne rommet.</p>
            </div>
            <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
              <div style={{ border: "1px solid var(--px-warning-border)", background: "var(--px-warning-soft)", borderRadius: "var(--radius-md)", padding: "12px 16px", minWidth: 86 }}>
                <div className="data-label" style={{ fontSize: 10, color: "var(--px-warning)", marginBottom: 6 }}>ÅPNE</div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--px-warning)" }}>{ddOpenCount}</div>
              </div>
              <div style={{ border: "1px solid var(--px-success-border)", background: "var(--px-success-soft)", borderRadius: "var(--radius-md)", padding: "12px 16px", minWidth: 86 }}>
                <div className="data-label" style={{ fontSize: 10, color: "var(--px-success)", marginBottom: 6 }}>LUKKET</div>
                <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--px-success)" }}>{ddClosedCount}</div>
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto", borderTop: "1px solid var(--px-border-subtle)" }}>
            <table style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "rgba(248,249,250,0.62)", borderBottom: "1px solid var(--px-border-subtle)" }}>
                  {["Selskap", "Rom", "Startet", "Sist oppdatert", "Notat"].map((label, i) => (
                    <th key={label} className="data-label" style={{ textAlign: "left", padding: "13px 16px", fontSize: 11, fontWeight: 600, color: "var(--px-muted)", whiteSpace: "nowrap", ...(i === 0 ? { minWidth: 200 } : {}) }}>{label}</th>
                  ))}
                  <th className="data-label" style={{ textAlign: "right", padding: "13px 16px", fontSize: 11, fontWeight: 600, color: "var(--px-muted)", whiteSpace: "nowrap" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {ddRooms.map((room) => {
                  const open = room.status === "ACTIVE";
                  return (
                    <tr key={room.id} className="wl-row" onClick={() => router.push(`/dd/${room.id}`)} style={{ borderBottom: "1px solid rgba(15,23,42,0.06)", cursor: "pointer" }}>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: open ? "var(--px-warning)" : "var(--px-success)", flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 14.5, fontWeight: 500, color: "var(--px-text)", letterSpacing: "-0.01em", lineHeight: 1.25, whiteSpace: "nowrap" }}>{room.companyName}</div>
                            <div className="data-label tabular-nums" style={{ fontSize: 10, color: "var(--px-muted)", marginTop: 4, lineHeight: 1 }}>{room.orgNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", fontSize: 13, color: "var(--px-text)" }}>{room.name}</td>
                      <td className="tabular-nums" style={{ padding: "14px 16px", verticalAlign: "middle", fontSize: 13, color: "var(--px-muted)", fontFamily: "var(--font-mono), monospace" }}>{fmtDate(room.createdAt)}</td>
                      <td className="tabular-nums" style={{ padding: "14px 16px", verticalAlign: "middle", fontSize: 13, color: "var(--px-muted)", fontFamily: "var(--font-mono), monospace" }}>{fmtDate(room.lastActivityAt)}</td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", fontSize: 13, color: "var(--px-text)", maxWidth: 260 }}>{room.description ?? "—"}</td>
                      <td style={{ padding: "14px 16px", verticalAlign: "middle", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span className="data-label" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: open ? "var(--px-warning)" : "var(--px-success)", background: open ? "var(--px-warning-soft)" : "var(--px-success-soft)", border: `1px solid ${open ? "var(--px-warning-border)" : "var(--px-success-border)"}`, borderRadius: "var(--radius-full)", padding: "3px 9px" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{open ? "pending" : "check_circle"}</span>
                            {open ? "Åpen" : "Lukket"}
                          </span>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--px-muted)" }}>chevron_right</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* News feed */}
      <section style={{ marginTop: 64 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, paddingBottom: 20, marginBottom: 20, borderBottom: "1px solid var(--px-text)" }}>
          <div style={{ maxWidth: 640 }}>
            <p className="data-label" style={{ fontSize: 11, color: "var(--px-accent)", margin: "0 0 10px" }}>NYHETSSTRØM</p>
            <h2 className="editorial-display" style={{ fontSize: 30, color: "var(--px-text)", margin: "0 0 8px", letterSpacing: "-0.03em" }}>Siste nyheter</h2>
          </div>
        </div>
        {news.length === 0 ? (
          <div style={{ border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-lg)", padding: "40px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--px-muted)", margin: 0 }}>Ingen relevante hendelser registrert for de overvåkede selskapene ennå.</p>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
            {news.map((n) => {
              const source = newsSource(n);
              return (
                <a
                  key={n.id}
                  href={n.url}
                  target={n.external ? "_blank" : undefined}
                  rel={n.external ? "noopener noreferrer" : undefined}
                  className="wl-news"
                  style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", padding: "11px 20px", borderBottom: "1px solid var(--px-border-subtle)", color: "inherit" }}
                >
                  <span className="data-label" style={{ fontSize: 9, fontWeight: 700, color: "var(--px-accent)", flexShrink: 0, width: 96, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{source}</span>
                  <span className="data-label tabular-nums" style={{ fontSize: 9, color: "var(--px-muted)", flexShrink: 0, width: 74, whiteSpace: "nowrap" }}>{fmtDate(n.date)}</span>
                  <span className="data-label" style={{ fontSize: 9, color: "var(--px-muted)", background: "rgba(248,249,250,0.9)", border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-full)", padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>{n.category}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "var(--px-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</span>
                  <span className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", opacity: 0.8, flexShrink: 0, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{n.company}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--px-muted)", opacity: 0.55, flexShrink: 0 }}>north_east</span>
                  {n.summary ? (
                    <span className="wl-tip" style={{ position: "absolute", top: "calc(100% - 6px)", left: 20, right: 20, zIndex: 20, background: "var(--px-panel)", color: "#fff", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)", padding: "14px 16px", pointerEvents: "none" }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#fff", lineHeight: 1.35, marginBottom: 5 }}>{n.title}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: "rgba(255,255,255,0.72)", lineHeight: 1.5, marginBottom: 8 }}>{n.summary}</span>
                      <span className="data-label" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{source} · {n.company}</span>
                    </span>
                  ) : null}
                </a>
              );
            })}
          </div>
        )}
      </section>

      <footer style={{ borderTop: "1px solid var(--px-border)", marginTop: 56, paddingTop: 24, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="data-label" style={{ fontSize: 10, color: "var(--px-muted)" }}>Overvåkede selskaper: {companies.length}</span>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--px-success)", display: "inline-block" }} />
          <span className="data-label" style={{ fontSize: 10, color: "var(--px-muted)" }}>Aktive varsler: {alerts.length}</span>
        </div>
        <span className="data-label" style={{ fontSize: 10, color: "var(--px-muted)" }}>Kilde: Brønnøysundregistrene</span>
      </footer>

      {alertsOpen ? <AlertsModal alerts={alerts} onClose={() => setAlertsOpen(false)} /> : null}
      {selected ? <CompanyDrawer company={selected} news={news} onClose={() => setSelectedOrg(null)} onRemove={() => { removeCompany(selected.watchId); setSelectedOrg(null); }} /> : null}
      {addOpen ? (
        <AddCompanyModal
          workspaceId={workspaceId}
          watchedOrgNumbers={companies.map((c) => c.orgNumber)}
          onClose={() => setAddOpen(false)}
          onAdded={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Reconcile persisted arrangement with the current real company set.
 * ------------------------------------------------------------------ */

function reconcile(stored: Arrangement, companies: WatchlistCompany[]): Arrangement {
  const realOrgs = new Set(companies.map((c) => c.orgNumber));
  const result: Arrangement = [];
  const seen = new Set<string>();
  if (Array.isArray(stored)) {
    stored.forEach((e) => {
      if (!e || typeof e !== "object") return;
      if (e.kind === "header" && typeof e.id === "string") {
        result.push({ kind: "header", id: e.id, name: typeof e.name === "string" ? e.name : "Inndeling", collapsed: Boolean(e.collapsed) });
      } else if (e.kind === "company" && typeof e.org === "string" && realOrgs.has(e.org) && !seen.has(e.org)) {
        result.push({ kind: "company", org: e.org });
        seen.add(e.org);
      }
    });
  }
  companies.forEach((c) => {
    if (!seen.has(c.orgNumber)) {
      result.push({ kind: "company", org: c.orgNumber });
      seen.add(c.orgNumber);
    }
  });
  return result;
}

function newsSource(n: WatchlistNews): string {
  if (n.external) {
    try {
      const host = new URL(n.url).hostname.replace(/^www\./, "");
      const label = host.split(".")[0];
      return label.toUpperCase();
    } catch {
      /* fall through */
    }
  }
  return "FJORD INSIGHT";
}

/* ------------------------------------------------------------------ *
 * Alerts modal — real workspace notifications.
 * ------------------------------------------------------------------ */

const ALERT_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  COMPANY_STATUS_CHANGED: { icon: "cancel", color: "var(--px-error)", bg: "var(--px-error-soft)" },
  FINANCIAL_STATEMENT_NEW: { icon: "description", color: "var(--px-accent)", bg: "var(--px-accent-soft)" },
  ANNOUNCEMENT_NEW: { icon: "campaign", color: "var(--px-accent)", bg: "var(--px-accent-soft)" },
  DISTRESS_MATCH: { icon: "warning", color: "var(--px-warning)", bg: "var(--px-warning-soft)" },
  COMPANY_EVENT_NEW: { icon: "notifications", color: "var(--px-warning)", bg: "var(--px-warning-soft)" },
};

function AlertsModal({ alerts, onClose }: { alerts: WatchlistAlert[]; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "72px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "var(--px-surface-strong)", border: "1px solid var(--px-border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-md)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 24px", borderBottom: "1px solid var(--px-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--px-warning)" }}>notifications_active</span>
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--px-text)", margin: 0, letterSpacing: "-0.02em" }}>Varsler</h3>
              <p className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", margin: "3px 0 0" }}>{alerts.length === 1 ? "1 varsel" : `${alerts.length} varsler`}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} title="Lukk" style={{ border: "none", background: "none", cursor: "pointer", padding: 6, display: "inline-flex", color: "var(--px-muted)", borderRadius: "var(--radius-full)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        <div style={{ overflowY: "auto" }}>
          {alerts.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 34, color: "var(--px-muted)", opacity: 0.5 }}>notifications_off</span>
              <p style={{ fontSize: 14, color: "var(--px-muted)", margin: "12px 0 0" }}>Ingen registrerte varsler.</p>
            </div>
          ) : (
            alerts.map((al) => {
              const meta = ALERT_ICON[al.type] ?? { icon: "notifications", color: "var(--px-muted)", bg: "rgba(15,23,42,0.06)" };
              return (
                <div key={al.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "16px 24px", borderBottom: "1px solid var(--px-border-subtle)" }}>
                  <span style={{ width: 34, height: 34, borderRadius: "var(--radius-full)", background: meta.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 19, color: meta.color }}>{meta.icon}</span>
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--px-text)", letterSpacing: "-0.01em" }}>{al.companyName ?? al.title}</span>
                      <span className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", whiteSpace: "nowrap" }}>{fmtDate(al.createdAt)}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--px-muted)", margin: "4px 0 0", lineHeight: 1.45 }}>{al.body || al.title}</p>
                    {al.orgNumber ? <div className="data-label tabular-nums" style={{ fontSize: 10, color: "var(--px-muted)", opacity: 0.7, marginTop: 6 }}>{al.orgNumber}</div> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--px-border-subtle)", background: "rgba(248,249,250,0.62)", display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ border: "1px solid var(--px-border)", background: "var(--px-surface-strong)", borderRadius: "var(--radius-full)", padding: "8px 18px", fontSize: 13, fontWeight: 600, color: "var(--px-text)", cursor: "pointer", fontFamily: "var(--font-sans), sans-serif" }}>Lukk</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Company detail drawer — real financials + register info + events.
 * ------------------------------------------------------------------ */

function CompanyDrawer({ company, news, onClose, onRemove }: { company: WatchlistCompany; news: WatchlistNews[]; onClose: () => void; onRemove: () => void }) {
  const meta = STATUS_META[company.status];
  const statements = company.statements;
  const latest = statements.length ? statements[statements.length - 1] : null;
  const chartYears = statements.slice(-4);
  const revValues = chartYears.map((s) => s.revenue ?? 0);
  const maxRev = Math.max(...revValues, 1);
  const delta = revenueDelta(company);
  const deltaColor = delta === null ? "var(--px-muted)" : delta >= 0 ? "var(--px-success)" : "var(--px-error)";

  const withRevenue = statements.filter((s) => s.revenue !== null && s.revenue !== 0);
  const cagr =
    withRevenue.length >= 2
      ? Math.pow((withRevenue[withRevenue.length - 1].revenue as number) / (withRevenue[0].revenue as number), 1 / (withRevenue.length - 1)) - 1
      : null;
  const ratio = (num: number | null | undefined, den: number | null | undefined): number | null =>
    num === null || num === undefined || den === null || den === undefined || den === 0 ? null : num / den;
  const ebitMargin = ratio(latest?.operatingProfit, latest?.revenue);
  const nettoMargin = ratio(latest?.netIncome, latest?.revenue);
  const equityRatio = ratio(latest?.equity, latest?.assets);
  const roe = ratio(latest?.netIncome, latest?.equity ? Math.abs(latest.equity) : null);

  const last3 = statements.slice(-3);
  const yearCols = last3.map((s) => s.year);
  const stmtRow = (label: string, pick: (s: WatchlistStatement) => number | null) => ({
    label,
    values: last3.map((s) => pick(s)),
  });
  const plRows = [
    stmtRow("Driftsinntekter", (s) => s.revenue),
    stmtRow("EBIT (driftsresultat)", (s) => s.operatingProfit),
    stmtRow("Årsresultat", (s) => s.netIncome),
  ];
  const balRows = [
    stmtRow("Sum egenkapital", (s) => s.equity),
    stmtRow("Sum eiendeler", (s) => s.assets),
  ];

  const info = [
    { icon: "corporate_fare", label: "Organisasjonsform", value: company.legalForm ?? "—" },
    { icon: "category", label: "Bransje (NACE)", value: company.industry ?? "—" },
    { icon: "calendar_month", label: "Stiftet", value: company.foundedAt ? String(new Date(company.foundedAt).getFullYear()) : "—" },
    { icon: "group", label: "Ansatte", value: company.employeeCount !== null ? nbNum.format(company.employeeCount) : "—" },
    { icon: "language", label: "Nettsted", value: company.website ?? "—" },
  ];

  const companyEvents = news.filter((n) => n.orgNumber === company.orgNumber);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.45)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", height: "100%", background: "var(--px-bg)", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: "var(--px-panel)", color: "#fff", padding: "24px 28px 22px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
            <span className="data-label" style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>SELSKAPSPROFIL</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button type="button" onClick={onRemove} title="Fjern fra liste" style={{ border: "none", background: "none", cursor: "pointer", padding: 4, display: "inline-flex", color: "var(--px-watch)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>star</span>
              </button>
              <button type="button" onClick={onClose} title="Lukk" style={{ border: "none", background: "none", cursor: "pointer", padding: 4, display: "inline-flex", color: "rgba(255,255,255,0.7)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
          </div>
          <h2 className="editorial-display" style={{ fontSize: 27, color: "#fff", margin: "0 0 10px", letterSpacing: "-0.03em" }}>{company.name}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: company.status === "ACTIVE" ? "#34d399" : company.status === "BANKRUPT" ? "#f87171" : "rgba(255,255,255,0.6)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: company.status === "ACTIVE" ? "#34d399" : company.status === "BANKRUPT" ? "#f87171" : "rgba(255,255,255,0.6)" }} />
              {meta.label}
            </span>
            <span className="data-label tabular-nums" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Org.nr {company.orgNumber}</span>
            {company.legalForm ? <span className="data-label" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{company.legalForm}</span> : null}
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: 28 }}>
          {chartYears.length >= 1 && chartYears.some((s) => s.revenue !== null) ? (
            <div style={{ border: "1px solid var(--px-border-subtle)", background: "var(--px-surface-strong)", borderRadius: "var(--radius-lg)", padding: "18px 20px 16px", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
                <div>
                  <div className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", marginBottom: 8 }}>OMSETNING PER ÅR · MNOK</div>
                  <div className="tabular-nums" style={{ fontSize: 25, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--px-text)" }}>{fmtMnok(latest?.revenue)}</div>
                  {delta !== null ? <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4, color: deltaColor }}>{pctSigned(delta)} mot fjoråret</div> : null}
                </div>
                {cagr !== null ? (
                  <div style={{ textAlign: "right" }}>
                    <div className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", marginBottom: 6 }}>CAGR</div>
                    <div className="tabular-nums" style={{ fontSize: 19, fontWeight: 600, color: cagr >= 0 ? "var(--px-success)" : "var(--px-error)" }}>{pctSigned(cagr)}</div>
                  </div>
                ) : null}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 132, borderBottom: "1px solid var(--px-border-subtle)" }}>
                {chartYears.map((s, i) => {
                  const v = s.revenue ?? 0;
                  const h = Math.max(4, Math.round((v / maxRev) * 120));
                  const isLast = i === chartYears.length - 1;
                  return (
                    <div key={s.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 6 }}>
                      <span className="data-label tabular-nums" style={{ fontSize: 9, color: "var(--px-muted)" }}>{s.revenue !== null ? fmtCompact(s.revenue) : "—"}</span>
                      <div style={{ width: "100%", maxWidth: 48, height: h, background: isLast ? "var(--px-accent)" : "rgba(0,102,138,0.28)", borderRadius: "var(--radius-sm) var(--radius-sm) 0 0" }} />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                {chartYears.map((s, i) => (
                  <span key={s.year} className="data-label tabular-nums" style={{ flex: 1, textAlign: "center", fontSize: 10, color: i === chartYears.length - 1 ? "var(--px-text)" : "var(--px-muted)" }}>{s.year}</span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ border: "1px solid var(--px-border-subtle)", background: "var(--px-surface-strong)", borderRadius: "var(--radius-lg)", padding: "24px 20px", marginBottom: 24, textAlign: "center" }}>
              <p style={{ fontSize: 13.5, color: "var(--px-muted)", margin: 0 }}>Ingen publiserte regnskapstall tilgjengelig for dette selskapet ennå.</p>
            </div>
          )}

          {latest ? (
            <>
              <div className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", marginBottom: 12 }}>NØKKELTALL · VEKST OG LØNNSOMHET</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
                <MetricTile label="Inntektsvekst (CAGR)" value={pctSigned(cagr)} />
                <MetricTile label="EBIT-margin" value={pctSigned(ebitMargin)} />
                <MetricTile label="Nettomargin" value={pctSigned(nettoMargin)} />
                <MetricTile label="Egenkapitalandel" value={pctSigned(equityRatio)} />
                <MetricTile label="Egenkapitalavkastning" value={pctSigned(roe)} />
              </div>

              <div className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", marginBottom: 12 }}>RESULTAT OG BALANSE · SISTE ÅR (MNOK)</div>
              <div style={{ border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 28 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "rgba(248,249,250,0.62)", borderBottom: "1px solid var(--px-border-subtle)" }}>
                      <th className="data-label" style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 600, color: "var(--px-muted)" }}>Post</th>
                      {yearCols.map((y, i) => (
                        <th key={y} className="data-label tabular-nums" style={{ textAlign: "right", padding: "10px 14px", fontSize: 10, fontWeight: 600, color: i === yearCols.length - 1 ? "var(--px-text)" : "var(--px-muted)" }}>{y}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: "var(--px-subtle)" }}><td colSpan={yearCols.length + 1} className="data-label" style={{ padding: "8px 14px", fontSize: 9, fontWeight: 700, color: "var(--px-muted)" }}>RESULTAT</td></tr>
                    {plRows.map((r) => (
                      <tr key={r.label} style={{ borderBottom: "1px solid var(--px-border-subtle)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--px-text)" }}>{r.label}</td>
                        {r.values.map((v, i) => (
                          <td key={i} className="tabular-nums" style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--font-mono), monospace", fontWeight: i === r.values.length - 1 ? 600 : 400, color: i === r.values.length - 1 ? "var(--px-text)" : "var(--px-muted)" }}>{fmtMnok(v)}</td>
                        ))}
                      </tr>
                    ))}
                    <tr style={{ background: "var(--px-subtle)" }}><td colSpan={yearCols.length + 1} className="data-label" style={{ padding: "8px 14px", fontSize: 9, fontWeight: 700, color: "var(--px-muted)" }}>BALANSE</td></tr>
                    {balRows.map((r) => (
                      <tr key={r.label} style={{ borderBottom: "1px solid var(--px-border-subtle)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--px-text)" }}>{r.label}</td>
                        {r.values.map((v, i) => (
                          <td key={i} className="tabular-nums" style={{ padding: "10px 14px", textAlign: "right", fontFamily: "var(--font-mono), monospace", fontWeight: i === r.values.length - 1 ? 600 : 400, color: i === r.values.length - 1 ? "var(--px-text)" : "var(--px-muted)" }}>{fmtMnok(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          <div className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", marginBottom: 12 }}>NØKKELINFO</div>
          <div style={{ border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 28 }}>
            {info.map((f, i) => (
              <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 16px", borderBottom: i === info.length - 1 ? "none" : "1px solid var(--px-border-subtle)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--px-muted)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 17, color: "var(--px-muted)", opacity: 0.7 }}>{f.icon}</span>{f.label}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--px-text)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300, whiteSpace: "nowrap" }}>{f.value}</span>
              </div>
            ))}
          </div>

          <div className="data-label" style={{ fontSize: 10, color: "var(--px-muted)", marginBottom: 12 }}>SISTE HENDELSER</div>
          {companyEvents.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--px-muted)", margin: 0 }}>Ingen registrerte hendelser for dette selskapet.</p>
          ) : (
            <div style={{ border: "1px solid var(--px-border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
              {companyEvents.slice(0, 6).map((n) => (
                <a key={n.id} href={n.url} target={n.external ? "_blank" : undefined} rel={n.external ? "noopener noreferrer" : undefined} style={{ display: "block", textDecoration: "none", padding: "12px 16px", borderBottom: "1px solid var(--px-border-subtle)", color: "inherit" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span className="data-label" style={{ fontSize: 9, fontWeight: 700, color: "var(--px-accent)" }}>{n.category}</span>
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--px-muted)", opacity: 0.5 }} />
                    <span className="data-label" style={{ fontSize: 9, color: "var(--px-muted)" }}>{fmtDate(n.date)}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 13, color: "var(--px-muted)", opacity: 0.6, marginLeft: "auto" }}>north_east</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: "var(--px-text)", lineHeight: 1.35 }}>{n.title}</div>
                </a>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 28px", borderTop: "1px solid var(--px-border-subtle)", background: "var(--px-surface-strong)", display: "flex", gap: 10 }}>
          <a href={`/companies/${company.slug}`} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--px-action)", color: "#fff", borderRadius: "var(--radius-full)", padding: "11px 18px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>Åpne full selskapsprofil
          </a>
          <button type="button" onClick={onClose} style={{ border: "1px solid var(--px-border)", background: "var(--px-surface-strong)", borderRadius: "var(--radius-full)", padding: "11px 20px", fontSize: 14, fontWeight: 600, color: "var(--px-text)", cursor: "pointer", fontFamily: "var(--font-sans), sans-serif" }}>Lukk</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Add-company modal — live typeahead against the real company search
 * API, persisting via the real addToWatchlistAction.
 * ------------------------------------------------------------------ */

type Suggestion = { orgNumber: string; name: string; municipality: string | null };

function AddCompanyModal({
  workspaceId,
  watchedOrgNumbers,
  onClose,
  onAdded,
}: {
  workspaceId: string;
  watchedOrgNumbers: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [addedNow, setAddedNow] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/companies/search?mode=typeahead&query=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search failed");
        const payload = (await response.json()) as {
          data: Array<{ company: { orgNumber: string; name: string; municipality?: string | null } }>;
        };
        setSuggestions(
          payload.data.slice(0, 8).map((r) => ({ orgNumber: r.company.orgNumber, name: r.company.name, municipality: r.company.municipality ?? null })),
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [query]);

  const watched = new Set(watchedOrgNumbers);

  function handleAdd(s: Suggestion) {
    if (adding || watched.has(s.orgNumber) || addedNow.has(s.orgNumber)) return;
    setError(null);
    setAdding(s.orgNumber);
    startTransition(async () => {
      const form = new FormData();
      form.set("orgNumber", s.orgNumber);
      form.set("workspaceId", workspaceId);
      const result = await addToWatchlistAction(form);
      setAdding(null);
      if (!result.ok) {
        setError(result.message ?? "Kunne ikke legge til selskapet.");
        return;
      }
      setAddedNow((prev) => new Set(prev).add(s.orgNumber));
      onAdded();
    });
  }

  const showEmpty = query.trim().length >= 2 && !loading && suggestions.length === 0;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 96, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "64px 24px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 600, background: "var(--px-surface-strong)", border: "1px solid var(--px-border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-md)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "82vh" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--px-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--px-accent)" }}>person_search</span>
              <h3 style={{ fontSize: 17, fontWeight: 600, color: "var(--px-text)", margin: 0, letterSpacing: "-0.02em" }}>Legg til selskap</h3>
            </div>
            <button type="button" onClick={onClose} title="Lukk" style={{ border: "none", background: "none", cursor: "pointer", padding: 6, display: "inline-flex", color: "var(--px-muted)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <span className="material-symbols-outlined" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 18, color: "var(--px-muted)" }}>search</span>
            <input
              ref={inputRef}
              className="wl-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søk på selskap, org.nr eller bransje…"
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--px-border)", background: "var(--px-bg)", borderRadius: "var(--radius-md)", padding: "11px 12px 11px 38px", fontSize: 14, fontFamily: "var(--font-sans), sans-serif", color: "var(--px-text)", outline: "none" }}
            />
          </div>
          {error ? <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--px-error)" }}>{error}</p> : null}
        </div>
        <div style={{ overflowY: "auto" }}>
          {query.trim().length < 2 ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "var(--px-muted)", margin: 0 }}>Skriv minst to tegn for å søke i selskapsregisteret.</p>
            </div>
          ) : loading && suggestions.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "var(--px-muted)", margin: 0 }}>Søker…</p>
            </div>
          ) : showEmpty ? (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 34, color: "var(--px-muted)", opacity: 0.5 }}>search_off</span>
              <p style={{ fontSize: 14, color: "var(--px-muted)", margin: "12px 0 0" }}>Ingen treff. Prøv et annet navn eller org.nr.</p>
            </div>
          ) : (
            suggestions.map((s) => {
              const isWatched = watched.has(s.orgNumber) || addedNow.has(s.orgNumber);
              const isAdding = adding === s.orgNumber;
              return (
                <div key={s.orgNumber} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 24px", borderBottom: "1px solid var(--px-border-subtle)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 500, color: "var(--px-text)", letterSpacing: "-0.01em" }}>{s.name}</div>
                    <div className="data-label tabular-nums" style={{ fontSize: 10, color: "var(--px-muted)", marginTop: 4 }}>{s.orgNumber}{s.municipality ? ` · ${s.municipality}` : ""}</div>
                  </div>
                  {isWatched ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-mono), monospace", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--px-success)", flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 17 }}>check_circle</span>Lagt til
                    </span>
                  ) : (
                    <button type="button" disabled={isAdding} onClick={() => handleAdd(s)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--px-accent)", background: "var(--px-accent-soft)", color: "var(--px-accent)", borderRadius: "var(--radius-full)", padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: isAdding ? "default" : "pointer", fontFamily: "var(--font-sans), sans-serif", flexShrink: 0, opacity: isAdding ? 0.6 : 1 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>{isAdding ? "Legger til…" : "Legg til"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
