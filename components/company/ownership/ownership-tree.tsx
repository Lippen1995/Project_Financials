"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

import { relationshipLabel } from "@/server/ownership/ownership-thresholds";
import type { GroupNode, GroupStructure } from "@/server/ownership/types";

import { buildChildrenMap } from "./ownership-graph-layout";

const percentFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 });

function formatPercent(value: number | null) {
  if (value === null) return "";
  return `${percentFormat.format(value)} %`;
}

function statusLabel(status: GroupNode["status"]): string | null {
  if (status === "BANKRUPT") return "Konkurs";
  if (status === "DISSOLVED") return "Oppløst";
  return null;
}

function statusClass(status: GroupNode["status"]) {
  if (status === "BANKRUPT" || status === "DISSOLVED") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-[var(--px-border)] bg-[var(--px-subtle)] text-[var(--px-muted)]";
}

function countryFlag(countryCode?: string | null) {
  if (!countryCode || countryCode === "NO") return "🇳🇴";
  return countryCode;
}

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

function TreeRow({
  node,
  childrenMap,
  collapsed,
  toggle,
  currentOrgNumber,
  selectedOrgNumber,
  path,
  onSelectNode,
}: {
  node: GroupNode;
  childrenMap: Map<string, GroupNode[]>;
  collapsed: Set<string>;
  toggle: (org: string) => void;
  currentOrgNumber: string;
  selectedOrgNumber: string | null;
  path: Set<string>;
  onSelectNode: (orgNumber: string) => void;
}) {
  const children = childrenMap.get(node.orgNumber) ?? [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(node.orgNumber);
  const isCurrent = node.orgNumber === currentOrgNumber;
  const isSelected = node.orgNumber === selectedOrgNumber;
  const onPath = path.has(node.orgNumber);
  const inactive = statusLabel(node.status);
  const relationship =
    node.relationshipToParent === null ? "Konsernspiss" : relationshipLabel(node.relationshipToParent);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectNode(node.orgNumber)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectNode(node.orgNumber);
          }
        }}
        className={`group grid cursor-pointer grid-cols-[2.75rem_3.75rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-[rgba(15,23,42,0.06)] px-2 py-2 text-sm outline-none transition-colors hover:bg-[var(--px-subtle)] ${
          isSelected ? "bg-[var(--px-accent-soft)]" : ""
        }`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) toggle(node.orgNumber);
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-[var(--px-muted)] transition-colors ${
            hasChildren ? "hover:bg-[var(--px-surface)] hover:text-[var(--px-text)]" : "cursor-default"
          }`}
          aria-label={hasChildren ? (isCollapsed ? "Vis underliggende selskaper" : "Skjul underliggende selskaper") : undefined}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )
          ) : null}
        </button>

        <span className="text-right text-xs font-semibold tabular-nums text-[var(--px-muted)]">
          {formatPercent(node.ownershipPercent)}
        </span>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={`truncate font-semibold ${
                isCurrent
                  ? "rounded-full bg-[var(--px-action)] px-2 py-0.5 text-white"
                  : onPath
                    ? "text-[var(--px-accent)]"
                    : "text-[var(--px-text)]"
              }`}
            >
              {node.name}
            </span>
            <span className="text-xs" aria-label="Land">
              {countryFlag("NO")}
            </span>
            <span className="data-label text-[10px] font-semibold uppercase text-[var(--px-muted)]">
              {relationship}
            </span>
            {inactive ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(
                  node.status,
                )}`}
              >
                {inactive}
              </span>
            ) : null}
            {isCurrent ? (
              <span className="rounded-full border border-[var(--px-accent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--px-accent)]">
                Søkt selskap
              </span>
            ) : null}
          </div>
          <div className="mt-1 hidden text-xs text-[var(--px-muted)] group-hover:block">
            Org.nr. {node.orgNumber} · {node.childCount} direkte underliggende · Regnskap/ansatte vises
            når tilgjengelig i normalisert strukturdata
          </div>
        </div>

        <Link
          href={`/companies/${node.orgNumber}?tab=konsern`}
          onClick={(event) => event.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--px-muted)] opacity-0 transition-opacity hover:bg-[var(--px-surface)] hover:text-[var(--px-text)] group-hover:opacity-100 focus:opacity-100"
          aria-label={`Åpne ${node.name}`}
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      {hasChildren && !isCollapsed ? (
        <div className="ml-7 border-l border-dotted border-[var(--px-border)]">
          {children.map((child) => (
            <div key={child.orgNumber} className="pl-4">
              <TreeRow
                node={child}
                childrenMap={childrenMap}
                collapsed={collapsed}
                toggle={toggle}
                currentOrgNumber={currentOrgNumber}
                selectedOrgNumber={selectedOrgNumber}
                path={path}
                onSelectNode={onSelectNode}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OwnershipTree({
  group,
  selectedOrgNumber,
  onSelectNode,
}: {
  group: GroupStructure;
  selectedOrgNumber: string | null;
  onSelectNode: (orgNumber: string) => void;
}) {
  const childrenMap = useMemo(() => buildChildrenMap(group.nodes), [group.nodes]);
  const path = useMemo(
    () => pathToCurrent(group.nodes, group.currentOrgNumber),
    [group.nodes, group.currentOrgNumber],
  );
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
    <div>
      <div className="mb-2 flex items-center justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={() => setCollapsed(new Set())}
          className="font-semibold text-[var(--px-accent)] hover:underline"
        >
          Utvid alle
        </button>
        <span className="text-[var(--px-muted)]">·</span>
        <button
          type="button"
          onClick={() =>
            setCollapsed(
              new Set(group.nodes.filter((node) => node.depth >= 1 && node.childCount > 0).map((node) => node.orgNumber)),
            )
          }
          className="font-semibold text-[var(--px-accent)] hover:underline"
        >
          Skjul alle
        </button>
      </div>
      <div className="border-t border-[var(--px-border)]">
        <TreeRow
          node={root}
          childrenMap={childrenMap}
          collapsed={collapsed}
          toggle={toggle}
          currentOrgNumber={group.currentOrgNumber}
          selectedOrgNumber={selectedOrgNumber}
          path={path}
          onSelectNode={onSelectNode}
        />
      </div>
    </div>
  );
}
