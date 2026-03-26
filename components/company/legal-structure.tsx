"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  GitBranch,
  PenSquare,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { BrregLegalStructureSnapshot } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

function nodeTone(type: BrregLegalStructureSnapshot["nodes"][number]["type"]) {
  if (type === "main_entity") return "border-[#0F172A] bg-[#0F172A] text-white";
  if (type === "subunit") return "border-[#D4E2F4] bg-[#F5F9FF] text-[#173B71]";
  if (type === "related_entity") return "border-[#DCE4EB] bg-[#F8FAFC] text-[#40586B]";
  return "border-[#E6D9C7] bg-[#FCF7EF] text-[#704E23]";
}

export function LegalStructure({ structure }: { structure: BrregLegalStructureSnapshot }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>(`main:${structure.entity.orgNumber}`);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  const mainNode = structure.nodes.find((node) => node.id === `main:${structure.entity.orgNumber}`)!;
  const subunitNodes = structure.nodes.filter((node) => node.type === "subunit");
  const roleNodes = structure.nodes.filter(
    (node) => node.type === "person" || node.type === "related_entity",
  );
  const selectedNode = structure.nodes.find((node) => node.id === selectedNodeId) ?? mainNode;
  const hoveredNode = structure.nodes.find((node) => node.id === hoveredNodeId) ?? null;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    map.set(mainNode.id, { x: 430, y: 220, width: 280, height: 126 });
    subunitNodes.forEach((node, index) =>
      map.set(node.id, { x: 70, y: 90 + index * 108, width: 240, height: 84 }),
    );
    roleNodes.forEach((node, index) =>
      map.set(node.id, { x: 820, y: 70 + index * 96, width: 240, height: 82 }),
    );
    return map;
  }, [mainNode.id, roleNodes, subunitNodes]);

  const signatureRules = structure.authorityRules.filter((rule) => rule.type === "SIGNATURE");
  const procurationRules = structure.authorityRules.filter((rule) => rule.type === "PROCURATION");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),320px]">
      <div className="space-y-6">
        <Card className="border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.9)] shadow-none">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="data-label inline-flex rounded-full border border-[rgba(15,23,42,0.1)] bg-white px-3 py-1 text-[11px] font-semibold uppercase text-slate-600">
                Juridisk struktur
              </div>
              <h2 className="mt-3 text-[1.6rem] font-semibold text-[#0F172A]">
                Konsernkart og juridisk struktur
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[#667085]">
                Viser hovedenhet, underenheter, registrerte roller og fullmakter i én samlet
                strukturvisning.
              </p>
            </div>
            <div className="border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-sm text-[#667085]">
              Oppdatert {formatDate(structure.fetchedAt)}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Valgt enhet", structure.entity.name],
              ["Underenheter", String(structure.subunits.length)],
              ["Registrerte roller", String(structure.roleAssignments.length)],
              ["Fullmakter", String(structure.authorityRules.length)],
            ].map(([label, value]) => (
              <div key={label} className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                <div className="data-label text-[11px] font-semibold uppercase text-[#667085]">
                  {label}
                </div>
                <div className="mt-1 text-sm font-semibold text-[#101828]">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4 text-sm text-[#344054]">
              <div className="data-label text-[11px] font-semibold uppercase text-[#667085]">
                Signatur
              </div>
              <div className="mt-2">
                {signatureRules[0]?.rawText ?? "Ingen registrert signaturregel."}
              </div>
            </div>
            <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4 text-sm text-[#344054]">
              <div className="data-label text-[11px] font-semibold uppercase text-[#667085]">
                Prokura
              </div>
              <div className="mt-2">
                {procurationRules[0]?.rawText ?? "Ingen registrert prokura."}
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-[rgba(15,23,42,0.08)] bg-white shadow-none">
          <div className="flex items-start justify-between gap-4 border-b border-[rgba(15,23,42,0.08)] pb-4">
            <div>
              <h3 className="text-[1.2rem] font-semibold tracking-tight text-[#0F172A]">
                Konsernkart
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#667085]">
                Kartet viser registrerte relasjoner og funksjoner rundt den juridiske enheten.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScale((value) => Math.max(0.85, Number((value - 0.1).toFixed(2))))}
                className="rounded-full border border-[#D5DCE5] px-3 py-1.5 text-xs font-semibold text-[#344054]"
              >
                Zoom ut
              </button>
              <button
                type="button"
                onClick={() => setScale(1)}
                className="rounded-full border border-[#D5DCE5] px-3 py-1.5 text-xs font-semibold text-[#344054]"
              >
                Nullstill
              </button>
              <button
                type="button"
                onClick={() => setScale((value) => Math.min(1.2, Number((value + 0.1).toFixed(2))))}
                className="rounded-full border border-[#D5DCE5] px-3 py-1.5 text-xs font-semibold text-[#344054]"
              >
                Zoom inn
              </button>
            </div>
          </div>

          <div className="relative mt-5 overflow-hidden border border-[rgba(15,23,42,0.08)] bg-[radial-gradient(circle_at_top_left,#F8FBFF_0%,#FFFFFF_46%,#F9FBFC_100%)]">
            {hoveredNode ? (
              <div className="pointer-events-none absolute right-4 top-4 z-20 w-[280px] border border-[#D8E3F0] bg-white/96 p-4">
                <div className="text-sm font-semibold text-[#101828]">{hoveredNode.label}</div>
                <div className="mt-1 text-xs text-[#667085]">
                  {hoveredNode.metadata?.roleSummary ??
                    hoveredNode.metadata?.trustNote ??
                    hoveredNode.metadata?.companyForm ??
                    "Registrert relasjon"}
                </div>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <div
                className="relative h-[560px] min-w-[1120px] origin-top-left transition-transform"
                style={{ transform: `scale(${scale})` }}
              >
                <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
                  {structure.edges
                    .filter(
                      (edge) =>
                        edge.relationshipType === "HAS_SUBUNIT" ||
                        edge.relationshipType === "HAS_ROLE_HOLDER",
                    )
                    .map((edge) => {
                      const from = positions.get(edge.sourceNodeId);
                      const to = positions.get(edge.targetNodeId);
                      if (!from || !to) return null;

                      const sx = edge.relationshipType === "HAS_SUBUNIT" ? from.x : from.x + from.width;
                      const sy = from.y + from.height / 2;
                      const ex = edge.relationshipType === "HAS_SUBUNIT" ? to.x + to.width : to.x;
                      const ey = to.y + to.height / 2;
                      const mx = sx + (ex - sx) / 2;

                      return (
                        <g key={edge.id}>
                          <path
                            d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`}
                            fill="none"
                            stroke={edge.relationshipType === "HAS_SUBUNIT" ? "#6B97D7" : "#A98045"}
                            strokeWidth={edge.priority === "high" ? 2.3 : 1.7}
                          />
                          <rect x={mx - 56} y={(sy + ey) / 2 - 18} rx={10} width={112} height={20} fill="#FFFFFF" />
                          <text
                            x={mx}
                            y={(sy + ey) / 2 - 4}
                            textAnchor="middle"
                            fontSize="10"
                            fontWeight="700"
                            fill="#475467"
                          >
                            {edge.label}
                          </text>
                        </g>
                      );
                    })}
                </svg>

                {structure.nodes.map((node) => {
                  const pos = positions.get(node.id);
                  if (!pos) return null;

                  const Icon =
                    node.type === "main_entity"
                      ? GitBranch
                      : node.type === "subunit"
                        ? Building2
                        : node.type === "related_entity"
                          ? ShieldCheck
                          : UserRound;

                  return (
                    <div
                      key={node.id}
                      className="absolute"
                      style={{ left: pos.x, top: pos.y, width: pos.width, height: pos.height }}
                    >
                      <button
                        type="button"
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() =>
                          setHoveredNodeId((current) => (current === node.id ? null : current))
                        }
                        onClick={() => setSelectedNodeId(node.id)}
                        className={cn(
                          "h-full w-full rounded-[1.3rem] border px-4 py-3 text-left transition",
                          nodeTone(node.type),
                          selectedNode.id === node.id ? "ring-2 ring-[#9EC1F7] ring-offset-2" : "",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold leading-5">{node.label}</div>
                            <div
                              className={cn(
                                "mt-1 text-xs",
                                node.type === "main_entity" ? "text-white/75" : "opacity-75",
                              )}
                            >
                              {node.metadata?.orgNumber ??
                                node.metadata?.roleSummary ??
                                "Registrert relasjon"}
                            </div>
                          </div>
                          <Icon className="mt-0.5 size-4 opacity-70" />
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-[rgba(15,23,42,0.08)] bg-white shadow-none xl:sticky xl:top-6">
          <div className="border-b border-[rgba(15,23,42,0.08)] pb-4">
            <h3 className="text-[1.2rem] font-semibold tracking-tight text-[#0F172A]">Detaljpanel</h3>
            <p className="mt-1 text-sm leading-6 text-[#667085]">
              Klikk på en node for å se registrerte detaljer.
            </p>
          </div>

          {selectedNode.id === mainNode.id ? (
            <div className="mt-5 space-y-3 text-sm text-[#344054]">
              <div className="border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4">
                <div className="text-lg font-semibold text-[#101828]">{structure.entity.name}</div>
                <div className="mt-1 text-sm text-[#667085]">
                  {structure.entity.orgNumber} · {structure.entity.companyForm ?? "Foretak"}
                </div>
              </div>
              <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                Registrert status: {structure.entity.status}
              </div>
              <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                Registrert: {formatDate(structure.entity.registrationDate)}
              </div>
              <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                Stiftet: {formatDate(structure.entity.foundationDate)}
              </div>
              <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                Forretningsadresse: {structure.entity.address ?? "Ikke registrert"}
              </div>
              <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                Næring:{" "}
                {[structure.entity.industryCode, structure.entity.industryDescription]
                  .filter(Boolean)
                  .join(" ") || "Ikke registrert"}
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-3 text-sm text-[#344054]">
              <div className="border border-[rgba(15,23,42,0.08)] bg-[#F8FAFC] p-4">
                <div className="text-lg font-semibold text-[#101828]">{selectedNode.label}</div>
                <div className="mt-1 text-sm text-[#667085]">
                  {selectedNode.metadata?.orgNumber ?? "Registrert node"}
                </div>
              </div>
              {selectedNode.metadata?.roleSummary ? (
                <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                  Registrerte roller: {selectedNode.metadata.roleSummary}
                </div>
              ) : null}
              {selectedNode.metadata?.trustNote ? (
                <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                  {selectedNode.metadata.trustNote}
                </div>
              ) : null}
              {selectedNode.metadata?.orgNumber ? (
                <Link
                  href={`/companies/${selectedNode.metadata.orgNumber}?tab=organisasjon`}
                  className="inline-flex items-center gap-1 rounded-full border border-[#D5DCE5] px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#F8FAFC]"
                >
                  Åpne selskapside <ArrowUpRight className="size-4" />
                </Link>
              ) : null}
            </div>
          )}

          <div className="mt-6 border-t border-[rgba(15,23,42,0.08)] pt-4">
            <div className="data-label text-[11px] font-semibold uppercase text-[#667085]">
              Fullmakter
            </div>
            <div className="mt-3 space-y-3">
              <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#101828]">
                  <PenSquare className="size-4" /> Signatur
                </div>
                <div className="mt-2 text-sm text-[#667085]">
                  {signatureRules[0]?.rawText ?? "Ingen registrert signaturregel."}
                </div>
              </div>
              <div className="border border-[rgba(15,23,42,0.08)] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#101828]">
                  <PenSquare className="size-4" /> Prokura
                </div>
                <div className="mt-2 text-sm text-[#667085]">
                  {procurationRules[0]?.rawText ?? "Ingen registrert prokura."}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
