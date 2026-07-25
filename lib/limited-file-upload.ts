import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

type LimitedFileUploadInput = {
  body: ReadableStream<Uint8Array>;
  filePath: string;
  maxBytes: number;
  validateHeader: (header: string) => boolean;
  onProgress?: (uploadedBytes: number) => void;
};

const MAX_CSV_HEADER_BYTES = 64 * 1024;

export class UploadLimitExceededError extends Error {
  constructor(maxBytes: number) {
    super(`Opplastingen er større enn tillatt grense på ${maxBytes} byte.`);
    this.name = "UploadLimitExceededError";
  }
}

export class InvalidCsvUploadError extends Error {
  constructor() {
    super("Opplastingen inneholder ikke en gyldig CSV-header.");
    this.name = "InvalidCsvUploadError";
  }
}

export async function writeLimitedCsvUpload({
  body,
  filePath,
  maxBytes,
  validateHeader,
  onProgress,
}: LimitedFileUploadInput) {
  let uploadedBytes = 0;
  let csvHeaderValidated = false;
  let pendingChunks: Buffer[] = [];
  let pendingBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      uploadedBytes += chunk.byteLength;
      if (uploadedBytes > maxBytes) {
        callback(new UploadLimitExceededError(maxBytes));
        return;
      }
      if (chunk.includes(0)) {
        callback(new InvalidCsvUploadError());
        return;
      }
      onProgress?.(uploadedBytes);

      if (csvHeaderValidated) {
        callback(null, chunk);
        return;
      }

      pendingChunks.push(chunk);
      const newlineIndex = chunk.indexOf("\n");
      const headerBytes =
        pendingBytes + (newlineIndex < 0 ? chunk.byteLength : newlineIndex);
      if (headerBytes > MAX_CSV_HEADER_BYTES) {
        callback(new InvalidCsvUploadError());
        return;
      }
      if (newlineIndex < 0) {
        pendingBytes += chunk.byteLength;
        callback();
        return;
      }

      const header = Buffer.concat([
        ...pendingChunks.slice(0, -1),
        chunk.subarray(0, newlineIndex),
      ])
        .toString("utf8")
        .replace(/^\uFEFF/, "");
      if (!validateHeader(header)) {
        callback(new InvalidCsvUploadError());
        return;
      }

      csvHeaderValidated = true;
      for (const pendingChunk of pendingChunks.slice(0, -1)) {
        this.push(pendingChunk);
      }
      pendingChunks = [];
      pendingBytes = 0;
      callback(null, chunk);
    },
    flush(callback) {
      callback(csvHeaderValidated ? undefined : new InvalidCsvUploadError());
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body as never),
      limiter,
      createWriteStream(filePath, { flags: "wx" }),
    );
    return uploadedBytes;
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  }
}
