import { createReadStream } from "node:fs";

const credentialPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[opsu]_[A-Za-z0-9_]{30,}\b/,
  /\bsk_live_[A-Za-z0-9]{16,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /"name"\s*:\s*"(?:authorization|cookie|set-cookie|x-api-key)"/i,
];

const PATTERN_OVERLAP_CHARACTERS = 512;

export async function fileContainsKnownCredential(filePath: string) {
  const stream = createReadStream(filePath, {
    encoding: "utf8",
    highWaterMark: 64 * 1024,
  });
  let overlap = "";

  for await (const chunk of stream) {
    const candidate = overlap + chunk;
    if (credentialPatterns.some((pattern) => pattern.test(candidate))) {
      stream.destroy();
      return true;
    }
    overlap = candidate.slice(-PATTERN_OVERLAP_CHARACTERS);
  }

  return false;
}
