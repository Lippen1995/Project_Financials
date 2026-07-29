import type { SerializableSourceMetadata } from "@/lib/types";
import type { NjordToolOutputKind } from "@/server/ai-search/tools/types";

export type NjordEvidenceSource = SerializableSourceMetadata & {
  citationId: string;
  label: string | null;
  sourceUrl: string | null;
  tool: string;
  toolVersion: `v${number}` | null;
  kind: NjordToolOutputKind;
};

export type NjordClaimEvidence = {
  text: string;
  kind: NjordToolOutputKind;
  citationIds: string[];
  sources: NjordEvidenceSource[];
};

export type NjordClaimEvidenceResult = {
  claims: NjordClaimEvidence[];
  sources: NjordEvidenceSource[];
  invalidCitationIds: string[];
  uncitedLines: string[];
};

type RecordedToolResult = {
  citationSources: NjordEvidenceSource[];
  content: string;
};

type EvidenceToolResult = {
  name: string;
  toolVersion?: `v${number}`;
  outputKind?: NjordToolOutputKind;
  dataDomains?: string[];
  output: unknown;
};

const SOURCE_METADATA_KEYS = [
  "sourceSystem",
  "sourceEntityType",
  "sourceId",
  "fetchedAt",
  "normalizedAt",
] as const;
const CITATION_PATTERN = /(?:knowledge:[A-Za-z0-9:_-]+|source:\d+|calculation:\d+)/g;

function isSourceMetadata(value: unknown): value is SerializableSourceMetadata {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return SOURCE_METADATA_KEYS.every((key) => typeof record[key] === "string");
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function collectSourceCandidates(
  value: unknown,
  candidates: Array<{
    metadata: SerializableSourceMetadata;
    citationId: string | null;
    label: string | null;
    sourceUrl: string | null;
  }>,
): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSourceCandidates(item, candidates);
    return;
  }

  const record = value as Record<string, unknown>;
  const metadata = isSourceMetadata(record)
    ? record
    : isSourceMetadata(record.provenance)
      ? record.provenance
      : null;
  if (metadata) {
    candidates.push({
      metadata,
      citationId:
        typeof record.citationId === "string" && record.citationId.startsWith("knowledge:")
          ? record.citationId
          : null,
      label: firstString(record, ["title", "name", "companyName", "heading", "authority"]),
      sourceUrl: safeHttpUrl(record.sourceUrl),
    });
  }

  for (const child of Object.values(record)) {
    if (child !== metadata) collectSourceCandidates(child, candidates);
  }
}

function strongestKind(sources: NjordEvidenceSource[]): NjordToolOutputKind {
  if (sources.some((source) => source.kind === "CALCULATION")) return "CALCULATION";
  if (sources.some((source) => source.kind === "DOCUMENTED_FACT")) return "DOCUMENTED_FACT";
  return "EXPLANATION";
}

export function createClaimEvidenceTracker() {
  const sources: NjordEvidenceSource[] = [];
  const sourcesByKey = new Map<string, NjordEvidenceSource>();
  const sourcesByCitationId = new Map<string, NjordEvidenceSource>();

  return {
    recordToolResult(toolResult: EvidenceToolResult): RecordedToolResult {
      const candidates: Array<{
        metadata: SerializableSourceMetadata;
        citationId: string | null;
        label: string | null;
        sourceUrl: string | null;
      }> = [];
      collectSourceCandidates(toolResult.output, candidates);

      const citationSources = candidates.map((candidate) => {
        const key = [
          ...SOURCE_METADATA_KEYS.map((field) => candidate.metadata[field]),
          candidate.citationId ?? "",
        ].join("\u001f");
        const existing = sourcesByKey.get(key);
        if (existing) return existing;

        const citationId = candidate.citationId ?? `source:${sources.length + 1}`;
        const source: NjordEvidenceSource = {
          ...candidate.metadata,
          citationId,
          label: candidate.label,
          sourceUrl: candidate.sourceUrl,
          tool: toolResult.name,
          toolVersion: toolResult.toolVersion ?? null,
          kind: toolResult.outputKind ?? "DOCUMENTED_FACT",
        };
        sources.push(source);
        sourcesByKey.set(key, source);
        sourcesByCitationId.set(citationId, source);
        return source;
      });
      if (toolResult.outputKind === "CALCULATION") {
        const observedAt = new Date().toISOString();
        const citationId = `calculation:${
          sources.filter((source) => source.citationId.startsWith("calculation:")).length + 1
        }`;
        const calculationSource: NjordEvidenceSource = {
          citationId,
          sourceSystem: "FJORD_INSIGHT",
          sourceEntityType: "deterministic-calculation",
          sourceId: `${toolResult.name}@${toolResult.toolVersion ?? "unversioned"}`,
          fetchedAt: observedAt,
          normalizedAt: observedAt,
          label: `${toolResult.name} ${toolResult.toolVersion ?? ""}`.trim(),
          sourceUrl: null,
          tool: toolResult.name,
          toolVersion: toolResult.toolVersion ?? null,
          kind: "CALCULATION",
        };
        citationSources.unshift(calculationSource);
        sources.push(calculationSource);
        sourcesByCitationId.set(citationId, calculationSource);
      }

      return {
        citationSources,
        content: JSON.stringify({
          data: toolResult.output,
          citationSources,
        }),
      };
    },

    buildResult(answer: string | null): NjordClaimEvidenceResult {
      const invalidCitationIds = new Set<string>();
      const uncitedLines: string[] = [];
      const claims = (answer ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          const citationIds = [...new Set(line.match(CITATION_PATTERN) ?? [])];
          if (citationIds.length === 0) {
            uncitedLines.push(line);
            return [];
          }
          const claimSources = citationIds.flatMap((citationId) => {
            const source = sourcesByCitationId.get(citationId);
            if (!source) {
              invalidCitationIds.add(citationId);
              return [];
            }
            return [source];
          });
          if (claimSources.length === 0) return [];
          const text = line
            .replace(
              /\s*[\[(](?:knowledge:[A-Za-z0-9:_-]+|source:\d+|calculation:\d+)[\])]/g,
              "",
            )
            .trim();
          return [{
            text,
            kind: strongestKind(claimSources),
            citationIds,
            sources: claimSources,
          }];
        });

      return {
        claims,
        sources: [...sources],
        invalidCitationIds: [...invalidCitationIds],
        uncitedLines,
      };
    },
  };
}
