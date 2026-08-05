import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

import { preprocessOcrImage } from "@/integrations/brreg/annual-report-financials/image-preprocessing";

const ARTIFACTS_DIR = "C:/Users/simen/Project_Financials/output/annual-report-artifacts";

function readArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function pdfPathFor(filingId: string) {
  const dir = path.join(ARTIFACTS_DIR, filingId, "pdf");
  const pdfName = (await fs.readdir(dir)).find((name) => name.toLowerCase().endsWith(".pdf"));
  if (!pdfName) throw new Error(`No PDF artifact for ${filingId}`);
  return path.join(dir, pdfName);
}

async function recognizePage(input: {
  pdfPath: string;
  pageNumber: number;
  scale: number;
  pattern: RegExp;
}) {
  const pdfBuffer = await fs.readFile(input.pdfPath);
  const parser = new PDFParse({ data: pdfBuffer });
  const screenshots = await parser.getScreenshot({
    partial: [input.pageNumber],
    scale: input.scale,
  });
  await parser.destroy();

  const page = screenshots.pages[0];
  if (!page) throw new Error(`No screenshot for page ${input.pageNumber}`);

  const imageBuffer = await preprocessOcrImage(Buffer.from(page.data));
  const imagePath = path.join(
    os.tmpdir(),
    `fjord-insight-ocr-scale-${input.pageNumber}-${input.scale}.png`,
  );
  await fs.writeFile(imagePath, imageBuffer);

  const worker = await createWorker("nor+eng", 1, {
    cachePath: path.join(os.tmpdir(), "projectx-tesseract-cache"),
    logger: () => undefined,
  });

  try {
    for (const mode of [
      { name: "auto", parameters: { preserve_interword_spaces: "1", tessedit_pageseg_mode: "3" } },
      { name: "sparse", parameters: { preserve_interword_spaces: "1", tessedit_pageseg_mode: "11" } },
    ]) {
      await worker.setParameters(mode.parameters as Parameters<typeof worker.setParameters>[0]);
      const result = await worker.recognize(imagePath, {}, { text: true });
      const lines = (result.data.text ?? "")
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter((line) => line.length > 0 && input.pattern.test(line));
      console.log(`\nscale=${input.scale} mode=${mode.name}`);
      for (const line of lines) console.log(line);
    }
  } finally {
    await worker.terminate();
  }
}

async function main() {
  const filingId = readArg("filing-id", "cmq28bc7e0016vmec173ukkpi");
  const pageNumber = Number(readArg("page", "3"));
  const pattern = new RegExp(readArg("pattern", "foretak|fordringer|bankinnskudd|aksjer|anleggsmidler"), "i");
  const scales = readArg("scales", "2,3,4").split(",").map(Number).filter(Number.isFinite);
  const pdfPath = await pdfPathFor(filingId);
  for (const scale of scales) {
    await recognizePage({ pdfPath, pageNumber, scale, pattern });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
