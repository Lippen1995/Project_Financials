import { XMLParser } from "fast-xml-parser";

import { PetroleumEventsSyncPayload, PetroleumEventSnapshot } from "@/server/services/petroleum-market-types";

const GASSCO_ROOT_URL = "https://umm.gassco.no";
const GASSCO_ATOM_FEED_URL = `${GASSCO_ROOT_URL}/atom.xml`;
const GASSCO_REALTIME_ATOM_FEED_URL = `${GASSCO_ROOT_URL}/realTimeAtom.xml`;

type AtomLinkNode =
  | {
      href?: string;
      rel?: string;
      type?: string;
    }
  | string;

type ParsedAtomFeedEntry = {
  id: string | null;
  title: string | null;
  updatedAt: Date | null;
  summary: string | null;
  content: string | null;
  detailUrl: string | null;
  rawPayload: unknown;
};

const atomParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  parseTagValue: false,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidates = ["#text", "__text", "text"];

  for (const key of candidates) {
    if (typeof record[key] === "string") {
      const normalized = record[key].trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }

  return null;
}

function asDate(value: unknown): Date | null {
  const text = asText(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toAbsoluteUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, GASSCO_ROOT_URL).toString();
  } catch {
    return null;
  }
}

function pickEntryLink(value: unknown) {
  for (const candidate of asArray(value as AtomLinkNode | AtomLinkNode[] | undefined)) {
    if (typeof candidate === "string") {
      const absolute = toAbsoluteUrl(candidate);
      if (absolute) {
        return absolute;
      }

      continue;
    }

    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const href = typeof candidate.href === "string" ? candidate.href : null;
    const rel = typeof candidate.rel === "string" ? candidate.rel : null;
    if (!href) {
      continue;
    }

    if (!rel || rel === "alternate" || rel === "self") {
      const absolute = toAbsoluteUrl(href);
      if (absolute) {
        return absolute;
      }
    }
  }

  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchFeedXml(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Gassco feed request failed with status ${response.status} for ${url}`);
  }

  return response.text();
}

export function parseGasscoAtomFeed(xml: string): ParsedAtomFeedEntry[] {
  const parsed = atomParser.parse(xml) as { feed?: { entry?: unknown } };
  const entries = asArray(parsed.feed?.entry as Record<string, unknown> | Array<Record<string, unknown>> | undefined);

  return entries.map((entry) => ({
    id: asText(entry.id),
    title: asText(entry.title),
    updatedAt: asDate(entry.updated),
    summary: asText(entry.summary),
    content: asText(entry.content),
    detailUrl: pickEntryLink(entry.link),
    rawPayload: entry,
  }));
}

function createSourceMetadata(sourceEntityType: string, sourceId: string, rawPayload: unknown) {
  const now = new Date();

  return {
    sourceSystem: "GASSCO",
    sourceEntityType,
    sourceId,
    fetchedAt: now,
    normalizedAt: now,
    rawPayload,
  };
}

function mapRealtimeEntryToEvent(entry: ParsedAtomFeedEntry): PetroleumEventSnapshot {
  const title = entry.title ?? "Exit nomination";
  const match = /^Exit Nomination\s+(.+?)\s+\(([^)]+)\)$/i.exec(title);
  const assetName = match?.[1]?.trim() || title;
  const unit = match?.[2]?.trim() || null;
  const rawValue = entry.content ?? entry.summary ?? null;
  const numericValue = rawValue ? Number(rawValue.replace(",", ".")) : null;
  const formattedValue =
    rawValue && unit ? `${rawValue} ${unit}` : rawValue ?? "Ikke tilgjengelig";

  return {
    externalId: `gassco-realtime-${slugify(entry.id ?? title)}`,
    source: "GASSCO",
    eventType: "REALTIME_NOMINATION",
    title: `Sanntidsnominering ${assetName}`,
    summary: `${formattedValue}${entry.updatedAt ? `, oppdatert ${entry.updatedAt.toISOString()}` : ""}`,
    publishedAt: entry.updatedAt,
    detailUrl: GASSCO_REALTIME_ATOM_FEED_URL,
    entityType: null,
    entityNpdId: null,
    entityName: assetName,
    relatedCompanyName: "Gassco AS",
    relatedCompanyOrgNumber: null,
    relatedCompanySlug: null,
    geometry: null,
    centroid: null,
    tags: ["real-time", "nomination", unit].filter((value): value is string => Boolean(value)),
    metrics: {
      assetName,
      unit,
      value: Number.isFinite(numericValue ?? Number.NaN) ? numericValue : null,
      rawValue,
      feed: "realTimeAtom.xml",
    },
    ...createSourceMetadata("real_time_atom_feed", entry.id ?? title, entry.rawPayload),
  };
}

function mapUmmEntryToEvent(entry: ParsedAtomFeedEntry): PetroleumEventSnapshot {
  const title = entry.title ?? "Gassco UMM";
  const summary = entry.summary ?? entry.content ?? null;

  return {
    externalId: `gassco-umm-${slugify(entry.id ?? title)}`,
    source: "GASSCO",
    eventType: "UMM_ATOM_EVENT",
    title,
    summary,
    publishedAt: entry.updatedAt,
    detailUrl: entry.detailUrl ?? GASSCO_ATOM_FEED_URL,
    entityType: null,
    entityNpdId: null,
    entityName: null,
    relatedCompanyName: "Gassco AS",
    relatedCompanyOrgNumber: null,
    relatedCompanySlug: null,
    geometry: null,
    centroid: null,
    tags: ["umm-feed"],
    metrics: null,
    ...createSourceMetadata("atom_feed", entry.id ?? title, entry.rawPayload),
  };
}

export function mapGasscoRealtimeEntriesToEvents(entries: ParsedAtomFeedEntry[]) {
  return entries.map(mapRealtimeEntryToEvent);
}

export function mapGasscoUmmEntriesToEvents(entries: ParsedAtomFeedEntry[]) {
  return entries.map(mapUmmEntryToEvent);
}

export async function fetchGasscoPetroleumEvents(): Promise<PetroleumEventsSyncPayload> {
  const [realtimeResult, ummResult] = await Promise.allSettled([
    fetchFeedXml(GASSCO_REALTIME_ATOM_FEED_URL),
    fetchFeedXml(GASSCO_ATOM_FEED_URL),
  ]);

  if (realtimeResult.status === "rejected" && ummResult.status === "rejected") {
    throw new Error("Gassco feeds could not be fetched.");
  }

  const realtimeEntries =
    realtimeResult.status === "fulfilled" ? parseGasscoAtomFeed(realtimeResult.value) : [];
  const ummEntries = ummResult.status === "fulfilled" ? parseGasscoAtomFeed(ummResult.value) : [];

  const realtimeEvents = mapGasscoRealtimeEntriesToEvents(realtimeEntries);
  const ummEvents = mapGasscoUmmEntriesToEvents(ummEntries);

  const messageParts = [
    realtimeEvents.length > 0
      ? `Sanntidsnomineringer hentes fra ${GASSCO_REALTIME_ATOM_FEED_URL}.`
      : "Sanntidsnomineringer var ikke tilgjengelige i siste Gassco-sync.",
  ];

  if (ummResult.status === "fulfilled") {
    messageParts.push(
      ummEvents.length > 0
        ? `UMM Atom-feed-en leverte ${ummEvents.length} generelle entries i samme sync.`
        : "Den generelle UMM Atom-feed-en var tom i siste sync.",
    );
  } else {
    messageParts.push("Den generelle UMM Atom-feed-en kunne ikke verifiseres i siste sync.");
  }

  return {
    events: [...realtimeEvents, ...ummEvents],
    availabilityMessage: messageParts.join(" "),
  };
}
