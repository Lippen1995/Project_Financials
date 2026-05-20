/**
 * Extraction Few-Shot Retrieval Service
 *
 * Given a filing about to be extracted (or any extraction task), this service
 * looks up a small set of past filings that:
 *  - are in the same industry (or closest match)
 *  - have human-approved values for the target metrics
 *
 * The returned examples can be fed into a prompt as "look how this case was
 * handled" guidance. The service is engine-agnostic — it does not assume any
 * particular LLM. Production extraction wiring (where the retrieved examples
 * are actually injected into a prompt) is a separate change deferred until the
 * extractor uses an LLM-based path.
 *
 * For reviewers (business view):
 *  - The library grows automatically as reviewers approve or correct facts.
 *  - The "library inventory" view on the dashboard shows how many examples
 *    are available per industry — useful for spotting under-represented
 *    sectors where retrieval can't help yet.
 *  - No filing data is exposed to external systems by this service. Examples
 *    are read from your own database only.
 */
import { PdfTrainingLabelType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_MAX_EXAMPLES = 5;
const MIN_INDUSTRY_EXAMPLES_FOR_MILESTONE = 100;

export type FewShotExample = {
  filingId: string;
  companyName: string | null;
  orgNumber: string | null;
  fiscalYear: number;
  industryCode: string | null;
  industryTitle: string | null;
  // The actual fact value approved by the reviewer.
  approvedValue: unknown;
  // The machine value that was proposed before correction (may equal approved
  // if reviewer accepted as-is).
  proposedValue: unknown;
  // What the label targets (metric key, year, page).
  targetRef: unknown;
  approvedAt: Date;
};

export type FewShotRetrievalRequest = {
  /** Industry code to match. Pass null to retrieve across all industries. */
  industryCode: string | null;
  /** Optional: filter to examples for one specific metric. */
  metricKey?: string;
  /** Max examples to return. Defaults to 5. */
  limit?: number;
  /** Exclude examples from a specific filing (e.g. the filing being extracted). */
  excludeFilingId?: string;
};

/**
 * Returns the best-matching examples for the given retrieval request.
 *
 * Match strategy (in order):
 *   1. Exact industry-code match → most-recent N examples
 *   2. Same industry prefix (first 2 digits) → most-recent N examples
 *   3. Any industry → most-recent N examples
 *
 * The hop-out fallback is conservative — we'd rather return slightly less
 * relevant examples than zero examples.
 */
export async function retrieveFewShotExamples(
  request: FewShotRetrievalRequest,
): Promise<FewShotExample[]> {
  const limit = request.limit ?? DEFAULT_MAX_EXAMPLES;

  const baseQuery = async (industryWhere: Record<string, unknown>): Promise<FewShotExample[]> => {
    const labels = await prisma.pdfTrainingLabel.findMany({
      where: {
        labelType: PdfTrainingLabelType.FACT_VALUE,
        acceptedValue: { not: { equals: null as never } },
        ...(request.excludeFilingId ? { filingId: { not: request.excludeFilingId } } : {}),
        ...(request.metricKey
          ? {
              targetRef: {
                path: ["metricKey"],
                equals: request.metricKey,
              },
            }
          : {}),
        // Filter labels by industry by joining on Filing → Company → IndustryCode.
        // We can't filter on a relation's relation directly in Prisma, so we use
        // a sub-query via a raw filing-id list when an industry filter is active.
      },
      orderBy: { createdAt: "desc" },
      take: limit * 3, // over-fetch so industry post-filter can pick the best
      select: {
        filingId: true,
        targetRef: true,
        proposedValue: true,
        acceptedValue: true,
        createdAt: true,
      },
    });
    if (labels.length === 0) return [];

    const filings = await prisma.annualReportFiling.findMany({
      where: {
        id: { in: labels.map((l) => l.filingId) },
      },
      select: {
        id: true,
        fiscalYear: true,
        company: {
          select: {
            name: true,
            orgNumber: true,
            industryCodeId: true,
            industryCode: { select: { code: true, title: true } },
          },
        },
      },
    });
    const filingMap = new Map(filings.map((f) => [f.id, f]));

    const examples: FewShotExample[] = [];
    for (const label of labels) {
      const filing = filingMap.get(label.filingId);
      if (!filing) continue;
      const code = filing.company.industryCode?.code ?? null;

      if (industryWhere.code && code !== industryWhere.code) continue;
      if (industryWhere.prefix && (!code || !code.startsWith(String(industryWhere.prefix)))) continue;

      examples.push({
        filingId: label.filingId,
        companyName: filing.company.name,
        orgNumber: filing.company.orgNumber,
        fiscalYear: filing.fiscalYear,
        industryCode: code,
        industryTitle: filing.company.industryCode?.title ?? null,
        approvedValue: label.acceptedValue,
        proposedValue: label.proposedValue,
        targetRef: label.targetRef,
        approvedAt: label.createdAt,
      });
      if (examples.length >= limit) break;
    }
    return examples;
  };

  if (request.industryCode) {
    const exact = await baseQuery({ code: request.industryCode });
    if (exact.length >= limit) return exact;

    const prefix = request.industryCode.slice(0, 2);
    const broader = await baseQuery({ prefix });
    // Merge while keeping order: exact matches first, then broader matches
    // we have not already added.
    const seen = new Set(exact.map((e) => e.filingId));
    const merged = [...exact];
    for (const example of broader) {
      if (seen.has(example.filingId)) continue;
      seen.add(example.filingId);
      merged.push(example);
      if (merged.length >= limit) break;
    }
    if (merged.length >= limit) return merged;

    const anyIndustry = await baseQuery({});
    for (const example of anyIndustry) {
      if (seen.has(example.filingId)) continue;
      seen.add(example.filingId);
      merged.push(example);
      if (merged.length >= limit) break;
    }
    return merged;
  }

  return baseQuery({});
}

export type IndustryLibraryEntry = {
  industryCode: string;
  industryTitle: string;
  exampleCount: number;
  hasMilestone: boolean;
};

/**
 * Returns counts of approved examples per industry, sorted descending.
 * Used by the dashboard to show "how much training data we have per sector".
 */
export async function getFewShotLibraryInventory(): Promise<IndustryLibraryEntry[]> {
  // Step 1: pull all approved labels and their filing ids.
  const labels = await prisma.pdfTrainingLabel.findMany({
    where: {
      labelType: PdfTrainingLabelType.FACT_VALUE,
      acceptedValue: { not: { equals: null as never } },
    },
    select: { filingId: true },
  });
  if (labels.length === 0) return [];

  const filingIds = Array.from(new Set(labels.map((l) => l.filingId)));
  const filings = await prisma.annualReportFiling.findMany({
    where: { id: { in: filingIds } },
    select: {
      id: true,
      company: {
        select: {
          industryCode: { select: { code: true, title: true } },
        },
      },
    },
  });

  const filingToIndustry = new Map<string, { code: string; title: string }>();
  for (const filing of filings) {
    const ic = filing.company.industryCode;
    if (!ic) continue;
    filingToIndustry.set(filing.id, { code: ic.code, title: ic.title });
  }

  const counts = new Map<string, IndustryLibraryEntry>();
  for (const label of labels) {
    const industry = filingToIndustry.get(label.filingId);
    if (!industry) continue;
    const existing = counts.get(industry.code);
    if (existing) {
      existing.exampleCount += 1;
    } else {
      counts.set(industry.code, {
        industryCode: industry.code,
        industryTitle: industry.title,
        exampleCount: 1,
        hasMilestone: false,
      });
    }
  }

  const inventory = Array.from(counts.values()).map((entry) => ({
    ...entry,
    hasMilestone: entry.exampleCount >= MIN_INDUSTRY_EXAMPLES_FOR_MILESTONE,
  }));
  inventory.sort((a, b) => b.exampleCount - a.exampleCount);
  return inventory;
}

export const FEW_SHOT_MILESTONE_THRESHOLD = MIN_INDUSTRY_EXAMPLES_FOR_MILESTONE;
