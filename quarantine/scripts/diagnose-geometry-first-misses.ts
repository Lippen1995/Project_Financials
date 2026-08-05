/**
 * Per-row diagnostic for geometry-first reconstruction on Canica's scanned
 * Del 1 statement pages. Prints, for each page:
 *   - the published ground-truth facts (label → value) that were MISSED
 *   - the reconstructed rows (label → values) so we can see what geometry
 *     produced instead, and why the miss happened (mis-segmented label,
 *     fused token, dropped row, wrong column, …).
 */
import fs from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { extractOcrPages } from "@/integrations/brreg/annual-report-financials/ocr";
import { classifyPages } from "@/integrations/brreg/annual-report-financials/page-classification";
import { reconstructStatementRowsGeometryFirst } from "@/integrations/brreg/annual-report-financials/geometry-first-reconstruction";

const FILING_ID = "cmpf7rzpu0005vmus8st1n2l7";
const ORG = "938701237";
const PAGES = [6, 8];
// Classify with FULL Del 1 context: the page-classifier's multi-page round-
// start correction (selskap→konsern) needs the whole block, so classifying
// pages [6,8] alone mistypes p6 as STATUTORY_BALANCE. We OCR the block for a
// faithful type label but only score recall on the target PAGES.
const CONTEXT_PAGES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

async function main() {
  const company = await prisma.company.findFirstOrThrow({ where: { orgNumber: ORG }, select: { id: true } });
  const facts = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId: company.id, fiscalYear: 2024, statementScope: "CONSOLIDATED", sourcePage: { in: PAGES } },
    select: { metricKey: true, value: true, sourcePage: true, rawLabel: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  const pdfDir = path.join("C:/Users/simen/Project_Financials/output/annual-report-artifacts", FILING_ID, "pdf");
  const pdfName = fs.readdirSync(pdfDir).find((f) => f.toLowerCase().endsWith(".pdf"))!;
  const pdfBuffer = fs.readFileSync(path.join(pdfDir, pdfName));

  const ocrPages = await extractOcrPages(pdfBuffer, CONTEXT_PAGES);
  const classifications = classifyPages(ocrPages);
  const classByPage = new Map(classifications.map((c) => [c.pageNumber, c]));

  for (const page of ocrPages) {
    if (!PAGES.includes(page.pageNumber)) continue; // score only the target pages
    const cls = classByPage.get(page.pageNumber);
    if (!cls) continue;
    const rows = reconstructStatementRowsGeometryFirst(page, cls);
    const reconstructed = new Set<string>();
    for (const r of rows) for (const v of r.values) reconstructed.add(String(v.value));

    const pageFacts = facts.filter((f) => f.sourcePage === page.pageNumber && f.value !== null);
    const missed = pageFacts.filter((f) => !reconstructed.has(f.value!.toString()));

    console.log(`\n======== page ${page.pageNumber} (${cls.type}) — ${rows.length} rows, ${missed.length}/${pageFacts.length} GT missed ========`);

    console.log(`\n  MISSED ground-truth facts:`);
    for (const f of missed) {
      console.log(`    ${(f.metricKey ?? "(unmapped)").padEnd(34)} ${String(f.value).padStart(14)}   «${f.rawLabel ?? ""}»`);
    }

    console.log(`\n  RECONSTRUCTED rows:`);
    for (const r of rows) {
      const vals = r.values.map((v) => `c${v.columnIndex}:${v.value}`).join("  ");
      console.log(`    «${r.normalizedLabel.slice(0, 40).padEnd(40)}» ${vals}`);
    }
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
