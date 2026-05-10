import { z } from "zod";

import { inferTagHintsFromStoredFiling } from "@/server/benchmarking/annual-report-shadow-batch";
import { listAnnualReportFilingsForShadowSelection } from "@/server/persistence/annual-report-ingestion-repository";

export const GO_LIVE_GOLD_SET_TAGS = [
  "digital_simple",
  "digital_note_heavy",
  "multi_page_balance",
  "supplementary_present",
  "unit_scale_sensitive",
  "scan_or_ocr",
  "ocr_token_noise",
  "formatting_edge",
  "manual_review_expected",
  "degraded_ambiguous",
  "continuation_complex",
] as const;

const goldSetEntrySchema = z.object({
  orgNumber: z.string().min(1).nullable(),
  companyName: z.string().min(1).nullable().optional(),
  accountingYear: z.number().int().nullable(),
  filingId: z.string().min(1).nullable().optional(),
  artifactDocumentReference: z.string().min(1).nullable().optional(),
  expectedTags: z.array(z.string().min(1)).min(1),
  evidenceType: z.enum(["live_local", "persisted_artifact", "fixture_only", "unavailable"]),
  reasonForInclusion: z.string().min(1),
  knownRisks: z.array(z.string().min(1)).default([]),
  allowDuplicateOrgYear: z.boolean().default(false),
});

const goldSetManifestSchema = z.object({
  version: z.literal("annual-report-go-live-gold-set-v1"),
  name: z.string().min(1),
  generatedAt: z.string(),
  entries: z.array(goldSetEntrySchema).min(1),
});

export type AnnualReportGoldSetEntry = z.infer<typeof goldSetEntrySchema>;
export type AnnualReportGoldSetManifest = z.infer<typeof goldSetManifestSchema>;

export type AnnualReportGoldSetValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  coverageByTag: Record<string, number>;
  evidenceQualitySummary: Record<AnnualReportGoldSetEntry["evidenceType"], number>;
  productionReady: boolean;
};

export function parseAnnualReportGoldSetManifest(raw: unknown) {
  return goldSetManifestSchema.parse(raw);
}

function tagCoverage(entries: AnnualReportGoldSetEntry[]) {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    for (const tag of entry.expectedTags) {
      acc[tag] = (acc[tag] ?? 0) + 1;
    }
    return acc;
  }, {});
}

export function validateAnnualReportGoldSetManifest(
  manifestInput: AnnualReportGoldSetManifest,
): AnnualReportGoldSetValidationResult {
  const manifest = parseAnnualReportGoldSetManifest(manifestInput);
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenFilingIds = new Set<string>();
  const seenOrgYears = new Set<string>();

  for (const entry of manifest.entries) {
    if (entry.filingId) {
      if (seenFilingIds.has(entry.filingId)) {
        errors.push(`Duplicate filingId detected: ${entry.filingId}`);
      }
      seenFilingIds.add(entry.filingId);
    }

    if (!entry.allowDuplicateOrgYear && entry.orgNumber && entry.accountingYear !== null) {
      const orgYearKey = `${entry.orgNumber}:${entry.accountingYear}`;
      if (seenOrgYears.has(orgYearKey)) {
        errors.push(`Duplicate org/year detected without allowDuplicateOrgYear: ${orgYearKey}`);
      }
      seenOrgYears.add(orgYearKey);
    }
  }

  const coverageByTag = tagCoverage(manifest.entries);
  for (const tag of GO_LIVE_GOLD_SET_TAGS) {
    if (!coverageByTag[tag]) {
      warnings.push(`No gold-set entry covers required tag ${tag}.`);
    }
  }

  const evidenceQualitySummary = manifest.entries.reduce<
    Record<AnnualReportGoldSetEntry["evidenceType"], number>
  >(
    (acc, entry) => {
      acc[entry.evidenceType] += 1;
      return acc;
    },
    {
      live_local: 0,
      persisted_artifact: 0,
      fixture_only: 0,
      unavailable: 0,
    },
  );

  if (evidenceQualitySummary.fixture_only > 0) {
    warnings.push("Gold-set still contains fixture_only entries.");
  }
  if (evidenceQualitySummary.unavailable > 0) {
    warnings.push("Gold-set still contains unavailable entries.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    coverageByTag,
    evidenceQualitySummary,
    productionReady:
      errors.length === 0 &&
      evidenceQualitySummary.fixture_only === 0 &&
      evidenceQualitySummary.unavailable === 0 &&
      GO_LIVE_GOLD_SET_TAGS.every((tag) => (coverageByTag[tag] ?? 0) > 0),
  };
}

export async function generateRepresentativeAnnualReportGoldSetManifest(input?: {
  name?: string;
  limitPerTag?: number;
}) {
  const filings = await listAnnualReportFilingsForShadowSelection({
    onlyLatest: true,
    requirePdfArtifact: false,
    limit: 250,
  });

  const limitPerTag = Math.max(input?.limitPerTag ?? 1, 1);
  const selected: AnnualReportGoldSetEntry[] = [];
  const usedFilings = new Set<string>();

  for (const tag of GO_LIVE_GOLD_SET_TAGS) {
    const matches = filings
      .map((filing) => ({
        filing,
        tags: inferTagHintsFromStoredFiling(filing),
      }))
      .filter(({ filing, tags }) => !usedFilings.has(filing.id) && tags.includes(tag))
      .slice(0, limitPerTag);

    if (matches.length === 0) {
      selected.push({
        orgNumber: null,
        companyName: null,
        accountingYear: null,
        filingId: null,
        artifactDocumentReference: null,
        expectedTags: [tag],
        evidenceType: "unavailable",
        reasonForInclusion: `No persisted filing currently covers tag ${tag} in the local environment.`,
        knownRisks: ["TODO: replace unavailable placeholder with a real filing before go-live review."],
        allowDuplicateOrgYear: false,
      });
      continue;
    }

    for (const match of matches) {
      usedFilings.add(match.filing.id);
      const pdfArtifact = match.filing.artifacts.find((artifact) => artifact.artifactType === "PDF");
      selected.push({
        orgNumber: match.filing.company.orgNumber,
        companyName: match.filing.company.name,
        accountingYear: match.filing.fiscalYear,
        filingId: match.filing.id,
        artifactDocumentReference: pdfArtifact?.storageKey ?? null,
        expectedTags: match.tags,
        evidenceType: pdfArtifact ? "persisted_artifact" : "live_local",
        reasonForInclusion: `Representative persisted filing selected for tag ${tag}.`,
        knownRisks:
          match.filing.reviews[0]?.latestActionNote
            ? [match.filing.reviews[0].latestActionNote]
            : [],
        allowDuplicateOrgYear: false,
      });
    }
  }

  return parseAnnualReportGoldSetManifest({
    version: "annual-report-go-live-gold-set-v1",
    name: input?.name ?? "annual-report-go-live-gold-set",
    generatedAt: new Date().toISOString(),
    entries: selected,
  });
}

export function renderAnnualReportGoldSetManifestMarkdown(
  manifestInput: AnnualReportGoldSetManifest,
  validation = validateAnnualReportGoldSetManifest(manifestInput),
) {
  const manifest = parseAnnualReportGoldSetManifest(manifestInput);
  const lines = [
    "# Annual-report go-live gold-set",
    "",
    `Generated at: ${manifest.generatedAt}`,
    `Name: ${manifest.name}`,
    `Entries: ${manifest.entries.length}`,
    `Production ready: ${validation.productionReady ? "yes" : "no"}`,
    "",
    "## Coverage",
    "",
    ...GO_LIVE_GOLD_SET_TAGS.map((tag) => `- ${tag}: ${validation.coverageByTag[tag] ?? 0}`),
    "",
    "## Evidence quality",
    "",
    `- live_local: ${validation.evidenceQualitySummary.live_local}`,
    `- persisted_artifact: ${validation.evidenceQualitySummary.persisted_artifact}`,
    `- fixture_only: ${validation.evidenceQualitySummary.fixture_only}`,
    `- unavailable: ${validation.evidenceQualitySummary.unavailable}`,
    "",
    "## Diagnostics",
    "",
    ...(validation.errors.length > 0 ? validation.errors.map((error) => `- ERROR: ${error}`) : ["- No validation errors."]),
    ...(validation.warnings.length > 0
      ? validation.warnings.map((warning) => `- WARN: ${warning}`)
      : ["- No validation warnings."]),
    "",
    "## Entries",
    "",
  ];

  for (const entry of manifest.entries) {
    lines.push(
      `- ${entry.filingId ?? "placeholder"} | ${entry.orgNumber ?? "n/a"} | ${entry.accountingYear ?? "n/a"} | ${entry.evidenceType} | ${entry.expectedTags.join(", ")} | ${entry.reasonForInclusion}`,
    );
  }

  return lines.join("\n");
}
