import crypto from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  InvalidCsvUploadError,
  UploadLimitExceededError,
  writeLimitedCsvUpload,
} from "@/lib/limited-file-upload";
import { prisma } from "@/lib/prisma";
import { parseShareholderRegisterCsvHeader } from "@/lib/shareholder-register-csv";
import { getShareholderRegisterImportSummaries } from "@/server/shareholdings/shareholder-register-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "tmp", "shareholder-register-uploads");
const MAX_UPLOAD_BYTES = 1024 ** 3;

function parseTaxYear(value: string | null) {
  const taxYear = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return null;
  }
  return taxYear;
}

function sanitizeFileName(value: string | null) {
  let decoded = "aksjonaerregister.csv";
  try {
    decoded = value ? decodeURIComponent(value) : decoded;
  } catch {
    return null;
  }
  const baseName = path.basename(decoded);
  const sanitized =
    baseName.replace(/[^\w.\- æøåÆØÅ]/g, "_").slice(0, 180) ||
    "aksjonaerregister.csv";
  return sanitized.toLowerCase().endsWith(".csv") ? sanitized : null;
}

function parseImportId(value: string | null) {
  if (!value || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) {
    return crypto.randomUUID();
  }
  return value;
}

function spawnImportJob(input: { importId: string; taxYear: number; filePath: string }) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(
    npmCommand,
    [
      "run",
      "import:shareholder-register",
      "--",
      `--file=${input.filePath}`,
      `--year=${input.taxYear}`,
      `--import-id=${input.importId}`,
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.unref();
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) {
    return auth.error;
  }

  const imports = await getShareholderRegisterImportSummaries();
  return NextResponse.json({ imports });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) {
    return auth.error;
  }

  const taxYear = parseTaxYear(request.headers.get("x-tax-year"));
  if (!taxYear) {
    return NextResponse.json({ error: "Ugyldig eller manglende år." }, { status: 400 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "Mangler CSV-body." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return NextResponse.json(
      { error: "Mangler gyldig Content-Length for CSV-opplastingen." },
      { status: 411 },
    );
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "CSV-opplastingen er større enn tillatt grense på 1 GiB." },
      { status: 413 },
    );
  }

  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (mediaType !== "text/csv") {
    return NextResponse.json(
      { error: "Opplastingen må ha medietypen text/csv." },
      { status: 415 },
    );
  }

  const importId = parseImportId(request.headers.get("x-import-id"));
  const sourceFileName = sanitizeFileName(request.headers.get("x-file-name"));
  if (!sourceFileName) {
    return NextResponse.json(
      { error: "Filnavnet må ha endelsen .csv." },
      { status: 400 },
    );
  }
  const totalBytes = BigInt(contentLength);
  const filePath = path.join(UPLOAD_DIR, `${taxYear}-${importId}-${sourceFileName}`);
  const now = new Date();

  await mkdir(UPLOAD_DIR, { recursive: true });
  await prisma.shareholderRegisterImport.create({
    data: {
      id: importId,
      taxYear,
      sourceFileName,
      sourcePath: filePath,
      fileSizeBytes: totalBytes > 0n ? totalBytes : null,
      totalBytes: totalBytes > 0n ? totalBytes : null,
      processedBytes: 0n,
      status: "UPLOADED",
      sourceId: `admin-upload:${taxYear}:${importId}`,
      fetchedAt: now,
      startedAt: now,
    },
  });

  let uploadedBytes = 0n;
  let lastUpdateAt = Date.now();

  try {
    uploadedBytes = BigInt(
      await writeLimitedCsvUpload({
        body: request.body,
        filePath,
        maxBytes: contentLength,
        validateHeader: (header) =>
          parseShareholderRegisterCsvHeader(header).missing.length === 0,
        onProgress(bytes) {
          uploadedBytes = BigInt(bytes);
          if (Date.now() - lastUpdateAt > 1000) {
            lastUpdateAt = Date.now();
            void prisma.shareholderRegisterImport.update({
              where: { id: importId },
              data: { processedBytes: uploadedBytes, updatedAt: new Date() },
            });
          }
        },
      }),
    );

    await prisma.shareholderRegisterImport.update({
      where: { id: importId },
      data: {
        processedBytes: uploadedBytes,
        totalBytes: uploadedBytes,
        fileSizeBytes: uploadedBytes,
        status: "UPLOADED",
        updatedAt: new Date(),
      },
    });

    spawnImportJob({ importId, taxYear, filePath });
    return NextResponse.json({ importId });
  } catch (error) {
    await prisma.shareholderRegisterImport.update({
      where: { id: importId },
      data: {
        status: "FAILED",
        processedBytes: uploadedBytes,
        failureMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
    const status =
      error instanceof UploadLimitExceededError
        ? 413
        : error instanceof InvalidCsvUploadError
          ? 400
          : 500;
    return NextResponse.json(
      {
        error:
          status === 413
            ? "CSV-body er større enn deklarert Content-Length."
            : status === 400
              ? "Opplastingen inneholder ikke en gyldig CSV-header."
              : "Opplasting feilet.",
        importId,
      },
      { status },
    );
  }
}
