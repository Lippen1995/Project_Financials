import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { createReadAcrossExposuresForRecentEvents } from "@/server/news/company-event-read-across";

function numericArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

async function main() {
  const result = await createReadAcrossExposuresForRecentEvents({
    limit: numericArg("limit", 5000),
    maxCompanies: numericArg("companies", 5000),
    maxExposuresPerEvent: numericArg("per-event", 8),
    threshold: 0.7,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
