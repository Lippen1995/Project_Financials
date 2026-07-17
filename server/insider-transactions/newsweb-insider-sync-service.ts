import crypto from "node:crypto";

import { Prisma } from "@prisma/client";
import { PDFParse } from "pdf-parse";

import {
  fetchNewswebAttachment,
  fetchNewswebInsiderMessages,
} from "@/integrations/news/newsweb-provider";
import { prisma } from "@/lib/prisma";
import { upsertNewsSource, upsertSourceDocument } from "@/server/news/company-event-repository";
import { parseNewswebInsiderDisclosure } from "@/server/insider-transactions/newsweb-insider-parser";
import { rebuildRoleChangeAttributions } from "@/server/insider-transactions/role-change-attribution-service";

function normalizeCompanyName(value: string) {
  return value
    .toLocaleUpperCase("nb-NO")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(AS|ASA|AB|LTD|LIMITED|PLC)\b/g, " ")
    .replace(/[^A-ZÆØÅ0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveReportingPartyOrgNumber(name: string) {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;
  const firstToken = normalized.split(" ")[0];
  const candidates = await prisma.registryEntity.findMany({
    where: { name: { contains: firstToken, mode: "insensitive" } },
    select: { orgNumber: true, name: true },
    take: 100,
  });
  const matches = candidates.filter(
    (candidate) => normalizeCompanyName(candidate.name) === normalized,
  );
  return matches.length === 1 ? matches[0].orgNumber : null;
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function latestSnapshotYear(orgNumber: string) {
  const result = await prisma.shareholderRegisterHolding.aggregate({
    where: { issuerOrgNumber: orgNumber },
    _max: { taxYear: true },
  });
  return result._max.taxYear;
}

export async function syncNewswebInsiderTransactions(
  options: { limit?: number; orgNumber?: string } = {},
) {
  await upsertNewsSource({
    id: "oslobors",
    name: "Oslo Børs NewsWeb",
    sourceType: "newsweb",
    baseUrl: "https://newsweb.oslobors.no",
    country: "NO",
    language: "no",
    qualityScore: 1,
    status: "ACTIVE",
  });

  const issuers = await prisma.newsIssuerIdentity.findMany({
    where: {
      sourceSystem: "NEWSWEB",
      isActive: true,
      companyId: { not: null },
      ...(options.orgNumber ? { company: { orgNumber: options.orgNumber } } : {}),
    },
    select: {
      sourceIssuerId: true,
      company: { select: { id: true, orgNumber: true, name: true } },
    },
    orderBy: [{ lastMessagesFetchedAt: { sort: "asc", nulls: "first" } }],
    take: options.limit,
  });

  const metrics = { issuers: 0, messages: 0, transactions: 0, unresolved: 0, errors: [] as string[] };
  for (const identity of issuers) {
    const company = identity.company;
    if (!company) continue;
    const taxYear = await latestSnapshotYear(company.orgNumber);
    if (taxYear === null) continue;
    const issuerId = Number(identity.sourceIssuerId);
    if (!Number.isInteger(issuerId)) continue;

    try {
      const articles = await fetchNewswebInsiderMessages({
        issuerId,
        fromDate: new Date(Date.UTC(taxYear + 1, 0, 1)),
      });
      metrics.issuers += 1;
      metrics.messages += articles.length;

      for (const article of articles) {
        const sourceDocument = await upsertSourceDocument({
          sourceId: "oslobors",
          externalId: article.guid,
          canonicalUrl: article.url,
          originalUrl: article.url,
          title: article.title,
          summary: article.summary,
          bodyText: article.body,
          language: "no",
          publishedAt: article.publishedAt,
          fetchedAt: new Date(),
          normalizedAt: new Date(),
          sourcePayload: JSON.parse(JSON.stringify(article)) as Prisma.InputJsonValue,
        });

        const attachments = [] as Array<{ attachmentId: number; name: string; text: string }>;
        for (const attachment of article.attachments) {
          try {
            const buffer = await fetchNewswebAttachment(article.messageId, attachment.id);
            attachments.push({
              attachmentId: attachment.id,
              name: attachment.name,
              text: await extractPdfText(buffer),
            });
          } catch (error) {
            metrics.errors.push(
              `Attachment ${article.messageId}/${attachment.id}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        const parsed = parseNewswebInsiderDisclosure({
          messageId: article.messageId,
          title: article.title,
          body: article.body,
          publishedAt: article.publishedAt,
          sourceUrl: article.url,
          attachments,
        });

        if (article.correctionForMessageId) {
          await prisma.insiderTransaction.updateMany({
            where: { sourceMessageId: article.correctionForMessageId },
            data: { status: "SUPERSEDED", correctedByMessageId: article.messageId },
          });
        }

        for (const transaction of parsed) {
          const reportingPartyOrgNumber = await resolveReportingPartyOrgNumber(
            transaction.reportingPartyName,
          );
          await prisma.insiderTransaction.upsert({
            where: { sourceId: transaction.sourceId },
            update: {
              sourceDocumentId: sourceDocument.id,
              transactionDate: transaction.transactionDate,
              action: transaction.action,
              instrumentType: transaction.instrumentType,
              isin: transaction.isin,
              issuerName: transaction.issuerName,
              reportedShares: transaction.reportedShares,
              price: transaction.price,
              currency: transaction.currency,
              venue: transaction.venue,
              reportingPartyName: transaction.reportingPartyName,
              reportingPartyOrgNumber,
              primaryInsiderName: transaction.primaryInsiderName,
              primaryInsiderRole: transaction.primaryInsiderRole,
              correctionForMessageId: article.correctionForMessageId,
              correctedByMessageId: article.correctedByMessageId,
              status: article.correctedByMessageId ? "SUPERSEDED" : "ACTIVE",
              rawPayload: {
                sourceText: transaction.sourceText,
                checksum: crypto.createHash("sha256").update(transaction.sourceText).digest("hex"),
              },
              fetchedAt: new Date(),
              normalizedAt: new Date(),
            },
            create: {
              companyId: company.id,
              sourceDocumentId: sourceDocument.id,
              sourceId: transaction.sourceId,
              sourceMessageId: transaction.messageId,
              sourceAttachmentId: transaction.attachmentId,
              sourceUrl: transaction.sourceUrl,
              publishedAt: transaction.publishedAt,
              transactionDate: transaction.transactionDate,
              action: transaction.action,
              instrumentType: transaction.instrumentType,
              isin: transaction.isin,
              issuerName: transaction.issuerName,
              reportedShares: transaction.reportedShares,
              price: transaction.price,
              currency: transaction.currency,
              venue: transaction.venue,
              reportingPartyName: transaction.reportingPartyName,
              reportingPartyOrgNumber,
              primaryInsiderName: transaction.primaryInsiderName,
              primaryInsiderRole: transaction.primaryInsiderRole,
              correctionForMessageId: article.correctionForMessageId,
              correctedByMessageId: article.correctedByMessageId,
              status: article.correctedByMessageId ? "SUPERSEDED" : "ACTIVE",
              rawPayload: {
                sourceText: transaction.sourceText,
                checksum: crypto.createHash("sha256").update(transaction.sourceText).digest("hex"),
              },
              fetchedAt: new Date(),
              normalizedAt: new Date(),
            },
          });
          metrics.transactions += 1;
        }
      }

      const attribution = await rebuildRoleChangeAttributions({
        companyId: company.id,
        orgNumber: company.orgNumber,
        snapshotTaxYear: taxYear,
      });
      metrics.unresolved += attribution.unresolved;
    } catch (error) {
      metrics.errors.push(`${company.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return metrics;
}
