"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  LinkOperation,
  NodeMappingModel,
  PresentationKeyModel,
  PresentationNodeModel,
} from "@/server/services/presentation-node-service";
import type { CanonicalKeyUsage } from "@/server/services/canonical-key-service";

const KEY_MIME = "application/x-metric-key";

type Operand = { label: string; operation: LinkOperation };

// ── Custom node ─────────────────────────────────────────────────────────────

type PresentationNodeData = {
  nodeId: string;
  label: string;
  kind: "LINE" | "SUBTOTAL";
  keyIds: string[];
  operands: Operand[];
  selected: boolean;
  onDropKey: (metricKey: string, nodeId: string) => void;
};

function PresentationNodeView({ data }: NodeProps<Node<PresentationNodeData>>) {
  const [over, setOver] = useState(false);
  const isSubtotal = data.kind === "SUBTOTAL";

  // Dropping a key on a SUBTOTAL attaches it as a MATCH (validation) reference,
  // never as an additive operand — a subtotal's value comes from its operand
  // nodes. The over-state colour signals this difference (purple = match).
  const overColor = isSubtotal ? "#7c3aed" : "#2563eb";
  const overBg = isSubtotal ? "#faf5ff" : "#eff6ff";

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(KEY_MIME)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const metricKey = e.dataTransfer.getData(KEY_MIME);
        if (metricKey) {
          e.preventDefault();
          data.onDropKey(metricKey, data.nodeId);
        }
      }}
      className="min-w-[200px] max-w-[260px] rounded-xl border-2 px-3 py-2 shadow-sm transition-colors"
      style={{
        borderColor: data.selected
          ? "#00668a"
          : over
            ? overColor
            : isSubtotal
              ? "#15803d"
              : "rgba(15,23,42,0.18)",
        background: over ? overBg : isSubtotal ? "#f0fdf4" : "#ffffff",
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{data.label}</span>
        {isSubtotal ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-green-700">
            Subtotal
          </span>
        ) : null}
      </div>

      {isSubtotal ? (
        <>
          {data.operands.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 border-t border-green-100 pt-1.5 text-xs text-slate-600">
              {data.operands.map((operand, i) => (
                <li key={`${operand.label}-${i}`}>
                  <span
                    className={
                      operand.operation === "SUBTRACT"
                        ? "font-bold text-red-600"
                        : "font-bold text-green-700"
                    }
                  >
                    {i === 0 && operand.operation === "ADD" ? "" : operand.operation === "SUBTRACT" ? "− " : "+ "}
                  </span>
                  {operand.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 border-t border-green-100 pt-1.5 text-xs italic text-slate-400">
              Ingen input-noder ennå
            </p>
          )}
          {data.keyIds.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 border-t border-purple-100 pt-1.5 font-mono text-xs text-purple-600">
              {data.keyIds.map((id) => (
                <li key={id}>
                  <span className="font-bold">= </span>
                  {id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[10px] italic text-purple-400">
              Dra en nøkkel hit for å matche/validere
            </p>
          )}
        </>
      ) : data.keyIds.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5 font-mono text-xs text-slate-500">
          {data.keyIds.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 border-t border-slate-100 pt-1.5 text-xs italic text-slate-400">
          Ingen nøkler · dra hit
        </p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { presentation: PresentationNodeView };

// ── Helpers ─────────────────────────────────────────────────────────────────

async function mutate(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? `Feil (${res.status})` };
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function MetricMappingView({
  initialModel,
}: {
  initialModel: NodeMappingModel;
}) {
  const [model, setModel] = useState<NodeMappingModel>(initialModel);
  const [search, setSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");

  // Subtotal builder state: nodeId -> operation (or absent = not included).
  const [showBuilder, setShowBuilder] = useState(false);
  const [subtotalLabel, setSubtotalLabel] = useState("");
  const [operandState, setOperandState] = useState<Record<string, LinkOperation>>({});

  // Canonical-key administration state.
  const [usage, setUsage] = useState<CanonicalKeyUsage[]>([]);
  const [inspectedKey, setInspectedKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [keyCompanies, setKeyCompanies] = useState<{ companyId: string; name: string }[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set());

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<PresentationNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const reload = useCallback(async () => {
    const [nodesRes, usageRes] = await Promise.all([
      fetch("/api/admin/presentation-nodes", { cache: "no-store" }),
      fetch("/api/admin/canonical-keys", { cache: "no-store" }),
    ]);
    if (nodesRes.ok) {
      const json = (await nodesRes.json()) as { data: NodeMappingModel };
      setModel(json.data);
    }
    if (usageRes.ok) {
      const json = (await usageRes.json()) as { data: { keys: CanonicalKeyUsage[] } };
      setUsage(json.data.keys);
    }
  }, []);

  // Load usage on mount (the model is server-rendered, usage is fetched client-side).
  useEffect(() => {
    void reload();
  }, [reload]);

  const runMutation = useCallback(
    async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(true);
      setErrorMsg(null);
      try {
        const result = await fn();
        if (!result.ok) {
          setErrorMsg(result.error ?? "Ukjent feil");
          return false;
        }
        await reload();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const handleAssign = useCallback(
    (metricKey: string, nodeId: string | null) =>
      runMutation(() =>
        mutate("/api/admin/presentation-nodes/keys", "PATCH", { metricKey, nodeId }),
      ),
    [runMutation],
  );
  // Assigns a key to a node via drag-and-drop. Dropping onto a SUBTOTAL node
  // attaches the key as a MATCH reference: a subtotal's value is computed from
  // its operand nodes, so a key there can only validate that computed value
  // (the reported figure must match within tolerance). This keeps subtotal keys
  // restricted to matching, which the downstream validation step relies on.
  const handleDropKeyOnNode = useCallback(
    (metricKey: string, nodeId: string) => {
      const isSubtotal =
        model.nodes.find((n) => n.id === nodeId)?.kind === "SUBTOTAL";
      return runMutation(async () => {
        const res = await mutate("/api/admin/presentation-nodes/keys", "PATCH", {
          metricKey,
          nodeId,
        });
        if (!res.ok || !isSubtotal) return res;
        return mutate("/api/admin/presentation-nodes/keys/config", "PATCH", {
          metricKey,
          operation: "MATCH",
        });
      });
    },
    [runMutation, model.nodes],
  );
  const handleDropKeyOnNodeRef = useRef(handleDropKeyOnNode);
  handleDropKeyOnNodeRef.current = handleDropKeyOnNode;

  const handleKeyConfig = useCallback(
    (metricKey: string, patch: { valueMode?: string; operation?: string }) =>
      runMutation(() =>
        mutate("/api/admin/presentation-nodes/keys/config", "PATCH", { metricKey, ...patch }),
      ),
    [runMutation],
  );

  // Derived lookups.
  const keysByNode = useMemo(() => {
    const map = new Map<string, PresentationKeyModel[]>();
    for (const key of model.keys) {
      if (key.nodeId) {
        const list = map.get(key.nodeId) ?? [];
        list.push(key);
        map.set(key.nodeId, list);
      }
    }
    return map;
  }, [model.keys]);

  const nodeById = useMemo(() => {
    const map = new Map<string, PresentationNodeModel>();
    for (const node of model.nodes) map.set(node.id, node);
    return map;
  }, [model.nodes]);

  // Incoming links (operands) per target node.
  const operandsByNode = useMemo(() => {
    const map = new Map<string, { linkId: string; sourceNodeId: string; operation: LinkOperation }[]>();
    for (const link of model.links) {
      const list = map.get(link.targetNodeId) ?? [];
      list.push({ linkId: link.id, sourceNodeId: link.sourceNodeId, operation: link.operation });
      map.set(link.targetNodeId, list);
    }
    return map;
  }, [model.links]);

  // Rebuild React Flow graph when the model changes.
  useEffect(() => {
    setRfNodes(
      model.nodes.map((node) => ({
        id: node.id,
        type: "presentation",
        position: { x: node.positionX, y: node.positionY },
        data: {
          nodeId: node.id,
          label: node.label,
          kind: node.kind,
          keyIds: (keysByNode.get(node.id) ?? []).map((k) => k.key),
          operands: (operandsByNode.get(node.id) ?? []).map((op) => ({
            label: nodeById.get(op.sourceNodeId)?.label ?? "?",
            operation: op.operation,
          })),
          selected: node.id === selectedNodeId,
          onDropKey: (metricKey: string, nodeId: string) =>
            handleDropKeyOnNodeRef.current(metricKey, nodeId),
        },
      })),
    );
    setRfEdges(
      model.links.map((link) => ({
        id: link.id,
        source: link.sourceNodeId,
        target: link.targetNodeId,
        animated: true,
        label: link.operation === "SUBTRACT" ? "−" : "+",
        labelStyle: {
          fill: link.operation === "SUBTRACT" ? "#dc2626" : "#15803d",
          fontWeight: 700,
        },
        style: { stroke: link.operation === "SUBTRACT" ? "#dc2626" : "#15803d" },
      })),
    );
  }, [model, keysByNode, operandsByNode, nodeById, selectedNodeId, setRfNodes, setRfEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      setRfEdges((eds) => addEdge({ ...connection, animated: true }, eds));
      void runMutation(() =>
        mutate("/api/admin/presentation-nodes/links", "POST", {
          sourceNodeId: connection.source,
          targetNodeId: connection.target,
          operation: "ADD",
        }),
      );
    },
    [runMutation, setRfEdges],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      void runMutation(async () => {
        for (const edge of deleted) {
          const res = await mutate(`/api/admin/presentation-nodes/links/${edge.id}`, "DELETE");
          if (!res.ok) return res;
        }
        return { ok: true };
      });
    },
    [runMutation],
  );

  const onNodeDragStop = useCallback((_e: unknown, node: Node) => {
    void mutate(`/api/admin/presentation-nodes/${node.id}`, "PATCH", {
      positionX: node.position.x,
      positionY: node.position.y,
    });
  }, []);

  const onNodeClick = useCallback((_e: unknown, node: Node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Filtered key list.
  const filteredKeys = useMemo(() => {
    const term = search.trim().toLowerCase();
    return model.keys.filter((key) => {
      if (selectedNodeId && key.nodeId !== selectedNodeId) return false;
      if (showUnassignedOnly && key.nodeId) return false;
      if (!term) return true;
      const nodeLabel = key.nodeId ? nodeById.get(key.nodeId)?.label ?? "" : "";
      return (
        key.label.toLowerCase().includes(term) ||
        key.key.toLowerCase().includes(term) ||
        nodeLabel.toLowerCase().includes(term)
      );
    });
  }, [model.keys, search, selectedNodeId, showUnassignedOnly, nodeById]);

  const unassignedCount = useMemo(
    () => model.keys.filter((k) => !k.nodeId).length,
    [model.keys],
  );

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;
  const selectedOperands = selectedNodeId ? operandsByNode.get(selectedNodeId) ?? [] : [];
  const selectedNodeKeys = selectedNodeId ? keysByNode.get(selectedNodeId) ?? [] : [];

  // Canonical-key usage lookup + inspector.
  const usageByKey = useMemo(() => {
    const map = new Map<string, CanonicalKeyUsage>();
    for (const u of usage) map.set(u.key, u);
    return map;
  }, [usage]);

  const inspected = inspectedKey ? usageByKey.get(inspectedKey) : undefined;

  const openInspector = useCallback(async (key: string) => {
    setInspectedKey(key);
    setRenameValue(key);
    setMoveTarget("");
    setSelectedCompanyIds(new Set());
    setKeyCompanies([]);
    const res = await fetch(
      `/api/admin/canonical-keys/companies?key=${encodeURIComponent(key)}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const json = (await res.json()) as { data: { companies: { companyId: string; name: string }[] } };
      setKeyCompanies(json.data.companies);
    }
  }, []);

  const handleRenameKey = useCallback(() => {
    if (!inspectedKey) return;
    const to = renameValue.trim();
    if (!to || to === inspectedKey) return;
    void runMutation(async () => {
      const res = await mutate("/api/admin/canonical-keys", "POST", {
        action: "rename",
        from: inspectedKey,
        to,
      });
      if (res.ok) setInspectedKey(to);
      return res;
    });
  }, [inspectedKey, renameValue, runMutation]);

  const handleMoveKey = useCallback(
    (companyIds: string[] | null) => {
      if (!inspectedKey) return;
      const to = moveTarget.trim();
      if (!to || to === inspectedKey) {
        setErrorMsg("Velg en målnøkkel å flytte til.");
        return;
      }
      void runMutation(async () => {
        const res = await mutate("/api/admin/canonical-keys", "POST", {
          action: companyIds && companyIds.length > 0 ? "reassign" : "rename",
          from: inspectedKey,
          to,
          ...(companyIds && companyIds.length > 0 ? { companyIds } : {}),
        });
        if (res.ok) {
          // Full move empties the source key; partial move keeps it — refresh companies.
          if (!companyIds || companyIds.length === 0) {
            setInspectedKey(null);
          } else {
            void openInspector(inspectedKey);
          }
        }
        return res;
      });
    },
    [inspectedKey, moveTarget, runMutation, openInspector],
  );

  const handleSetFamily = useCallback(
    (family: "INCOME_STATEMENT" | "BALANCE_SHEET") => {
      if (!inspectedKey) return;
      void runMutation(() =>
        mutate("/api/admin/canonical-keys", "POST", {
          action: "setFamily",
          key: inspectedKey,
          family,
        }),
      );
    },
    [inspectedKey, runMutation],
  );

  const handleDeleteKey = useCallback(() => {
    if (!inspectedKey) return;
    void runMutation(async () => {
      const res = await mutate("/api/admin/canonical-keys", "POST", {
        action: "delete",
        key: inspectedKey,
      });
      if (res.ok) setInspectedKey(null);
      return res;
    });
  }, [inspectedKey, runMutation]);

  const handleCreateNode = () =>
    runMutation(async () => {
      const res = await mutate("/api/admin/presentation-nodes", "POST", {
        label: newLabel.trim() || "Ny node",
        kind: "LINE",
        positionX: 200,
        positionY: 40,
      });
      if (res.ok) setNewLabel("");
      return res;
    });

  const cycleOperand = (nodeId: string) =>
    setOperandState((prev) => {
      const next = { ...prev };
      if (!next[nodeId]) next[nodeId] = "ADD";
      else if (next[nodeId] === "ADD") next[nodeId] = "SUBTRACT";
      else delete next[nodeId];
      return next;
    });

  const handleCreateSubtotal = async () => {
    const operands = Object.entries(operandState).map(([nodeId, operation]) => ({
      nodeId,
      operation,
    }));
    if (operands.length === 0) {
      setErrorMsg("Velg minst én node som input til subtotalen.");
      return;
    }
    const ok = await runMutation(() =>
      mutate("/api/admin/presentation-nodes/subtotals", "POST", {
        label: subtotalLabel.trim() || "Ny subtotal",
        operands,
        positionX: 480,
        positionY: 40,
      }),
    );
    if (ok) {
      setSubtotalLabel("");
      setOperandState({});
      setShowBuilder(false);
    }
  };

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-slate-800">Kanoniske nøkler</h1>
        <p className="mt-1 text-sm text-slate-500">
          Administrasjonssenter for kanoniske regnskapsnøkler: se hvor mange selskaper som bruker
          hver nøkkel, gi nytt navn, flytt/slå sammen selskaper mellom nøkler, og slett ubrukte.
          Klikk en nøkkel for å administrere den. Grupper nøkler i noder og bygg subtotaler i
          flyten til høyre.
        </p>
      </header>

      {errorMsg ? (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-[320px_1fr] gap-4">
        {/* Key list */}
        <aside className="flex max-h-[82vh] flex-col rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Nøkler
            </h2>
            <span className="text-xs text-slate-400">
              {unassignedCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowUnassignedOnly((prev) => !prev)}
                  title={
                    showUnassignedOnly
                      ? "Vis alle nøkler"
                      : "Vis kun ufordelte nøkler"
                  }
                  aria-pressed={showUnassignedOnly}
                  className={`rounded px-1.5 py-0.5 font-medium text-red-600 underline-offset-2 hover:underline focus:outline-none ${
                    showUnassignedOnly ? "bg-red-50 underline" : ""
                  }`}
                >
                  {unassignedCount} ufordelt
                </button>
              ) : (
                "alle fordelt"
              )}
            </span>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk på nøkkel eller node…"
            className="mb-2 w-full rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm focus:outline-none"
          />

          {selectedNode ? (
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className="mb-2 rounded bg-[#00668a] px-2 py-1 text-xs font-medium text-white hover:bg-[#00526e]"
            >
              Viser «{selectedNode.label}» · vis alle
            </button>
          ) : null}

          <ul className="-mr-1 flex-1 space-y-1 overflow-y-auto pr-1">
            {filteredKeys.map((key) => {
              const nodeLabel = key.nodeId ? nodeById.get(key.nodeId)?.label : undefined;
              const u = usageByKey.get(key.key);
              const isInspected = inspectedKey === key.key;
              return (
                <li
                  key={key.key}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(KEY_MIME, key.key);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => void openInspector(key.key)}
                  className="group flex cursor-grab items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm active:cursor-grabbing"
                  style={{
                    borderColor: isInspected
                      ? "#00668a"
                      : key.nodeId
                        ? "rgba(15,23,42,0.10)"
                        : "#fecaca",
                    background: key.nodeId ? "#ffffff" : "#fef2f2",
                    boxShadow: isInspected ? "0 0 0 1px #00668a" : undefined,
                  }}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="block truncate font-mono text-xs text-slate-800">
                        {key.key}
                      </span>
                      {key.isCustom ? (
                        <span
                          title="Opprettet i manuell review"
                          className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-700"
                        >
                          Egendefinert
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[11px] text-slate-400">
                      {key.label}
                    </span>
                    <span className="flex items-center gap-2 text-[11px]">
                      <span className={u && u.companyCount > 0 ? "text-slate-500" : "text-slate-300"}>
                        {u ? `${u.companyCount} selskap` : "0 selskap"}
                      </span>
                      {nodeLabel ? (
                        <span className="truncate text-slate-500">→ {nodeLabel}</span>
                      ) : (
                        <span className="font-medium text-red-600">ufordelt</span>
                      )}
                    </span>
                  </span>
                  {key.nodeId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAssign(key.key, null);
                      }}
                      title="Fjern fra node"
                      className="shrink-0 rounded px-1 text-xs text-slate-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  ) : null}
                </li>
              );
            })}
            {filteredKeys.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-slate-400">Ingen treff.</li>
            ) : null}
          </ul>
        </aside>

        {/* Canvas + side controls */}
        <div className="grid grid-rows-[auto_1fr] gap-3">
          <div className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col">
                <label className="mb-1 text-[11px] uppercase tracking-widest text-slate-400">
                  Ny node
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Navn på node"
                  className="rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={handleCreateNode}
                className="rounded bg-[#00668a] px-4 py-2 text-sm font-medium text-white hover:bg-[#00526e] disabled:opacity-50"
              >
                Legg til node
              </button>
              <button
                type="button"
                onClick={() => setShowBuilder((v) => !v)}
                className="rounded border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
              >
                {showBuilder ? "Lukk subtotal-bygger" : "Lag subtotal"}
              </button>

              {selectedNode ? (
                <div className="ml-auto flex items-end gap-2">
                  <div className="flex flex-col">
                    <label className="mb-1 text-[11px] uppercase tracking-widest text-slate-400">
                      Valgt node
                    </label>
                    <input
                      type="text"
                      defaultValue={selectedNode.label}
                      key={selectedNode.id + selectedNode.label}
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== selectedNode.label) {
                          void runMutation(() =>
                            mutate(`/api/admin/presentation-nodes/${selectedNode.id}`, "PATCH", {
                              label,
                            }),
                          );
                        }
                      }}
                      className="rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void runMutation(() =>
                        mutate(`/api/admin/presentation-nodes/${selectedNode.id}`, "DELETE"),
                      );
                      setSelectedNodeId(null);
                    }}
                    className="rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Slett node
                  </button>
                </div>
              ) : null}
            </div>

            {/* Subtotal builder */}
            {showBuilder ? (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50/50 p-3">
                <div className="flex items-end gap-2">
                  <div className="flex flex-1 flex-col">
                    <label className="mb-1 text-[11px] uppercase tracking-widest text-slate-400">
                      Subtotal-navn
                    </label>
                    <input
                      type="text"
                      value={subtotalLabel}
                      onChange={(e) => setSubtotalLabel(e.target.value)}
                      placeholder="F.eks. EBITDA"
                      className="rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCreateSubtotal}
                    className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    Opprett subtotal
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Klikk på en node for å veksle: ingen → <span className="font-bold text-green-700">+</span> →{" "}
                  <span className="font-bold text-red-600">−</span> → ingen.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {model.nodes.map((node) => {
                    const op = operandState[node.id];
                    return (
                      <button
                        type="button"
                        key={node.id}
                        onClick={() => cycleOperand(node.id)}
                        className="rounded-full border px-3 py-1 text-xs font-medium"
                        style={{
                          borderColor:
                            op === "ADD"
                              ? "#15803d"
                              : op === "SUBTRACT"
                                ? "#dc2626"
                                : "rgba(15,23,42,0.15)",
                          background:
                            op === "ADD" ? "#dcfce7" : op === "SUBTRACT" ? "#fee2e2" : "#ffffff",
                          color:
                            op === "ADD" ? "#15803d" : op === "SUBTRACT" ? "#dc2626" : "#475569",
                        }}
                      >
                        {op === "ADD" ? "+ " : op === "SUBTRACT" ? "− " : ""}
                        {node.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Operand editor for a selected subtotal */}
            {selectedNode && selectedNode.kind === "SUBTOTAL" ? (
              <div className="mt-3 rounded-lg border border-green-200 bg-white p-3">
                <h3 className="mb-2 text-[11px] uppercase tracking-widest text-slate-400">
                  Input til «{selectedNode.label}»
                </h3>
                {selectedOperands.length === 0 ? (
                  <p className="text-xs italic text-slate-400">Ingen input-noder ennå.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedOperands.map((op) => (
                      <li key={op.linkId} className="flex items-center gap-2 text-sm">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            runMutation(() =>
                              mutate(
                                `/api/admin/presentation-nodes/links/${op.linkId}`,
                                "PATCH",
                                { operation: op.operation === "ADD" ? "SUBTRACT" : "ADD" },
                              ),
                            )
                          }
                          className="w-7 rounded border text-center font-bold"
                          style={{
                            borderColor: op.operation === "SUBTRACT" ? "#dc2626" : "#15803d",
                            color: op.operation === "SUBTRACT" ? "#dc2626" : "#15803d",
                          }}
                          title="Veksle fortegn"
                        >
                          {op.operation === "SUBTRACT" ? "−" : "+"}
                        </button>
                        <span className="flex-1 text-slate-700">
                          {nodeById.get(op.sourceNodeId)?.label ?? "?"}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            runMutation(() =>
                              mutate(
                                `/api/admin/presentation-nodes/links/${op.linkId}`,
                                "DELETE",
                              ),
                            )
                          }
                          className="rounded px-1 text-xs text-slate-400 hover:text-red-600"
                          title="Fjern input"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <select
                    disabled={busy}
                    value=""
                    onChange={(e) => {
                      const sourceNodeId = e.target.value;
                      if (!sourceNodeId) return;
                      void runMutation(() =>
                        mutate("/api/admin/presentation-nodes/links", "POST", {
                          sourceNodeId,
                          targetNodeId: selectedNode.id,
                          operation: "ADD",
                        }),
                      );
                    }}
                    className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-2 py-1 text-xs"
                  >
                    <option value="">+ Legg til input-node…</option>
                    {model.nodes
                      .filter(
                        (n) =>
                          n.id !== selectedNode.id &&
                          !selectedOperands.some((op) => op.sourceNodeId === n.id),
                      )
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ) : null}

            {/* Per-key value rules for a selected node */}
            {selectedNode && selectedNodeKeys.length > 0 ? (
              <div className="mt-3 rounded-lg border border-[rgba(15,23,42,0.12)] bg-white p-3">
                <h3 className="mb-1 text-[11px] uppercase tracking-widest text-slate-400">
                  Verdiregler for nøkler i «{selectedNode.label}»
                </h3>
                <p className="mb-2 text-[11px] text-slate-500">
                  Velg om nøkkelens verdi brukes nominelt (med fortegn) eller absolutt, og hvilken
                  funksjon den har. <span className="font-semibold">Match</span> betyr at funksjonen
                  av de andre nøklene skal stemme med denne verdien (±1 %); avvik flagges i manuell
                  kontroll.
                  {selectedNode.kind === "SUBTOTAL" ? (
                    <>
                      {" "}
                      Nøkler på en subtotal er låst til <span className="font-semibold">Match</span>:
                      subtotalens verdi beregnes fra input-nodene, så nøkkelen kan bare validere den.
                    </>
                  ) : null}
                </p>
                <ul className="space-y-1.5">
                  {selectedNodeKeys.map((key) => (
                    <li
                      key={key.key}
                      className="flex flex-wrap items-center gap-2 rounded border border-[rgba(15,23,42,0.06)] bg-slate-50/60 px-2 py-1.5"
                    >
                      <span className="flex-1 text-sm text-slate-700" title={key.key}>
                        {key.label}
                      </span>
                      <select
                        disabled={busy}
                        value={key.valueMode}
                        onChange={(e) => void handleKeyConfig(key.key, { valueMode: e.target.value })}
                        className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-2 py-1 text-xs"
                        title="Hvordan verdien leses"
                      >
                        <option value="NOMINAL">Nominell</option>
                        <option value="ABSOLUTE">Absolutt</option>
                      </select>
                      {selectedNode.kind === "SUBTOTAL" ? (
                        <span
                          className="rounded border px-2 py-1 text-xs font-semibold"
                          style={{ borderColor: "#7c3aed", color: "#7c3aed" }}
                          title="Nøkler på en subtotal er låst til Match (validering)"
                        >
                          Match (=)
                        </span>
                      ) : (
                        <select
                          disabled={busy}
                          value={key.operation}
                          onChange={(e) => void handleKeyConfig(key.key, { operation: e.target.value })}
                          className="rounded border border-[rgba(15,23,42,0.12)] bg-white px-2 py-1 text-xs"
                          style={{
                            borderColor: key.operation === "MATCH" ? "#7c3aed" : undefined,
                            color: key.operation === "MATCH" ? "#7c3aed" : undefined,
                            fontWeight: key.operation === "MATCH" ? 600 : undefined,
                          }}
                          title="Beregningsfunksjon"
                        >
                          <option value="ADD">Addisjon (+)</option>
                          <option value="SUBTRACT">Subtraksjon (−)</option>
                          <option value="MULTIPLY">Multiplikasjon (×)</option>
                          <option value="DIVIDE">Divisjon (÷)</option>
                          <option value="MATCH">Match (=)</option>
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAssign(key.key, null)}
                        title="Fjern nøkkelen fra noden"
                        className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="h-[72vh] rounded-lg border border-[rgba(15,23,42,0.08)] bg-[var(--px-subtle,#f8fafc)]">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </div>
      </div>

      {/* Canonical-key inspector */}
      {inspectedKey ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setInspectedKey(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all font-mono text-sm font-semibold text-slate-800">
                  {inspectedKey}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span
                    className={
                      inspected?.isCustom
                        ? "rounded bg-amber-100 px-1 font-medium uppercase tracking-wide text-amber-700"
                        : "rounded bg-slate-100 px-1 font-medium uppercase tracking-wide text-slate-600"
                    }
                  >
                    {inspected?.isCustom ? "Egendefinert" : "Skjelett"}
                  </span>
                  {inspected?.isRequired ? (
                    <span className="rounded bg-blue-100 px-1 font-medium uppercase tracking-wide text-blue-700">
                      Påkrevd
                    </span>
                  ) : null}
                  {inspected && inspected.isCustom && !inspected.familyConfirmed ? (
                    <span
                      title="Familien er gjettet fra dataene og kan være feil — bekreft den under."
                      className="rounded bg-orange-100 px-1 font-medium uppercase tracking-wide text-orange-700"
                    >
                      Familie ubekreftet
                    </span>
                  ) : null}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedKey(null)}
                className="shrink-0 rounded px-2 py-1 text-sm text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Statement family — editable. Determines which picker (resultat
                vs. balanse) offers the key in manual review. */}
            <div className="mb-4 rounded-lg border border-[rgba(15,23,42,0.08)] p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Regnskapsoppstilling
              </p>
              <div className="flex gap-2">
                {(
                  [
                    ["INCOME_STATEMENT", "Resultat"],
                    ["BALANCE_SHEET", "Balanse"],
                  ] as const
                ).map(([value, label]) => {
                  const active = inspected?.family === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={busy || active}
                      onClick={() => handleSetFamily(value)}
                      className={`flex-1 rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default ${
                        active
                          ? "border-[#00668a] bg-[#00668a] text-white"
                          : "border-[rgba(15,23,42,0.12)] bg-white text-slate-600 hover:border-[#00668a] hover:text-[#00668a]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                {inspected?.isCustom
                  ? "Egendefinerte nøkler gjettes ofte feil (balanseposter havner under resultat). Sett riktig oppstilling her — da dukker nøkkelen opp i riktig velger i manuell kontroll."
                  : "Skjelettnøkkel — endring oppdaterer registeret."}
              </p>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-[rgba(15,23,42,0.08)] p-2">
                <p className="text-lg font-semibold text-slate-800">
                  {inspected?.companyCount ?? 0}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Selskap</p>
              </div>
              <div className="rounded border border-[rgba(15,23,42,0.08)] p-2">
                <p className="text-lg font-semibold text-slate-800">
                  {inspected?.lineItemCount ?? 0}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Linjeposter</p>
              </div>
              <div
                className="rounded border border-[rgba(15,23,42,0.08)] p-2"
                title="Antall ulike kildelabels som er mappet til denne nøkkelen. Null for den frie strukturerte kilden, som kommer ferdig mappet."
              >
                <p className="text-lg font-semibold text-slate-800">
                  {inspected?.sourceLabelCount ?? 0}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Kildelabels</p>
              </div>
            </div>

            {inspected?.isRequired ? (
              <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
                Påkrevd nøkkel for publisering. Navneendring følger automatisk med til
                fakta, aliaser og publiseringskontrollen — ingen kodeendring nødvendig.
              </div>
            ) : null}

            {/* Rename */}
            <section className="mb-4">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Gi nytt navn
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1 rounded border border-[rgba(15,23,42,0.12)] px-3 py-2 font-mono text-sm focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busy || !renameValue.trim() || renameValue.trim() === inspectedKey}
                  onClick={handleRenameKey}
                  className="rounded bg-[#00668a] px-3 py-2 text-sm font-medium text-white hover:bg-[#00526e] disabled:opacity-40"
                >
                  Endre navn
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Oppdaterer alle regnskapsfakta som bruker nøkkelen, hos alle selskaper.
              </p>
            </section>

            {/* Move / merge */}
            <section className="mb-4">
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Flytt / slå sammen
              </h3>
              <div className="flex gap-2">
                <select
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  className="flex-1 rounded border border-[rgba(15,23,42,0.12)] bg-white px-2 py-2 text-sm"
                >
                  <option value="">Velg målnøkkel…</option>
                  {usage
                    .filter((k) => k.key !== inspectedKey)
                    .map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.key}
                        {k.isCustom ? " (egendefinert)" : ""}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !moveTarget}
                  onClick={() => handleMoveKey(null)}
                  className="rounded border border-[rgba(15,23,42,0.15)] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  title="Flytt alle selskaper til målnøkkelen"
                >
                  Flytt alle
                </button>
              </div>

              {keyCompanies.length > 0 ? (
                <div className="mt-2 rounded border border-[rgba(15,23,42,0.08)] p-2">
                  <p className="mb-1 text-[11px] text-slate-500">
                    Eller velg enkeltselskaper å flytte:
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {keyCompanies.map((c) => (
                      <li key={c.companyId} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedCompanyIds.has(c.companyId)}
                          onChange={(e) =>
                            setSelectedCompanyIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.companyId);
                              else next.delete(c.companyId);
                              return next;
                            })
                          }
                        />
                        <span className="truncate text-slate-700">{c.name}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={busy || !moveTarget || selectedCompanyIds.size === 0}
                    onClick={() => handleMoveKey([...selectedCompanyIds])}
                    className="mt-2 rounded bg-[#00668a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#00526e] disabled:opacity-40"
                  >
                    Flytt {selectedCompanyIds.size} valgte til målnøkkel
                  </button>
                </div>
              ) : null}
            </section>

            {/* Delete */}
            <section className="border-t border-[rgba(15,23,42,0.08)] pt-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  {(inspected?.companyCount ?? 0) > 0
                    ? "Kan ikke slettes så lenge selskaper bruker nøkkelen. Flytt dem først."
                    : "Ingen selskaper bruker nøkkelen — den kan slettes."}
                </p>
                <button
                  type="button"
                  disabled={busy || (inspected?.companyCount ?? 0) > 0}
                  onClick={handleDeleteKey}
                  className="shrink-0 rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  Slett nøkkel
                </button>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
