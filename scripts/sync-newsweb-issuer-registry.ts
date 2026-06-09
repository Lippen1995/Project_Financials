import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function numericArg(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  const parsed = raw ? Number(raw.slice(prefix.length)) : fallback;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

async function main() {
  const { syncNewswebIssuerRegistry } = await import("@/server/news/newsweb-issuer-registry");
  const result = await syncNewswebIssuerRegistry({
    brregLookupLimit: numericArg("brreg-lookups", 100),
    issuerLimit: numericArg("issuer-limit", 10_000),
  });

  console.log("NewsWeb issuer registry");
  console.log(`Utstedere hentet:       ${result.issuersFetched}`);
  console.log(`Ugyldige rader hoppet:  ${result.invalidIssuersSkipped}`);
  console.log(`Aktive utstedere:       ${result.activeIssuers}`);
  console.log(`Koblet eksisterende:    ${result.matchedExisting}`);
  console.log(`Koblet via Brreg:       ${result.matchedFromBrreg}`);
  console.log(`Brreg-oppslag:          ${result.brregLookups}`);
  console.log(`Tvetydige:              ${result.ambiguous}`);
  console.log(`Ikke koblet:            ${result.unmatched}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
