import { preflightAnnualReportDocument } from "@/integrations/brreg/annual-report-financials/preflight";
import { parseAnnualReportPdfWithOpenDataLoader } from "@/server/document-understanding/opendataloader-client";
import { resolveOpenDataLoaderConfig } from "@/server/document-understanding/opendataloader-config";
import { inspectOpenDataLoaderRuntime } from "@/server/document-understanding/opendataloader-runtime";
import { OpenDataLoaderResolvedConfig } from "@/server/document-understanding/opendataloader-types";

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildOpenDataLoaderSmokePdfBuffer(pages: string[][]) {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const pageRefs: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    pageRefs.push(`${pageObjectId} 0 R`);

    const content = [
      "BT",
      "/F1 11 Tf",
      "14 TL",
      "50 780 Td",
      ...pages[index].flatMap((line, lineIndex) =>
        lineIndex === 0 ? [`(${escapePdfText(line)}) Tj`] : ["T*", `(${escapePdfText(line)}) Tj`],
      ),
      "ET",
    ].join("\n");

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export async function runOpenDataLoaderSmokeTest(
  configOverride?: Partial<OpenDataLoaderResolvedConfig>,
) {
  const config = {
    ...resolveOpenDataLoaderConfig(),
    ...configOverride,
    enabled: true,
    mode: "local" as const,
  };
  const runtime = await inspectOpenDataLoaderRuntime(config);

  if (!runtime.localModeReady) {
    throw new Error(
      `OpenDataLoader smoke test cannot run local mode: Java 11+ is required, detected ${runtime.java.rawVersion ?? "no Java runtime"}.`,
    );
  }

  const pdfBuffer = buildOpenDataLoaderSmokePdfBuffer([
    ["Arsregnskap 2024", "Eksempel Finans AS"],
    [
      "Resultatregnskap",
      "Belop i: NOK",
      "2024 2023",
      "Salgsinntekter 103097000 95210000",
      "Driftsresultat 21210000 17710000",
      "Arsresultat 18221000 15060000",
    ],
  ]);

  const preflight = await preflightAnnualReportDocument(pdfBuffer);
  const result = await parseAnnualReportPdfWithOpenDataLoader({
    pdfBuffer,
    sourceFilename: "opendataloader-smoke.pdf",
    preflight,
    config,
  });

  return {
    runtime,
    routing: result.routing,
    metrics: result.metrics,
    pages: result.annualReportPages.map((page) => ({
      pageNumber: page.pageNumber,
      blockCount: page.blocks.length,
      tableCount: page.tables.length,
      lineCount: page.lines.length,
    })),
  };
}
