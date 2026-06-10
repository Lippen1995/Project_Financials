"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { GroupNode, GroupStructure } from "@/server/ownership/types";

import { buildChildrenMap } from "./ownership-graph-layout";

function formatPercent(value: number | null) {
  if (value === null) return "";
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} %`;
}

/** Short red marker for companies that are no longer active (null when active/unknown). */
function inactiveLabel(status: GroupNode["status"]): string | null {
  if (status === "BANKRUPT") return "KONKURS";
  if (status === "DISSOLVED") return "SLETTET";
  return null;
}

/** Ancestors of the current company (including itself) — these sit on the highlighted spine. */
function pathToCurrent(nodes: GroupNode[], currentOrgNumber: string): Set<string> {
  const byOrg = new Map(nodes.map((node) => [node.orgNumber, node]));
  const path = new Set<string>();
  let cursor = byOrg.get(currentOrgNumber);
  while (cursor) {
    path.add(cursor.orgNumber);
    cursor = cursor.parentOrgNumber ? byOrg.get(cursor.parentOrgNumber) : undefined;
  }
  return path;
}

function NorwayFlag() {
  // Inline SVG — Windows has no flag-emoji font, so 🇳🇴 would render as "NO".
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 22 16"
      className="inline-block shrink-0 rounded-[1px] ring-1 ring-black/5"
      aria-label="Norge"
      role="img"
    >
      <rect width="22" height="16" fill="#ef2b2d" />
      <rect x="6" width="4" height="16" fill="#fff" />
      <rect y="6" width="22" height="4" fill="#fff" />
      <rect x="7" width="2" height="16" fill="#002868" />
      <rect y="7" width="22" height="2" fill="#002868" />
    </svg>
  );
}

function NodeDot({ onPath, current }: { onPath: boolean; current: boolean }) {
  if (current) {
    return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--px-accent)]" />;
  }
  if (onPath) {
    return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--px-accent)]" />;
  }
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300 bg-slate-200" />;
}

function TreeRow({
  node,
  childrenMap,
  collapsed,
  toggle,
  currentOrgNumber,
  path,
}: {
  node: GroupNode;
  childrenMap: Map<string, GroupNode[]>;
  collapsed: Set<string>;
  toggle: (org: string) => void;
  currentOrgNumber: string;
  path: Set<string>;
}) {
  const children = childrenMap.get(node.orgNumber) ?? [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(node.orgNumber);
  const isCurrent = node.orgNumber === currentOrgNumber;
  const onPath = path.has(node.orgNumber);
  const percent = formatPercent(node.ownershipPercent);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 py-[3px]">
        <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">
          {percent}
        </span>

        <button
          type="button"
          onClick={() => hasChildren && toggle(node.orgNumber)}
          className={`flex shrink-0 items-center justify-center ${hasChildren ? "cursor-pointer" : "cursor-default"}`}
          aria-label={hasChildren ? (isCollapsed ? "Vis datterselskaper" : "Skjul datterselskaper") : undefined}
        >
          <NodeDot onPath={onPath} current={isCurrent} />
        </button>

        {isCurrent ? (
          <span className="rounded-md bg-[var(--px-accent)] px-2.5 py-1 text-[13px] font-semibold text-white">
            {node.name}
          </span>
        ) : (
          <Link
            href={`/companies/${node.orgNumber}?tab=eierskap`}
            className={`text-[13px] hover:underline ${
              onPath ? "font-semibold text-[var(--px-accent)]" : "font-medium text-[var(--px-accent)]"
            }`}
          >
            {node.name}
          </Link>
        )}

        <NorwayFlag />

        {inactiveLabel(node.status) ? (
          <span className="text-[11px] font-semibold text-red-600">
            ({inactiveLabel(node.status)})
          </span>
        ) : null}

        {hasChildren && isCollapsed ? (
          <span className="text-[11px] tabular-nums text-slate-400">({node.childCount})</span>
        ) : null}
      </div>

      {hasChildren && !isCollapsed ? (
        <div className="ml-[27px] border-l border-dotted border-slate-300">
          {children.map((child) => (
            <div key={child.orgNumber} className="relative pl-5">
              <span className="absolute left-0 top-[15px] w-4 border-t border-dotted border-slate-300" />
              <TreeRow
                node={child}
                childrenMap={childrenMap}
                collapsed={collapsed}
                toggle={toggle}
                currentOrgNumber={currentOrgNumber}
                path={path}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OwnershipTree({ group }: { group: GroupStructure }) {
  const childrenMap = useMemo(() => buildChildrenMap(group.nodes), [group.nodes]);
  const path = useMemo(
    () => pathToCurrent(group.nodes, group.currentOrgNumber),
    [group.nodes, group.currentOrgNumber],
  );
  // Default: fully expanded — the compact indented tree shows the whole konsern at once.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (org: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(org)) next.delete(org);
      else next.add(org);
      return next;
    });

  const root =
    group.nodes.find((node) => node.orgNumber === group.rootOrgNumber) ??
    group.nodes.find((node) => node.parentOrgNumber === null) ??
    group.nodes[0];

  if (!root) return null;

  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-4">
      <div className="mb-1 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          className="text-[11px] font-semibold text-[var(--px-accent)] hover:underline"
        >
          Utvid alle
        </button>
        <span className="text-slate-300">·</span>
        <button
          type="button"
          onClick={() =>
            setCollapsed(
              new Set(group.nodes.filter((n) => n.depth >= 1 && n.childCount > 0).map((n) => n.orgNumber)),
            )
          }
          className="text-[11px] font-semibold text-[var(--px-accent)] hover:underline"
        >
          Skjul alle
        </button>
      </div>
      <TreeRow
        node={root}
        childrenMap={childrenMap}
        collapsed={collapsed}
        toggle={toggle}
        currentOrgNumber={group.currentOrgNumber}
        path={path}
      />
    </div>
  );
}
