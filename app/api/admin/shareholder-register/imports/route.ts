import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getShareholderRegisterImportSummaries } from "@/server/shareholdings/shareholder-register-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "tmp", "shareholder-register-uploads");

function parseTaxYear(value: string | null) {
  const taxYear = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return null;
  }
  return taxYear;
}

function sanitizeFileName(value: string | null) {
  const decoded = value ? decodeURIComponent(value) : "aksjonaerregister.csv";
  const baseName = path.basename(decoded);
  return baseName.replace(/[^\w.\- æøåÆØÅ]/g, "_").slice(0, 180) || "aksjonaerregister.csv";
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

  const importId = parseImportId(request.headers.get("x-import-id"));
  const sourceFileName = sanitizeFileName(request.headers.get("x-file-name"));
  const totalBytes = BigInt(Number.parseInt(request.headers.get("content-length") ?? "0", 10) || 0);
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
    await new Promise<void>((resolve, reject) => {
      const nodeStream = Readable.fromWeb(request.body as never);
      const fileStream = createWriteStream(filePath, { flags: "wx" });

      nodeStream.on("data", (chunk: Buffer) => {
        uploadedBytes += BigInt(chunk.byteLength);
        if (Date.now() - lastUpdateAt > 1000) {
          lastUpdateAt = Date.now();
          void prisma.shareholderRegisterImport.update({
            where: { id: importId },
            data: { processedBytes: uploadedBytes, updatedAt: new Date() },
          });
        }
      });
      nodeStream.on("error", reject);
      fileStream.on("error", reject);
      fileStream.on("finish", resolve);
      nodeStream.pipe(fileStream);
    });

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
    return NextResponse.json({ error: "Opplasting feilet.", importId }, { status: 500 });
  }
}
