import type { ReportedChangeAction } from "@/server/insider-transactions/reported-change-window";

export type ParsedInsiderTransaction = {
  sourceId: string;
  messageId: number;
  attachmentId: number | null;
  sourceUrl: string;
  publishedAt: Date;
  transactionDate: Date;
  action: ReportedChangeAction;
  instrumentType: "SHARE" | "OTHER";
  isin: string | null;
  issuerName: string | null;
  reportedShares: bigint;
  price: string | null;
  currency: string | null;
  venue: string | null;
  reportingPartyName: string;
  primaryInsiderName: string;
  primaryInsiderRole: string | null;
  sourceText: string;
};

export type NewswebDisclosureForParsing = {
  messageId: number;
  title: string;
  body: string | null;
  publishedAt: Date;
  sourceUrl: string;
  attachments: Array<{ attachmentId: number; name: string; text: string }>;
};

function lineValue(text: string, label: RegExp) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const sameLine = lines[index].match(label);
    if (!sameLine) continue;
    const captured = sameLine[1]?.trim();
    if (captured) return captured;
    return lines[index + 1]?.trim() || null;
  }
  return null;
}

function parseNorwegianDate(value: string | null) {
  const match = value?.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const date = new Date(`${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInteger(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/[\s.,]/g, "");
  return /^\d+$/.test(normalized) ? BigInt(normalized) : null;
}

function normalizePrice(value: string | null) {
  if (!value) return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
}

function actionFrom(value: string | null): ReportedChangeAction {
  const normalized = value?.toLocaleLowerCase("nb-NO") ?? "";
  if (normalized.includes("kjøp") || normalized.includes("purchase")) return "PURCHASE";
  if (normalized.includes("salg") || normalized.includes("sale") || normalized.includes("disposal")) return "SALE";
  if (normalized.includes("tegning") || normalized.includes("subscription")) return "SUBSCRIPTION";
  return "OTHER";
}

function isOrdinaryShare(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return /^(?:aksje|aksjer|ordinær(?:e)? aksje(?:r)?|share|shares|ordinary shares?)$/i.test(
    normalized,
  );
}

function parseKrtAttachment(
  input: NewswebDisclosureForParsing,
  attachment: NewswebDisclosureForParsing["attachments"][number],
): ParsedInsiderTransaction | null {
  const text = attachment.text;
  const transactionDate = parseNorwegianDate(
    lineValue(text, /2\.9\.1\s+Angi dato\s*:?[ \t]*(.*)$/i),
  );
  const reportedShares = parseInteger(
    lineValue(text, /2\.8\.2\s+Aggregert volum\s*:?[ \t]*(.*)$/i),
  );
  const reporterName = lineValue(text, /1\.2\.1\s+Rapportør(?:e|s|es)?\s+Navn\s*(.*)$/i);
  const primaryInsiderName =
    lineValue(text, /1\.4\.2\s+Fullt navn\s*(.*)$/i) ?? reporterName;
  const reportingCompany = lineValue(text, /1\.2\.2\s+Rapportør(?:e|s|es)?\s+Foretaksnavn\s*(.*)$/i);
  if (!transactionDate || reportedShares === null || !primaryInsiderName) return null;
  const action = actionFrom(lineValue(text, /2\.4\.1\s+Transaksjonstype\s*:?[ \t]*(.*)$/i));
  const instrumentType = isOrdinaryShare(
    lineValue(text, /2\.3\.1\s+Instrument\s*:?[ \t]*(.*)$/i),
  )
    ? "SHARE"
    : "OTHER";
  if (action === "OTHER" || instrumentType === "OTHER") return null;

  return {
    sourceId: `newsweb:${input.messageId}:${attachment.attachmentId}`,
    messageId: input.messageId,
    attachmentId: attachment.attachmentId,
    sourceUrl: input.sourceUrl,
    publishedAt: input.publishedAt,
    transactionDate,
    action,
    instrumentType,
    isin: lineValue(text, /2\.3\.2\s+ISIN-kode\s*:?[ \t]*(.*)$/i),
    issuerName: lineValue(text, /2\.3\.2\.1\s+Utstedernavn\s*:?[ \t]*(.*)$/i),
    reportedShares,
    price: normalizePrice(lineValue(text, /2\.8\.1\s+Gjennomsnittlig pris per enhet\s*:?[ \t]*(.*)$/i)),
    currency: lineValue(text, /2\.6\.1\s+Valuta\s*:?[ \t]*(.*)$/i),
    venue: lineValue(text, /2\.10\.1\s+Handelsplass\s*:?[ \t]*(.*)$/i),
    reportingPartyName:
      reportingCompany && !/ikke lagt inn informasjon/i.test(reportingCompany)
        ? reportingCompany
        : reporterName ?? primaryInsiderName,
    primaryInsiderName,
    primaryInsiderRole: lineValue(text, /1\.4\.4\s+Stilling\/Rolle\s*(.*)$/i),
    sourceText: text,
  };
}

function cleanBody(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBodyFallback(input: NewswebDisclosureForParsing): ParsedInsiderTransaction | null {
  if (!input.body) return null;
  const body = cleanBody(input.body);
  const transaction = body.match(
    /^(?<party>.+?)(?:,\s+(?:a\s+)?close associate of\s+(?<pdmr>.+?)(?:,|\s+on))?.{0,180}?\b(?<action>purchased|bought|sold|disposed of)\s+(?<volume>[\d\s,.]+)\s+shares?/i,
  );
  const dateMatch = body.match(/\bon\s+(?<date>[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i);
  if (!transaction?.groups || !dateMatch?.groups?.date) return null;
  const transactionDate = new Date(dateMatch.groups.date.replace(/(\d)(st|nd|rd|th)/i, "$1"));
  const reportedShares = parseInteger(transaction.groups.volume);
  if (Number.isNaN(transactionDate.getTime()) || reportedShares === null) return null;

  const party = transaction.groups.party.trim();
  return {
    sourceId: `newsweb:${input.messageId}:body:0`,
    messageId: input.messageId,
    attachmentId: null,
    sourceUrl: input.sourceUrl,
    publishedAt: input.publishedAt,
    transactionDate: new Date(`${transactionDate.toISOString().slice(0, 10)}T00:00:00.000Z`),
    action: /sold|disposed/i.test(transaction.groups.action) ? "SALE" : "PURCHASE",
    instrumentType: "SHARE",
    isin: null,
    issuerName: null,
    reportedShares,
    price: null,
    currency: null,
    venue: null,
    reportingPartyName: party,
    primaryInsiderName: transaction.groups.pdmr?.trim() ?? party,
    primaryInsiderRole: null,
    sourceText: body,
  };
}

export function parseNewswebInsiderDisclosure(input: NewswebDisclosureForParsing) {
  const parsed = input.attachments.flatMap((attachment) => {
    const transaction = parseKrtAttachment(input, attachment);
    return transaction ? [transaction] : [];
  });
  if (parsed.length > 0) {
    const bodyVolume = input.body?.match(/(?:purchased|bought|sold|kjøpt|solgt)\s+([\d\s,.]+)\s+(?:shares|aksjer)/i)?.[1];
    const expectedVolume = parseInteger(bodyVolume ?? null);
    if (expectedVolume !== null && parsed.some((transaction) => transaction.reportedShares !== expectedVolume)) {
      return [];
    }
    return parsed;
  }
  const fallback = parseBodyFallback(input);
  return fallback ? [fallback] : [];
}
