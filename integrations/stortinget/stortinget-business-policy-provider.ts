import { z } from "zod";

import type { OfficialKnowledgeDocumentInput } from "@/server/knowledge/knowledge-ingestion-service";

type StortingetTopic = { id?: number; navn?: string | null };

export type StortingetCaseSummary = {
  id: number;
  sak_sesjon?: string | null;
  sak_nummer?: number | null;
  tittel?: string | null;
  korttittel?: string | null;
  henvisning?: string | null;
  innstillingstekst?: string | null;
  vedtakstekst?: string | null;
  kortvedtak?: string | null;
  status?: number | null;
  sist_oppdatert_dato?: string | null;
  emne_liste?: StortingetTopic[] | null;
};

type StortingetCasesResponse = { saker_liste?: StortingetCaseSummary[] };

const stortingetTopicSchema = z.object({
  id: z.number().int().optional(),
  navn: z.string().nullable().optional(),
}).passthrough();

const stortingetCaseSummarySchema = z.object({
  id: z.number().int().positive(),
  sak_sesjon: z.string().nullable().optional(),
  sak_nummer: z.number().int().nullable().optional(),
  tittel: z.string().nullable().optional(),
  korttittel: z.string().nullable().optional(),
  henvisning: z.string().nullable().optional(),
  innstillingstekst: z.string().nullable().optional(),
  vedtakstekst: z.string().nullable().optional(),
  kortvedtak: z.string().nullable().optional(),
  status: z.number().int().nullable().optional(),
  sist_oppdatert_dato: z.string().nullable().optional(),
  emne_liste: z.array(stortingetTopicSchema).nullable().optional(),
}).passthrough();

const stortingetCasesResponseSchema: z.ZodType<StortingetCasesResponse> = z.object({
  saker_liste: z.array(stortingetCaseSummarySchema).optional(),
}).passthrough();

const STATUS_LABELS: Record<number, string> = {
  1: "varslet",
  2: "mottatt",
  3: "til behandling",
  4: "behandlet",
  5: "trukket",
  6: "bortfalt",
};

function parseDotNetDate(value: string | null | undefined) {
  const epoch = value?.match(/\/Date\((\d+)/)?.[1];
  return epoch ? new Date(Number(epoch)) : null;
}

function compact(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

export function normalizeStortingetCase(
  item: StortingetCaseSummary,
  fetchedAt: Date,
): OfficialKnowledgeDocumentInput {
  const session = item.sak_sesjon?.trim() || "ukjent-sesjon";
  const updatedAt = parseDotNetDate(item.sist_oppdatert_dato) ?? fetchedAt;
  const topics = (item.emne_liste ?? []).map((topic) => topic.navn?.trim()).filter(Boolean);
  const statusLabel = item.status == null ? "ukjent" : (STATUS_LABELS[item.status] ?? `kode ${item.status}`);
  const title = item.tittel?.trim() || item.korttittel?.trim();
  if (!title) throw new Error(`Stortingssak ${item.id} mangler tittel.`);

  const content = compact([
    `Stortingssak ${item.id} (${session})`,
    `Status: ${statusLabel}`,
    item.henvisning ? `Henvisning: ${item.henvisning}` : null,
    topics.length ? `Emner: ${topics.join(", ")}` : null,
    `Tittel: ${title}`,
    item.innstillingstekst ? `Innstilling: ${item.innstillingstekst}` : null,
    item.vedtakstekst ? `Vedtakstekst: ${item.vedtakstekst}` : null,
    item.kortvedtak ? `Kortvedtak: ${item.kortvedtak}` : null,
  ]).join("\n\n");

  return {
    externalId: `STORTING-SAK-${item.id}`,
    versionKey: updatedAt.toISOString(),
    title,
    shortTitle: item.korttittel?.trim() || null,
    description: item.henvisning?.trim() || null,
    authority: "Stortinget",
    jurisdiction: "NO",
    domain: "BUSINESS_POLICY",
    documentType: item.status === 4 ? "PARLIAMENT_DECISION" : "OTHER",
    // A completed parliamentary case is not automatically a law in force. The actual legal effect
    // must be established through Lovdata/get_rule_status, so only pending cases get a proposal label.
    legalStatus:
      item.status != null && item.status >= 1 && item.status <= 3
        ? "PROPOSED"
        : item.status === 5
          ? "WITHDRAWN"
          : item.status === 6
            ? "LAPSED"
            : "UNKNOWN",
    language: "nb",
    sourceUrl: `https://data.stortinget.no/eksport/sak?sakid=${item.id}`,
    publishedAt: null,
    adoptedAt: null,
    effectiveFrom: null,
    effectiveTo: null,
    eeaIncorporationStatus: "NOT_ASSESSED",
    eeaDecisionReference: null,
    eeaIncorporatedAt: null,
    eeaEffectiveFrom: null,
    norwayImplementationStatus: "NOT_ASSESSED",
    norwayImplementingReference: null,
    norwayImplementedAt: null,
    lastVerifiedAt: fetchedAt.toISOString(),
    sourceSystem: "STORTINGET_API",
    sourceEntityType: "parliamentary.case",
    sourceId: String(item.id),
    fetchedAt: fetchedAt.toISOString(),
    normalizedAt: new Date().toISOString(),
    content,
  };
}

export async function fetchStortingetCases(session: string): Promise<{
  fetchedAt: Date;
  documents: OfficialKnowledgeDocumentInput[];
}> {
  if (!/^\d{4}-\d{4}$/.test(session)) throw new Error("Sesjon må ha formatet ÅÅÅÅ-ÅÅÅÅ.");
  const url = `https://data.stortinget.no/eksport/saker?sesjonid=${encodeURIComponent(session)}&format=json`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Stortingets åpne API svarte med status ${response.status}.`);
  const payload = stortingetCasesResponseSchema.parse(await response.json());
  const fetchedAt = new Date();
  return {
    fetchedAt,
    documents: (payload.saker_liste ?? []).map((item) =>
      normalizeStortingetCase({ ...item, sak_sesjon: item.sak_sesjon ?? session }, fetchedAt),
    ),
  };
}
