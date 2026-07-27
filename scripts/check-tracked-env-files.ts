import { execFileSync } from "node:child_process";
import { basename } from "node:path";

import { fileContainsKnownCredential } from "@/lib/tracked-secret-scan";

const allowedEnvironmentFiles = new Set([".env.example", ".env.hybrid.local.example"]);

async function main() {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  const blockedEnvironmentFiles = trackedFiles.filter((file) => {
    const name = basename(file);
    return name.startsWith(".env") && !allowedEnvironmentFiles.has(name);
  });

  const possibleSecrets: string[] = [];
  const unreadableFiles: string[] = [];
  for (const file of trackedFiles) {
    try {
      if (await fileContainsKnownCredential(file)) {
        possibleSecrets.push(file);
      }
    } catch {
      unreadableFiles.push(file);
    }
  }

  if (
    blockedEnvironmentFiles.length > 0 ||
    possibleSecrets.length > 0 ||
    unreadableFiles.length > 0
  ) {
    console.error("Security check failed.");
    for (const file of blockedEnvironmentFiles) {
      console.error(`Tracked environment file: ${file}`);
    }
    for (const file of possibleSecrets) {
      console.error(`Possible credential in tracked file: ${file}`);
    }
    for (const file of unreadableFiles) {
      console.error(`Could not scan tracked file: ${file}`);
    }
    process.exit(1);
  }

  console.log(
    `Checked ${trackedFiles.length} tracked files: no private environment files or known credential formats found.`,
  );
}

void main();
