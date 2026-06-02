/**
 * OCR engine comparison — Tesseract vs RapidOCR against Canica ground truth.
 *
 * Usage: npx tsx scripts/run-ocr-eval-compare.ts
 *
 * RapidOCR runs in the rapidocr-eval Docker image (built from
 * integrations/.../ocr-eval/rapidocr-sidecar). Tesseract runs in-process.
 * Both feed the same engine-agnostic harness, so the recall numbers are
 * directly comparable. Ground truth (published reviewed values) trumps the
 * validation equations.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { extractOcrPages } from "@/integrations/brreg/annual-report-financials/ocr";
import {
  evaluateOcrAgainstGroundTruth,
  type GroundTruthFact,
  type OcrEnginePage,
  type OcrEvalResult,
} from "@/integrations/brreg/annual-report-financials/ocr-eval/ocr-eval-harness";

const FILING_ID = "cmpf7rzpu0005vmus8st1n2l7";
const ORG = "938701237";
const RAPIDOCR_IMAGE = "rapidocr-eval:latest";

function runRapidOcr(pdfDirAbs: string, pdfName: string, pages: number[]): OcrEnginePage[] {
  const out = execFileSync(
    "docker",
    ["run", "--rm", "-v", `${pdfDirAbs}:/work`, RAPIDOCR_IMAGE, `/work/${pdfName}`, pages.join(",")],
    { maxBuffer: 64 * 1024 * 1024, encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } },
  );
  const parsed = JSON.parse(out) as { engine: string; pages: OcrEnginePage[] };
  return parsed.pages;
}

function printResult(r: OcrEvalResult): void {
  console.log(`  [${r.engineName}]`);
  console.log(`    source-page recall: ${r.matchedOnSourcePage}/${r.factsWithSourcePage}  (${(r.sourcePageRecall * 100).toFixed(1)}%)  [exact ${r.exactOnSourcePage}, fused ${r.substringOnSourcePage}]`);
  console.log(`    any-page recall:    ${r.matchedOnAnyPage}/${r.totalFacts}  (${(r.anyPageRecall * 100).toFixed(1)}%)`);
  for (const pg of [6, 8]) {
    const onPage = r.matches.filter((m) => m.sourcePage === pg);
    const hit = onPage.filter((m) => m.foundOnSourcePage).length;
    const exact = onPage.filter((m) => m.sourceMatchKind === "exact").length;
    console.log(`    dense p${pg}: ${hit}/${onPage.length}  (exact ${exact})`);
  }
}

async function main() {
  const company = await prisma.company.findFirstOrThrow({ where: { orgNumber: ORG }, select: { id: true } });
  const facts = await prisma.publishedFinancialLineItem.findMany({
    where: { companyId: company.id, fiscalYear: 2024, statementScope: "CONSOLIDATED" },
    select: { metricKey: true, value: true, sourcePage: true, rawLabel: true },
    orderBy: { sortOrder: "asc" },
  });
  const groundTruth: GroundTruthFact[] = facts
    .filter((f) => f.value !== null)
    .map((f) => ({ metricKey: f.metricKey, value: f.value!.toString(), sourcePage: f.sourcePage, rawLabel: f.rawLabel }));

  const pages = [...new Set(groundTruth.map((f) => f.sourcePage).filter((p): p is number => p != null))].sort((a, b) => a - b);
  console.log(`Ground truth: ${groundTruth.length} facts on pages ${pages.join(", ")}\n`);

  const pdfDirAbs = path.join("C:/Users/simen/Project_Financials/output/annual-report-artifacts", FILING_ID, "pdf");
  const pdfName = fs.readdirSync(pdfDirAbs).find((f) => f.toLowerCase().endsWith(".pdf"))!;
  const pdfBuffer = fs.readFileSync(path.join(pdfDirAbs, pdfName));

  // Tesseract (in-process)
  console.log("Running Tesseract…");
  const tStart = Date.now();
  const tPages = (await extractOcrPages(pdfBuffer, pages)).map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
  console.log(`  done in ${((Date.now() - tStart) / 1000).toFixed(0)}s`);

  // RapidOCR (docker)
  console.log("Running RapidOCR (docker)…");
  const rStart = Date.now();
  const rPages = runRapidOcr(pdfDirAbs, pdfName, pages);
  console.log(`  done in ${((Date.now() - rStart) / 1000).toFixed(0)}s\n`);

  const tesseract = evaluateOcrAgainstGroundTruth({ engineName: "tesseract", pages: tPages, groundTruth });
  const rapidocr = evaluateOcrAgainstGroundTruth({ engineName: "rapidocr", pages: rPages, groundTruth });

  console.log("=== COMPARISON: Tesseract vs RapidOCR (Canica FY2024 consolidated) ===");
  printResult(tesseract);
  printResult(rapidocr);

  console.log("\n  Facts RapidOCR reads that Tesseract misses (on source page):");
  const tMiss = new Set(tesseract.matches.filter((m) => !m.foundOnSourcePage).map((m) => m.metricKey));
  rapidocr.matches
    .filter((m) => m.foundOnSourcePage && tMiss.has(m.metricKey))
    .slice(0, 20)
    .forEach((m) => console.log(`    +${m.metricKey.padEnd(30)} ${m.value}`));
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
