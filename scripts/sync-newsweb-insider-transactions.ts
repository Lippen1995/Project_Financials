import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function readLimit() {
  const value = process.argv.find((argument) => argument.startsWith("--limit="))?.split("=")[1];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readOrgNumber() {
  const value = process.argv.find((argument) => argument.startsWith("--org-number="))?.split("=")[1];
  return value && /^\d{9}$/.test(value) ? value : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("newsweb:sync-insider-transactions requires DATABASE_URL.");
  }
  const { syncNewswebInsiderTransactions } = await import(
    "@/server/insider-transactions/newsweb-insider-sync-service"
  );
  const result = await syncNewswebInsiderTransactions({
    limit: readLimit(),
    orgNumber: readOrgNumber(),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.errors.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
