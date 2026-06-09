"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { relationshipLabel, type OwnershipRelationship } from "@/server/ownership/ownership-thresholds";
import type { GroupNode, GroupStructure } from "@/server/ownership/types";

import { buildChildrenMap, computeDefaultCollapsed } from "./ownership-graph-layout";

function formatPercent(value: number | null) {
  if (value === null) return null;
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} %`;
}

function relationshipBadge(relationship: OwnershipRelationship | null, isRoot: boolean) {
  if (isRoot && !relationship) {
    return { label: "Konsernspiss", className: "border-[#192536] bg-[#192536] text-white" };
  }
  if (relationship === "ASSOCIATED") {
    return { label: "Tilknyttet", className: "border-[#E6D9C7] bg-[#FCF7EF] text-[#704E23]" };
  }
  if (relationship === "SUBSIDIARY") {
    return { label: "Datter", className: "border-[#D4E2F4] bg-[#F5F9FF] text-[#173B71]" };
  }
  return { label: "Selskap", className: "border-[rgba(15,23,42,0.1)] bg-slate-50 text-slate-600" };
}

function TreeRow({
  node,
  childrenMap,
  collapsed,
  toggle,
  currentOrgNumber,
}: {
  node: GroupNode;
  childrenMap: Map<string, GroupNode[]>;
  collapsed: Set<string>;
  toggle: (org: string) => void;
  currentOrgNumber: string;
}) {
  const children = childrenMap.get(node.orgNumber) ?? [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(node.orgNumber);
  const isCurrent = node.orgNumber === currentOrgNumber;
  const badge = relationshipBadge(node.relationshipToParent, node.parentOrgNumber === null);
  const percent = formatPercent(node.ownershipPercent);

  return (
    <div>
      <div
        className={`flex items-center gap-2 rounded-lg py-1.5 pr-3 ${
          isCurrent ? "bg-[var(--px-accent-soft)] ring-1 ring-[var(--px-accent)]" : "hover:bg-[rgba(15,23,42,0.03)]"
        }`}
        style={{ paddingLeft: `${node.depth * 22 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(node.orgNumber)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-[rgba(15,23,42,0.06)]"
            aria-label={isCollapsed ? "Vis datterselskaper" : "Skjul datterselskaper"}
          >
            <span className="material-symbols-outlined !text-[18px]">
              {isCollapsed ? "chevron_right" : "expand_more"}
            </span>
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}

        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.className}`}
        >
          {badge.label}
        </span>

        <Link
          href={`/companies/${node.orgNumber}?tab=eierskap`}
          className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 hover:text-[var(--px-accent)] hover:underline"
        >
          {node.name}
        </Link>

        <span className="data-label hidden shrink-0 text-[10px] tabular-nums text-slate-400 sm:inline">
          {node.orgNumber}
        </span>

        {hasChildren ? (
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{node.childCount}</span>
        ) : null}

        {percent ? (
          <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
            {percent}
          </span>
        ) : (
          <span className="w-16 shrink-0" />
        )}
      </div>

      {hasChildren && !isCollapsed ? (
        <div>
          {children.map((child) => (
            <TreeRow
              key={child.orgNumber}
              node={child}
              childrenMap={childrenMap}
              collapsed={collapsed}
              toggle={toggle}
              currentOrgNumber={currentOrgNumber}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OwnershipTree({ group }: { group: GroupStructure }) {
  const childrenMap = useMemo(() => buildChildrenMap(group.nodes), [group.nodes]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    computeDefaultCollapsed(group.nodes, group.currentOrgNumber),
  );

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
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-2">
      <div className="flex items-center justify-end gap-2 px-2 py-1">
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
      />
    </div>
  );
}
