import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeLimitedCsvUpload } from "@/lib/limited-file-upload";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("writeLimitedCsvUpload", () => {
  it("rejects bytes beyond the limit and removes the partial file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fjord-upload-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "upload.csv");
    const body = new Blob(["123456"]).stream();

    await expect(
      writeLimitedCsvUpload({
        body,
        filePath,
        maxBytes: 5,
        validateHeader: () => true,
      }),
    ).rejects.toThrow(/større enn tillatt/i);
    await expect(readFile(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects binary content disguised as CSV and removes the partial file", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fjord-upload-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "upload.csv");
    const body = new Blob([new Uint8Array([0, 1, 2, 10])]).stream();

    await expect(
      writeLimitedCsvUpload({
        body,
        filePath,
        maxBytes: 100,
        validateHeader: () => true,
      }),
    ).rejects.toThrow(/gyldig csv/i);
    await expect(readFile(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes a valid delimited CSV and reports its byte count", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fjord-upload-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "upload.csv");
    const csv = "column_a;column_b\nvalue_a;value_b\n";

    await expect(
      writeLimitedCsvUpload({
        body: new Blob([csv]).stream(),
        filePath,
        maxBytes: 100,
        validateHeader: (header) => header === "column_a;column_b",
      }),
    ).resolves.toBe(Buffer.byteLength(csv));
    await expect(readFile(filePath, "utf8")).resolves.toBe(csv);
  });

  it("rejects a CSV header longer than 64 KiB even when the newline follows", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fjord-upload-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "upload.csv");
    const body = new Blob([`${"a".repeat(64 * 1024)};\nvalue\n`]).stream();

    await expect(
      writeLimitedCsvUpload({
        body,
        filePath,
        maxBytes: 100_000,
        validateHeader: () => true,
      }),
    ).rejects.toThrow(/gyldig csv/i);
    await expect(readFile(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
