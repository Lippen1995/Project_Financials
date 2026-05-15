/**
 * CLI: prepare-gold-set-shadow-data
 *
 * Kjører unified shadow extraction for alle filings i Gold set-manifestet
 * slik at ODL-resultater blir tilgjengelige i Gold set shadow batch-evalueringen.
 *
 * Problemet dette løser:
 *   - Unified shadow extraction er DISABLED som default.
 *   - Gold set shadow batch viser 0 ODL-resultater fordi ingen filing har
 *     unified shadow-artefakter lagret i DB.
 *   - Denne scripten kjører unified shadow for alle Gold set-filings med
 *     PERSIST_ARTIFACTS-mode, slik at neste `financials:run-gold-set-shadow-batch`
 *     vil ha data å sammenligne mot.
 *
 * Bruk:
 *   npx tsx scripts/prepare-gold-set-shadow-data.ts
 *   npx tsx scripts/prepare-gold-set-shadow-data.ts --manifest=output/benchmarks/annual-report-gold-set/gold-set.json
 *   npx tsx scripts/prepare-gold-set-shadow-data.ts --dry-run
 *   npx tsx scripts/prepare-gold-set-shadow-data.ts --filing-ids=id1,id2,id3
 *
 * Miljøvariabler som MÅ være satt:
 *   OPENDATALOADER_ENABLED=true
 *   OPENDATALOADER_MODE=local       (eller hybrid om hybrid-backend er oppe)
 *
 * Sikkerhet:
 *   - Påvirker ALDRI produksjonsdata, routing eller published-status.
 *   - canUseForProductionRouting er alltid false.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import type { CanonicalFactCandidate } from "@/integrations/brreg/annual-report-financials/types";
import { LocalAnnualReportArtifactStorage } from "@/server/financials/artifact-storage";
import { parseAnnualReportGoldSetManifest } from "@/server/benchmarking/annual-report-gold-set";
import { runAnnualReportUnifiedShadowExtraction } from "@/server/services/annual-report-unified-shadow-extraction-service";
import type { AnnualReportUnifiedShadowConfig } from "@/server/services/annual-report-unified-shadow-config";
import { readFlag, readListFlag } from "@/scripts/financial-script-utils";

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_MANIFEST_PATH = path.join(
  process.cwd(),
  "output",
  "benchmarks",
  "annual-report-gold-set",
  "gold-set.json",
);

const manifestPath = readFlag("manifest") ?? DEFAULT_MANIFEST_PATH;
const isDryRun = process.argv.includes("--dry-run");
const filingIdFilter = readListFlag("filing-ids");

const shadowConfig: AnnualReportUnifiedShadowConfig = {
  mode: isDryRun ? "DRY_RUN" : "PERSIST_ARTIFACTS",
  persistUnifiedParserDocument: false,
  persistUnifiedFinancialExtraction: true,
  persistUnifiedNarrativeExtraction: true,
  persistLegacyVsUnifiedComparison: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function printEnvWarnings() {
  const odlEnabled = process.env.OPENDATALOADER_ENABLED;
  const odlMode = process.env.OPENDATALOADER_MODE;

  if (!odlEnabled || odlEnabled.toLowerCase() !== "true") {
    console.warn(
      "⚠  OPENDATALOADER_ENABLED er ikke satt til 'true'. " +
      "ODL-steget i unified shadow vil bruke legacy-fallback.\n" +
      "   Sett: export OPENDATALOADER_ENABLED=true",
    );
  } else {
    console.log(`✓  OPENDATALOADER_ENABLED=${odlEnabled}`);
  }

  if (!odlMode) {
    console.warn(
      "⚠  OPENDATALOADER_MODE er ikke satt. Bruker 'local' som standard.\n" +
      "   Sett: export OPENDATALOADER_MODE=local  (eller 'hybrid' om hybrid-backend er oppe)",
    );
  } else {
    console.log(`✓  OPENDATALOADER_MODE=${odlMode}`);
  }

  console.log();
}

function pad(value: string, width: number) {
  return value.padEnd(width).slice(0, width);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== prepare-gold-set-shadow-data ===");
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Mode: ${shadowConfig.mode}`);
  if (filingIdFilter) {
    console.log(`Filing ID filter: ${filingIdFilter.join(", ")}`);
  }
  console.log();

  printEnvWarnings();

  // Load manifest
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(path.resolve(process.cwd(), manifestPath), "utf8"));
  } catch (error) {
    console.error(`Kunne ikke lese manifest: ${manifestPath}`);
    console.error((error as Error).message);
    process.exit(1);
  }

  const manifest = parseAnnualReportGoldSetManifest(raw);
  const entries = manifest.entries.filter(
    (entry) =>
      entry.filingId !== null &&
      entry.filingId !== undefined &&
      (!filingIdFilter || filingIdFilter.includes(entry.filingId)),
  );

  const skippedPlaceholders = manifest.entries.length - entries.length;
  console.log(`Gold set-manifest: ${manifest.entries.length} oppføringer`);
  console.log(`  Med filingId:     ${entries.length}`);
  if (skippedPlaceholders > 0) {
    console.log(`  Uten filingId:    ${skippedPlaceholders} (placeholder/unavailable — hoppes over)`);
  }
  console.log();

  if (entries.length === 0) {
    console.log("Ingen filings å behandle. Avslutter.");
    return;
  }

  // Load PDF storage
  const artifactStorage = new LocalAnnualReportArtifactStorage();

  const results: Array<{
    filingId: string;
    label: string;
    status: "ok" | "skipped" | "error";
    reason?: string;
    durationMs?: number;
    lineItems?: number | null;
    narratives?: number | null;
    comparisonFacts?: number | null;
  }> = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const filingId = entry.filingId!;
    const label = entry.companyName ?? entry.orgNumber ?? filingId;
    const prefix = `[${i + 1}/${entries.length}] ${pad(label, 30)} (${filingId})`;

    process.stdout.write(`${prefix} ... `);

    // Load filing from DB
    const filing = await prisma.annualReportFiling.findUnique({
      where: { id: filingId },
      include: { company: { select: { id: true, orgNumber: true, name: true } } },
    });

    if (!filing) {
      process.stdout.write("HOPPES OVER (filing ikke funnet i DB)\n");
      results.push({ filingId, label, status: "skipped", reason: "Filing ikke funnet i DB" });
      continue;
    }

    // Load PDF artifact
    const pdfArtifact = await prisma.annualReportArtifact.findFirst({
      where: { filingId, artifactType: "PDF" },
      orderBy: { createdAt: "desc" },
    });

    if (!pdfArtifact) {
      process.stdout.write("HOPPES OVER (ingen PDF-artefakt)\n");
      results.push({ filingId, label, status: "skipped", reason: "Ingen PDF-artefakt i DB" });
      continue;
    }

    // Load PDF buffer
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await artifactStorage.getArtifactBuffer(pdfArtifact.storageKey);
    } catch {
      process.stdout.write("FEIL (klarte ikke laste PDF)\n");
      results.push({ filingId, label, status: "error", reason: "Klarte ikke laste PDF fra storage" });
      continue;
    }

    // Run preflight
    let preflight;
    try {
      preflight = await preflightAnnualReportDocument(pdfBuffer);
    } catch (error) {
      process.stdout.write("FEIL (preflight feilet)\n");
      results.push({
        filingId,
        label,
        status: "error",
        reason: `Preflight feilet: ${(error as Error).message}`,
      });
      continue;
    }

    // Run unified shadow extraction
    const legacyCandidates: CanonicalFactCandidate[] = [];
    const start = Date.now();

    try {
      const result = await runAnnualReportUnifiedShadowExtraction({
        filingId,
        companyId: filing.company.id,
        orgNumber: filing.company.orgNumber,
        fiscalYear: filing.fiscalYear,
        preflight,
        legacyCandidates,
        config: shadowConfig,
        sourceCommand: "scripts/prepare-gold-set-shadow-data.ts",
      });

      const durationMs = Date.now() - start;
      const lineItems =
        result.financial?.statements.flatMap((s) => s.lineItems).length ?? null;
      const narratives = result.narrative?.sections.length ?? null;
      const comparisonFacts = result.comparison?.financialComparisons.length ?? null;

      process.stdout.write(`OK (${durationMs}ms, ${lineItems ?? "?"} linjer, ${narratives ?? "?"} narrativer)\n`);
      results.push({
        filingId,
        label,
        status: "ok",
        durationMs,
        lineItems,
        narratives,
        comparisonFacts,
      });
    } catch (error) {
      const durationMs = Date.now() - start;
      process.stdout.write(`FEIL (${(error as Error).message.slice(0, 60)})\n`);
      results.push({
        filingId,
        label,
        status: "error",
        durationMs,
        reason: (error as Error).message,
      });
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const ok = results.filter((r) => r.status === "ok");
  const skipped = results.filter((r) => r.status === "skipped");
  const errors = results.filter((r) => r.status === "error");

  console.log();
  console.log("=== Oppsummering ===");
  console.log(`  OK:       ${ok.length}`);
  console.log(`  Hoppet over: ${skipped.length}`);
  console.log(`  Feil:     ${errors.length}`);

  if (ok.length > 0) {
    const totalLines = ok.reduce((sum, r) => sum + (r.lineItems ?? 0), 0);
    const totalNarr = ok.reduce((sum, r) => sum + (r.narratives ?? 0), 0);
    console.log(`  Totalt finansielle linjer: ${totalLines}`);
    console.log(`  Totalt narrativ-seksjoner: ${totalNarr}`);
  }

  if (errors.length > 0) {
    console.log();
    console.log("Feil per filing:");
    for (const r of errors) {
      console.log(`  ${r.filingId}: ${r.reason}`);
    }
  }

  if (skipped.length > 0) {
    console.log();
    console.log("Hoppet over:");
    for (const r of skipped) {
      console.log(`  ${r.filingId}: ${r.reason}`);
    }
  }

  if (!isDryRun && ok.length > 0) {
    console.log();
    console.log("Unified shadow-artefakter er lagret i DB.");
    console.log("Kjør nå for oppdatert Gold set-rapport:");
    console.log("  npm run financials:run-gold-set-shadow-batch");
  } else if (isDryRun) {
    console.log();
    console.log("Dry-run: ingenting ble lagret i DB.");
    console.log("Kjør uten --dry-run for å lagre artefakter.");
  }
}

main()
  .catch((error) => {
    console.error("Fatal feil:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
