"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { relationshipLabel, type OwnershipRelationship } from "@/server/ownership/ownership-thresholds";
import type { GroupStructure } from "@/server/ownership/types";

import {
  buildRenderTree,
  computeDefaultCollapsed,
  NODE_HEIGHT,
  NODE_WIDTH,
} from "./ownership-graph-layout";

type CompanyNodeData = {
  name: string;
  orgNumber: string;
  ownershipPercent: number | null;
  relationship: OwnershipRelationship | null;
  isCurrent: boolean;
  isRoot: boolean;
  childCount: number;
  collapsed: boolean;
  onToggle: (orgNumber: string) => void;
};

type OverflowNodeData = {
  parentOrgNumber: string;
  hiddenChildCount: number;
  onExpand: (parentOrgNumber: string) => void;
};

function formatPercent(value: number | null) {
  if (value === null) return null;
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(value)} %`;
}

function CompanyNodeView({ data }: NodeProps<Node<CompanyNodeData>>) {
  const percent = formatPercent(data.ownershipPercent);

  const tone = data.isCurrent
    ? "border-[var(--px-accent)] bg-[var(--px-accent)] text-white ring-2 ring-[var(--px-accent)] ring-offset-2"
    : data.isRoot
      ? "border-[#192536] bg-[#192536] text-white"
      : data.relationship === "ASSOCIATED"
        ? "border-l-4 border-l-[#C9A86A] border-y border-r border-[rgba(15,23,42,0.1)] bg-white text-slate-900"
        : "border-l-4 border-l-[var(--px-accent)] border-y border-r border-[rgba(15,23,42,0.1)] bg-white text-slate-900";

  const subtle = data.isCurrent || data.isRoot ? "text-white/70" : "text-slate-500";

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl px-3.5 py-2.5 shadow-[0_4px_14px_rgba(15,23,42,0.06)] ${tone}`}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-400" />

      <div className="flex items-start justify-between gap-2">
        <span
          className={`data-label text-[9px] font-semibold uppercase ${subtle}`}
        >
          {data.isRoot && !data.relationship
            ? "Konsernspiss"
            : data.relationship
              ? relationshipLabel(data.relationship)
              : "Selskap"}
        </span>
        {percent ? (
          <span className="shrink-0 text-[12px] font-semibold tabular-nums">{percent}</span>
        ) : null}
      </div>

      <Link
        href={`/companies/${data.orgNumber}?tab=eierskap`}
        className="line-clamp-2 text-[13px] font-semibold leading-tight hover:underline"
      >
        {data.name}
      </Link>

      <div className="flex items-center justify-between gap-2">
        <span className={`data-label text-[10px] tabular-nums ${subtle}`}>
          {data.orgNumber}
        </span>
        {data.childCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              data.onToggle(data.orgNumber);
            }}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              data.isCurrent || data.isRoot
                ? "bg-white/15 text-white hover:bg-white/25"
                : "bg-[var(--px-accent-soft)] text-[var(--px-accent)] hover:bg-[rgba(0,102,138,0.16)]"
            }`}
            aria-label={data.collapsed ? "Vis datterselskaper" : "Skjul datterselskaper"}
          >
            <span className="material-symbols-outlined !text-[14px]">
              {data.collapsed ? "add" : "remove"}
            </span>
            {data.childCount}
          </button>
        ) : null}
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-slate-400" />
    </div>
  );
}

function OverflowNodeView({ data }: NodeProps<Node<OverflowNodeData>>) {
  return (
    <button
      type="button"
      onClick={() => data.onExpand(data.parentOrgNumber)}
      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--px-accent)] bg-[var(--px-accent-soft)] text-[var(--px-accent)] transition-colors hover:bg-[rgba(0,102,138,0.14)]"
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-slate-400" />
      <span className="material-symbols-outlined !text-[20px]">more_horiz</span>
      <span className="text-[12px] font-semibold">+{data.hiddenChildCount} flere</span>
      <span className="data-label text-[9px] uppercase">Vis alle</span>
    </button>
  );
}

const nodeTypes = { company: CompanyNodeView, overflow: OverflowNodeView };

const LEGEND = [
  { label: "Konsernspiss", className: "bg-[#192536]" },
  { label: "Dette selskapet", className: "bg-[var(--px-accent)]" },
  { label: "Datterselskap", className: "bg-white border-l-4 border-l-[var(--px-accent)] border border-[rgba(15,23,42,0.15)]" },
  { label: "Tilknyttet", className: "bg-white border-l-4 border-l-[#C9A86A] border border-[rgba(15,23,42,0.15)]" },
];

export function OwnershipChart({ group }: { group: GroupStructure }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    computeDefaultCollapsed(group.nodes, group.currentOrgNumber),
  );
  const [expandedOverflow, setExpandedOverflow] = useState<Set<string>>(new Set());

  const toggleNode = useCallback((orgNumber: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(orgNumber)) next.delete(orgNumber);
      else next.add(orgNumber);
      return next;
    });
  }, []);

  const expandOverflow = useCallback((parentOrgNumber: string) => {
    setExpandedOverflow((prev) => new Set(prev).add(parentOrgNumber));
  }, []);

  const expandAll = useCallback(() => {
    setCollapsed(new Set());
    setExpandedOverflow(new Set(group.nodes.map((node) => node.orgNumber)));
  }, [group.nodes]);

  const collapseAll = useCallback(() => {
    // Collapse everything except the root so its direct children remain visible.
    setCollapsed(new Set(group.nodes.filter((n) => n.depth >= 1 && n.childCount > 0).map((n) => n.orgNumber)));
    setExpandedOverflow(new Set());
  }, [group.nodes]);

  const { rfNodes, rfEdges } = useMemo(() => {
    const tree = buildRenderTree(group.nodes, {
      collapsed,
      expandedOverflow,
      currentOrgNumber: group.currentOrgNumber,
      rootOrgNumber: group.rootOrgNumber,
    });

    const rfNodes: Node[] = tree.nodes.map((node) =>
      node.kind === "company"
        ? {
            id: node.id,
            type: "company",
            position: { x: node.x, y: node.y },
            draggable: false,
            data: {
              name: node.name,
              orgNumber: node.orgNumber as string,
              ownershipPercent: node.ownershipPercent,
              relationship: node.relationship,
              isCurrent: node.isCurrent,
              isRoot: node.isRoot,
              childCount: node.childCount,
              collapsed: node.collapsed,
              onToggle: toggleNode,
            } satisfies CompanyNodeData,
          }
        : {
            id: node.id,
            type: "overflow",
            position: { x: node.x, y: node.y },
            draggable: false,
            data: {
              parentOrgNumber: node.parentOrgNumber as string,
              hiddenChildCount: node.hiddenChildCount,
              onExpand: expandOverflow,
            } satisfies OverflowNodeData,
          },
    );

    const rfEdges: Edge[] = tree.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      style: {
        stroke: edge.relationship === "ASSOCIATED" ? "#C9A86A" : "#9DB6D6",
        strokeWidth: 1.5,
        strokeDasharray: edge.relationship === "ASSOCIATED" ? "5 4" : undefined,
      },
    }));

    return { rfNodes, rfEdges };
  }, [group, collapsed, expandedOverflow, toggleNode, expandOverflow]);

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-[rgba(248,249,250,0.7)]">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 0.9 }}
        minZoom={0.08}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#cdd6e4" gap={24} />
        <Controls showInteractive={false} />
        <Panel position="top-left" className="!m-3">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={expandAll}
              className="rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-[rgba(15,23,42,0.2)]"
            >
              Utvid alle
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-[rgba(15,23,42,0.2)]"
            >
              Skjul alle
            </button>
          </div>
        </Panel>
        <Panel position="bottom-right" className="!m-3">
          <div className="flex flex-col gap-1.5 rounded-xl border border-[rgba(15,23,42,0.1)] bg-white/95 p-3 shadow-sm backdrop-blur">
            {LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={`h-3 w-5 rounded ${item.className}`} />
                <span className="text-[11px] font-medium text-slate-600">{item.label}</span>
              </div>
            ))}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
