import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import sharp, { type OverlayOptions } from "sharp";

const prisma = new PrismaClient({ log: ["warn", "error"] });

const EVIDENCE_SOURCE = "PDF_VISUALLY_VERIFIED_AS_REPORTED_GOLD_SET_2026_06_23";
const ARTIFACT_ROOT = "output/annual-report-artifacts";
const AUDIT_ROOT = "output/manual-review-visual-audit";

type JsonObject = Record<string, unknown>;

type ExtractionRow = {
  pageNumber: number;
  label?: string | null;
  normalizedLabel?: string | null;
  rowText?: string | null;
  y?: number | null;
};

type AuditItem = {
  index: number;
  labelId: string;
  filingId: string;
  reviewId: string | null;
  companyName: string;
  reportYear: number;
  sourcePage: number;
  fiscalYear: number;
  statementScope: string;
  statementType: string;
  metricKey: string;
  rawLabel: string;
  value: string;
  displayValue: string;
  sourceRowText: string | null;
  visualEvidencePage: string | null;
  matchStatus: "matched" | "page_only" | "missing_page";
  cropPath: string | null;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : value === null || value === undefined ? null : String(value);
}

function normalize(input: string | null | undefined) {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatNumber(value: string) {
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

function readExtractionRows(filingId: string) {
  const path = join(ARTIFACT_ROOT, filingId, "extraction_json", "extraction.json");
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { rows?: ExtractionRow[] };
  return parsed.rows ?? [];
}

function findEvidencePath(sourcePayload: JsonObject, sourcePage: number) {
  const pages = Array.isArray(sourcePayload.visualEvidencePages)
    ? sourcePayload.visualEvidencePages.filter((item): item is string => typeof item === "string")
    : [];
  return pages.find((path) => path.includes(`page-${sourcePage}.png`)) ?? pages[0] ?? null;
}

function valueCandidates(value: string, sourceUnitScale: unknown) {
  const numeric = BigInt(value);
  const candidates = new Set<string>([value, formatNumber(value)]);
  if (typeof sourceUnitScale === "number" && sourceUnitScale > 1) {
    const scale = BigInt(sourceUnitScale);
    if (numeric % scale === 0n) {
      const scaled = String(numeric / scale);
      candidates.add(scaled);
      candidates.add(formatNumber(scaled));
    }
  }
  return [...candidates].map((item) => item.replace(/\s+/g, " ").trim());
}

function findRow(input: {
  rows: ExtractionRow[];
  sourcePage: number;
  rawLabel: string;
  sourceRowText: string | null;
  value: string;
  sourceUnitScale: unknown;
}) {
  const pageRows = input.rows.filter((row) => row.pageNumber === input.sourcePage);
  if (input.sourceRowText) {
    const exact = pageRows.find((row) => row.rowText === input.sourceRowText);
    if (exact) return exact;
  }

  const normalizedLabel = normalize(input.rawLabel);
  const candidates = pageRows.filter((row) => {
    const rowLabel = normalize(row.label);
    const rowText = normalize(row.rowText);
    return rowLabel === normalizedLabel || rowText.includes(normalizedLabel);
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const values = valueCandidates(input.value, input.sourceUnitScale);
  return (
    candidates.find((row) => {
      const rowText = (row.rowText ?? "").replace(/\s+/g, " ");
      return values.some((value) => rowText.includes(value));
    }) ?? candidates[0]
  );
}

async function cropRow(input: {
  imagePath: string;
  outputPath: string;
  y: number | null | undefined;
  matchStatus: "matched" | "page_only" | "missing_page";
}) {
  if (!existsSync(input.imagePath)) return null;
  const metadata = await sharp(input.imagePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) return null;

  const rowTop =
    input.matchStatus === "matched" && typeof input.y === "number"
      ? Math.max(0, Math.round(input.y - 95))
      : 0;
  const rowHeight =
    input.matchStatus === "matched" && typeof input.y === "number"
      ? Math.min(210, height - rowTop)
      : Math.min(height, 360);

  mkdirSync(join(input.outputPath, ".."), { recursive: true });
  await sharp(input.imagePath)
    .extract({
      left: 90,
      top: rowTop,
      width: Math.max(1, width - 180),
      height: Math.max(1, rowHeight),
    })
    .resize({ width: 980, withoutEnlargement: true })
    .png()
    .toFile(input.outputPath);
  return input.outputPath;
}

function xmlEscape(input: string) {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapText(input: string, maxChars: number, maxLines: number) {
  const words = input.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  const source = words.join(" ");
  const rendered = lines.join(" ");
  if (source.length > rendered.length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]} ...`;
  }
  return lines.length > 0 ? lines : [""];
}

function svgTextLines(input: {
  lines: string[];
  x: number;
  y: number;
  lineHeight: number;
  fontSize: number;
  fill: string;
  weight?: string;
}) {
  return input.lines
    .map(
      (line, index) =>
        `<text x="${input.x}" y="${input.y + index * input.lineHeight}" font-family="Arial" font-size="${input.fontSize}"${input.weight ? ` font-weight="${input.weight}"` : ""} fill="${input.fill}">${xmlEscape(line)}</text>`,
    )
    .join("");
}

async function buildSheets(items: AuditItem[]) {
  const sheetDir = join(AUDIT_ROOT, "sheets");
  mkdirSync(sheetDir, { recursive: true });
  const perSheet = 18;
  const sheetPaths: string[] = [];

  for (let start = 0; start < items.length; start += perSheet) {
    const batch = items.slice(start, start + perSheet);
    const rowHeight = 230;
    const width = 1500;
    const height = batch.length * rowHeight + 90;
    const composites: OverlayOptions[] = [];

    const header = Buffer.from(
      `<svg width="${width}" height="70"><text x="20" y="34" font-family="Arial" font-size="24" fill="#111827">As-reported visual audit ${start + 1}-${start + batch.length} of ${items.length}</text><text x="20" y="60" font-family="Arial" font-size="16" fill="#475569">Each row: saved label/value/scope/year plus cropped annual-report row evidence.</text></svg>`,
    );
    composites.push({ input: header, left: 0, top: 0 });

    for (const [offset, item] of batch.entries()) {
      const top = 80 + offset * rowHeight;
      const labelLines = wrapText(item.rawLabel, 54, 3);
      const keyLines = wrapText(item.metricKey, 66, 2);
      const infoSvg = Buffer.from(
        `<svg width="500" height="${rowHeight}">
          <rect x="0" y="0" width="500" height="${rowHeight - 8}" fill="#ffffff" stroke="#cbd5e1"/>
          <text x="12" y="22" font-family="Arial" font-size="14" font-weight="700" fill="#111827">#${item.index} ${xmlEscape(item.companyName)} ${item.reportYear} p.${item.sourcePage}</text>
          <text x="12" y="46" font-family="Arial" font-size="13" fill="#334155">${xmlEscape(item.statementScope)} · ${xmlEscape(item.statementType)} · ${item.fiscalYear}</text>
          ${svgTextLines({ lines: labelLines, x: 12, y: 72, lineHeight: 16, fontSize: 14, fill: "#111827" })}
          <text x="12" y="126" font-family="Arial" font-size="16" font-weight="700" fill="#111827">${xmlEscape(item.displayValue)}</text>
          ${svgTextLines({ lines: keyLines, x: 12, y: 152, lineHeight: 14, fontSize: 12, fill: "#475569" })}
          <text x="12" y="196" font-family="Arial" font-size="12" fill="${item.matchStatus === "matched" ? "#047857" : "#b45309"}">${item.matchStatus}</text>
        </svg>`,
      );
      composites.push({ input: infoSvg, left: 0, top });
      if (item.cropPath && existsSync(item.cropPath)) {
        composites.push({ input: item.cropPath, left: 510, top });
      }
    }

    const out = join(sheetDir, `audit-sheet-${String(sheetPaths.length + 1).padStart(3, "0")}.png`);
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: "#ffffff",
      },
    })
      .composite(composites)
      .png()
      .toFile(out);
    sheetPaths.push(out);
  }

  return sheetPaths;
}

async function main() {
  const labels = await prisma.pdfTrainingLabel.findMany({
    where: {
      labelType: "FACT_VALUE",
      sourcePayload: { path: ["evidenceSource"], equals: EVIDENCE_SOURCE },
    },
    include: {
      reviewer: true,
    },
    orderBy: [{ filingId: "asc" }, { createdAt: "asc" }],
  });

  const filings = await prisma.annualReportFiling.findMany({
    where: { id: { in: [...new Set(labels.map((label) => label.filingId))] } },
    include: { company: true },
  });
  const filingById = new Map(filings.map((filing) => [filing.id, filing]));
  const rowsByFiling = new Map<string, ExtractionRow[]>();

  mkdirSync(AUDIT_ROOT, { recursive: true });
  mkdirSync(join(AUDIT_ROOT, "crops"), { recursive: true });

  const items: AuditItem[] = [];
  let index = 0;
  for (const label of labels) {
    index += 1;
    const accepted = asObject(label.acceptedValue);
    const target = asObject(label.targetRef);
    const source = asObject(label.sourcePayload);
    const filing = filingById.get(label.filingId);
    const sourcePage = Number(accepted.sourcePage ?? target.sourcePage);
    const fiscalYear = Number(accepted.fiscalYear ?? target.fiscalYear);
    const rawLabel = asString(accepted.rawLabel ?? target.rawLabel) ?? "";
    const value = asString(accepted.value) ?? "";
    const sourceRowText = asString(source.sourceRowText);
    const imagePath = findEvidencePath(source, sourcePage);

    if (!rowsByFiling.has(label.filingId)) {
      rowsByFiling.set(label.filingId, readExtractionRows(label.filingId));
    }
    const row = findRow({
      rows: rowsByFiling.get(label.filingId) ?? [],
      sourcePage,
      rawLabel,
      sourceRowText,
      value,
      sourceUnitScale: accepted.sourceUnitScale,
    });
    const matchStatus: AuditItem["matchStatus"] =
      row && typeof row.y === "number" ? "matched" : imagePath ? "page_only" : "missing_page";
    const cropPath = imagePath
      ? join(AUDIT_ROOT, "crops", `audit-${String(index).padStart(5, "0")}.png`)
      : null;
    const renderedCrop = cropPath
      ? await cropRow({
          imagePath,
          outputPath: cropPath,
          y: row?.y,
          matchStatus,
        })
      : null;

    items.push({
      index,
      labelId: label.id,
      filingId: label.filingId,
      reviewId: label.reviewId,
      companyName: filing?.company.name ?? label.filingId,
      reportYear: filing?.fiscalYear ?? Number(source.fiscalYear ?? fiscalYear),
      sourcePage,
      fiscalYear,
      statementScope: asString(accepted.statementScope ?? target.statementScope) ?? "",
      statementType: asString(accepted.statementType ?? target.statementType) ?? "",
      metricKey: asString(accepted.metricKey ?? target.metricKey) ?? "",
      rawLabel,
      value,
      displayValue: formatNumber(value),
      sourceRowText,
      visualEvidencePage: imagePath,
      matchStatus,
      cropPath: renderedCrop,
    });
  }

  const sheetPaths = await buildSheets(items);
  const summary = {
    generatedAt: new Date().toISOString(),
    evidenceSource: EVIDENCE_SOURCE,
    totalLabels: items.length,
    matchStatus: items.reduce<Record<string, number>>((acc, item) => {
      acc[item.matchStatus] = (acc[item.matchStatus] ?? 0) + 1;
      return acc;
    }, {}),
    sheets: sheetPaths,
    documents: [...Map.groupBy(items, (item) => item.filingId).entries()].map(([filingId, rows]) => ({
      filingId,
      companyName: rows[0]?.companyName ?? filingId,
      reportYear: rows[0]?.reportYear ?? null,
      labels: rows.length,
      matched: rows.filter((row) => row.matchStatus === "matched").length,
      pageOnly: rows.filter((row) => row.matchStatus === "page_only").length,
      missingPage: rows.filter((row) => row.matchStatus === "missing_page").length,
    })),
  };

  writeFileSync(join(AUDIT_ROOT, "audit-items.json"), JSON.stringify(items, null, 2), "utf8");
  writeFileSync(join(AUDIT_ROOT, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
