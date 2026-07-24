import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

const allowedEnvironmentFiles = new Set([".env.example", ".env.hybrid.local.example"]);
const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[opsu]_[A-Za-z0-9_]{30,}\b/,
  /\bsk_live_[A-Za-z0-9]{16,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
];

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const blockedEnvironmentFiles = trackedFiles.filter((file) => {
  const name = basename(file);
  return name.startsWith(".env") && !allowedEnvironmentFiles.has(name);
});

const possibleSecrets: string[] = [];
for (const file of trackedFiles) {
  let size = 0;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > 2_000_000) continue;

  let content = "";
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (credentialPatterns.some((pattern) => pattern.test(content))) {
    possibleSecrets.push(file);
  }
}

if (blockedEnvironmentFiles.length > 0 || possibleSecrets.length > 0) {
  console.error("Security check failed.");
  for (const file of blockedEnvironmentFiles) {
    console.error(`Tracked environment file: ${file}`);
  }
  for (const file of possibleSecrets) {
    console.error(`Possible credential in tracked file: ${file}`);
  }
  process.exit(1);
}

console.log(
  `Checked ${trackedFiles.length} tracked files: no private environment files or known credential formats found.`,
);
