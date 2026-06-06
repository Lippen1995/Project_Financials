/**
 * Leave-one-out generalization check for the fasit-bootstrapped aliases.
 *
 * The alias bootstrap learns rawLabel->metricKey from the published fasit. The
 * full eval measures on the SAME filings the aliases came from (a ceiling, with
 * circularity). This holds each company OUT: derive aliases from the OTHER
 * company only, then measure the held-out one. If recall stays high, the
 * aliases generalize across companies; if it collapses, they were overfit.
 *
 * Base registry (the original MetricAlias rows, before the bootstrap) is always
 * included; only the held-out company's OWN fasit-derived aliases are removed.
 *
 * Usage: npx tsx scripts/eval-leave-one-out.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

import { prisma } from "@/lib/prisma";
import { normalizeNorwegianText } from "@/integrations/brreg/annual-report-financials/text";
import { extractOcrPages } from "@/integrations/brreg/annual-report-financials/ocr";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  detectYearColumnAnchorsForPage,
  reconstructStatementRowsGeometryFirst,
  type ColumnAnchor,
} from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";
import { mapRowsToCanonicalFacts } from "@/integrations/brreg/annual-report-financials/canonical-mapping";
import type { MetricDefinition } from "@/integrations/brreg/annual-report-financials/taxonomy";
import type { ReconstructedRow } from "@/integrations/brreg/annual-report-financials/types";
import { compareFactsToFasit, type AccuracyFact } from "@/server/services/extraction-accuracy-service";

const ARTIFACTS_DIR = "C:/Users/simen/Project_Financials/output/annual-report-artifacts";
const DEL1_MAX_PAGE = 15;
const STATUTORY = new Set(["STATUTORY_INCOME", "STATUTORY_BALANCE", "STATUTORY_BALANCE_CONTINUATION"]);
const COMPANIES = [
  { org: "938701237", name: "CANICA" },
  { org: "918298037", name: "PROFF" },
];

function familyOf(t: string) {
  return t === "INCOME_STATEMENT" ? "INCOME_STATEMENT" : t === "BALANCE_SHEET" ? "BALANCE_SHEET" : t === "NOTE" ? "NOTE" : null;
}
function cleanAlias(raw: string) {
  return raw.replace(/\s+\d[\d.,]*\s*$/g, "").replace(/[.,;:]+$/g, "").replace(/\s+/g, " ").trim();
}

/** Derive the (metricKey, family, normalizedAlias, rawAlias) set from a company's fasit. */
async function derivedAliasesFor(companyId: string) {
  const facts = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId, rawLabel: { not: null } },
    select: { metricKey: true, rawLabel: true, statementType: true },
  });
  const out = new Map<string, { metricKey: string; family: string; alias: string; norm: string }>();
  for (const f of facts) {
    const family = familyOf(f.statementType);
    if (!family) continue;
    const alias = cleanAlias(f.rawLabel!);
    const norm = normalizeNorwegianText(alias);
    if (norm.length < 4 || /^\d/.test(norm)) continue;
    out.set(`${f.metricKey}::${family}::${norm}`, { metricKey: f.metricKey, family, alias, norm });
  }
  return out;
}

function buildDefinitions(rows: Array<{ metricKey: string; statementFamily: string; alias: string; liabilitySection: string | null }>): MetricDefinition[] {
  const byDef = new Map<string, MetricDefinition>();
  for (const r of rows) {
    const ls = (r.liabilitySection as MetricDefinition["liabilitySection"]) ?? undefined;
    const k = `${r.metricKey}::${ls ?? ""}`;
    let d = byDef.get(k);
    if (!d) {
      d = { key: r.metricKey as MetricDefinition["key"], statementFamily: r.statementFamily as MetricDefinition["statementFamily"], aliases: [], ...(ls ? { liabilitySection: ls } : {}) };
      byDef.set(k, d);
    }
    d.aliases.push(r.alias);
  }
  return [...byDef.values()];
}

async function extractFacts(buf: Buffer, fiscalYear: number, definitions: MetricDefinition[]) {
  const parser = new PDFParse({ data: buf });
  const total = ((await parser.getInfo()) as { total?: number }).total ?? 0;
  await parser.destroy();
  const ocr = await extractOcrPages(buf, Array.from({ length: Math.min(total, DEL1_MAX_PAGE) }, (_, i) => i + 1));
  const cls = classifyPages(ocr);
  const byPage = new Map(cls.map((c) => [c.pageNumber, c]));
  const stat = new Set(cls.filter((c) => STATUTORY.has(c.type)).map((c) => c.pageNumber));
  let last: ColumnAnchor[] | undefined;
  const rows: ReconstructedRow[] = [];
  for (const p of [...ocr].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const c = byPage.get(p.pageNumber);
    if (!c || !stat.has(p.pageNumber)) continue;
    const own = detectYearColumnAnchorsForPage(p);
    if (own.length >= 2) last = own;
    rows.push(...reconstructStatementRowsGeometryFirst(p, c, own.length >= 2 ? undefined : last));
  }
  const mapped = mapRowsToCanonicalFacts({ filingFiscalYear: fiscalYear, classifications: cls, rows, definitions, emitComparativeYears: true });
  const facts: AccuracyFact[] = mapped.facts.filter((f) => stat.has(f.sourcePage)).map((f) => ({ metricKey: f.metricKey, statementScope: f.statementScope, fiscalYear: f.fiscalYear, value: String(Math.round(f.value)) }));
  return { facts, stat };
}

async function main() {
  // Resolve companies + filings.
  const resolved = [];
  for (const c of COMPANIES) {
    const company = await prisma.company.findFirst({ where: { orgNumber: c.org }, select: { id: true } });
    if (!company) continue;
    const filing = await prisma.annualReportFiling.findFirst({ where: { companyId: company.id, fiscalYear: 2024 }, select: { id: true } });
    if (!filing) continue;
    resolved.push({ ...c, companyId: company.id, filingId: filing.id });
  }

  const derivedByCompany = new Map<string, Awaited<ReturnType<typeof derivedAliasesFor>>>();
  for (const r of resolved) derivedByCompany.set(r.companyId, await derivedAliasesFor(r.companyId));
  const allDerived = new Set<string>();
  for (const m of derivedByCompany.values()) for (const k of m.keys()) allDerived.add(k);

  // Base MetricAlias rows = current DB rows that are NOT fasit-derived.
  const dbRows = await prisma.metricAlias.findMany({ where: { isActive: true }, select: { metricKey: true, alias: true, normalizedAlias: true, statementFamily: true, liabilitySection: true } });
  const baseRows = dbRows.filter((r) => !allDerived.has(`${r.metricKey}::${r.statementFamily}::${r.normalizedAlias}`));

  for (const held of resolved) {
    // Aliases from every OTHER company.
    const otherRows: typeof baseRows = [];
    for (const [cid, m] of derivedByCompany) {
      if (cid === held.companyId) continue;
      for (const d of m.values()) otherRows.push({ metricKey: d.metricKey, alias: d.alias, normalizedAlias: d.norm, statementFamily: d.family, liabilitySection: null });
    }
    const definitions = buildDefinitions([...baseRows, ...otherRows]);

    const dir = path.join(ARTIFACTS_DIR, held.filingId, "pdf");
    const pdf = path.join(dir, fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".pdf"))!);
    const { facts, stat } = await extractFacts(fs.readFileSync(pdf), 2024, definitions);
    const fasitRows = await prisma.publishedFinancialLineItem.findMany({ where: { filingId: held.filingId, value: { not: null }, sourcePage: { in: [...stat] } }, select: { metricKey: true, statementScope: true, fiscalYear: true, value: true } });
    const fasit: AccuracyFact[] = fasitRows.map((r) => ({ metricKey: r.metricKey, statementScope: r.statementScope, fiscalYear: r.fiscalYear, value: r.value!.toString() }));
    const res = compareFactsToFasit({ extracted: facts, fasit });
    console.log(`\n=== ${held.name} (held out; aliases from others only) ===`);
    console.log(`  recall (non-zero): ${(res.recallNonZero * 100).toFixed(1)}%  (${res.matchedNonZero}/${res.nonZeroFasitTotal})`);
    console.log(`  precision:         ${(res.precision * 100).toFixed(1)}%  (${res.correctTotal}/${res.extractedOnFasitSlots})`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
