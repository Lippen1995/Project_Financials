import { syncCompanyExposureGraph } from "../server/news/company-exposure-graph-service";

function parseLimit() {
  const argument = process.argv.find((value) => value.startsWith("--limit="));
  if (!argument) return 1000;
  const value = Number(argument.slice("--limit=".length));
  return Number.isFinite(value) ? value : 1000;
}

async function main() {
  const result = await syncCompanyExposureGraph({ limit: parseLimit() });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
