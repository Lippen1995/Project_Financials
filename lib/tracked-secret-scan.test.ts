import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { fileContainsKnownCredential } from "@/lib/tracked-secret-scan";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("fileContainsKnownCredential", () => {
  it("scans beyond the former 2 MB cutoff", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fjord-secret-scan-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "large-artifact.txt");
    const privateKeyMarker = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
    await writeFile(
      filePath,
      `${"x".repeat(2_100_000)}\n${privateKeyMarker}\n`,
      "utf8",
    );

    await expect(fileContainsKnownCredential(filePath)).resolves.toBe(true);
  });
});
