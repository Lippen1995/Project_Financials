import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LocalAnnualReportArtifactStorage,
  sanitizeArtifactFilename,
} from "@/server/financials/artifact-storage";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("LocalAnnualReportArtifactStorage", () => {
  it("sanitizes Windows-invalid policy version characters before writing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-storage-"));
    temporaryDirectories.push(root);
    const storage = new LocalAnnualReportArtifactStorage(root);

    const stored = await storage.putArtifact({
      filingId: "filing-1",
      artifactType: "BOARD_REPORT_EXTRACTION_JSON",
      filename: "hash-board-report:v2.json",
      content: "exact content",
    });

    expect(sanitizeArtifactFilename("hash-board-report:v2.json")).toBe(
      "hash-board-report_v2.json",
    );
    expect(stored.storageKey).not.toContain(":");
    await expect(storage.getArtifactBuffer(stored.storageKey)).resolves.toEqual(
      Buffer.from("exact content"),
    );
  });
});
