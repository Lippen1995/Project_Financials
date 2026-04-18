export function readFlag(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

export function readListFlag(name: string) {
  const raw = readFlag(name);
  return raw ? raw.split(",").map((value) => value.trim()).filter(Boolean) : undefined;
}

export function readNumberFlag(name: string) {
  const raw = readFlag(name);
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readPositionalArgs() {
  return process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
}
