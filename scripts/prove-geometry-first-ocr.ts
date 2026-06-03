/**
 * Proof: does feeding Tesseract WORD COORDINATES into geometry-first column
 * splitting fix the year-column fusion, and raise recall on Canica's scanned
 * Del 1 statement pages?
 *
 * Pipeline: extractOcrPages (real word x-coords) -> classifyPages ->
 * reconstructStatementRowsGeometryFirst -> score every reconstructed value
 * against the published ground truth (which trumps validation equations).
 *
 * Compares against the raw-text recall baseline measured by the OCR eval
 * harness (Tesseract line text: 49% source-page, but fused columns).
 */
import fs from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { extractOcrPages } from "@/integrations/brreg/annual-report-financials/ocr";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import {
  detectYearColumnAnchorsForPage,
  reconstructStatementRowsGeometryFirst,
} from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";

const FILING_ID = "cmpf7rzpu0005vmus8st1n2l7";
const ORG = "938701237";
const PAGES = [6, 8]; // dense income + balance pages

async function main() {
  const company = await prisma.company.findFirstOrThrow({ where: { orgNumber: ORG }, select: { id: true } });
  const facts = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId: company.id, fiscalYear: 2024, statementScope: "CONSOLIDATED", sourcePage: { in: PAGES } },
    select: { metricKey: true, value: true, sourcePage: true },
  });
  // Ground-truth value set (whole-NOK digit strings), per page.
  const gtByPage = new Map<number, Set<string>>();
  for (const f of facts) {
    if (f.value === null || f.sourcePage === null) continue;
    const set = gtByPage.get(f.sourcePage) ?? new Set<string>();
    set.add(f.value.toString());
    gtByPage.set(f.sourcePage, set);
  }
  // Also collect the 2023 prior-year values so we can tell whether a fused
  // token was a current+prior fusion (and verify the split recovers both).
  const prior = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId: company.id, fiscalYear: 2023, statementScope: "CONSOLIDATED", sourcePage: { in: PAGES } },
    select: { value: true, sourcePage: true },
  });
  const priorByPage = new Map<number, Set<string>>();
  for (const f of prior) {
    if (f.value === null || f.sourcePage === null) continue;
    const set = priorByPage.get(f.sourcePage) ?? new Set<string>();
    set.add(f.value.toString());
    priorByPage.set(f.sourcePage, set);
  }

  const pdfDir = path.join("C:/Users/simen/Project_Financials/output/annual-report-artifacts", FILING_ID, "pdf");
  const pdfName = fs.readdirSync(pdfDir).find((f) => f.toLowerCase().endsWith(".pdf"))!;
  const pdfBuffer = fs.readFileSync(path.join(pdfDir, pdfName));

  console.log("Running Tesseract (word coords) on pages", PAGES.join(", "), "…");
  const ocrPages = await extractOcrPages(pdfBuffer, PAGES);

  // Classify so geometry-first knows section type / unit scale.
  const classifications = classifyPages(ocrPages);
  const classByPage = new Map(classifications.map((c) => [c.pageNumber, c]));

  for (const page of ocrPages) {
    const cls = classByPage.get(page.pageNumber);
    if (!cls) continue;
    const gt = gtByPage.get(page.pageNumber) ?? new Set<string>();
    const pr = priorByPage.get(page.pageNumber) ?? new Set<string>();

    const anchors = detectYearColumnAnchorsForPage(page);
    const rows = reconstructStatementRowsGeometryFirst(page, cls);

    // All reconstructed values on this page (digit strings).
    const reconstructed = new Set<string>();
    for (const r of rows) for (const v of r.values) reconstructed.add(String(v.value));

    let hit = 0;
    const misses: string[] = [];
    for (const target of gt) {
      if (reconstructed.has(target)) hit++;
      else misses.push(target);
    }
    let priorHit = 0;
    for (const target of pr) if (reconstructed.has(target)) priorHit++;

    console.log(`\n── page ${page.pageNumber} (${cls.type}) ──`);
    console.log(`   year-column anchors: ${anchors.length} ${anchors.map((a) => `${a.year}@x${Math.round(a.x)}`).join(" ")}`);
    console.log(`   rows reconstructed:  ${rows.length}`);
    console.log(`   GEOMETRY-FIRST recall (current year): ${hit}/${gt.size}  (${gt.size ? ((hit / gt.size) * 100).toFixed(0) : 0}%)`);
    console.log(`   prior-year recovered too:             ${priorHit}/${pr.size}`);
    if (misses.length) console.log(`   still missing: ${misses.slice(0, 8).join(", ")}`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
