/**
 * One-shot seed: creates v1 of the confidence threshold version table using the
 * hard-coded defaults. Idempotent — running it twice is a no-op.
 *
 * Run with:
 *   npx tsx scripts/seed-confidence-threshold-v1.ts
 */
import { ensureInitialThresholdVersionSeeded } from "@/server/services/confidence-threshold-version-service";

async function main() {
  const seeded = await ensureInitialThresholdVersionSeeded();
  console.log(
    `Confidence threshold v${seeded.version} (${seeded.status}) — ${seeded.summary ?? "no summary"}`,
  );
}

main().catch((error) => {
  console.error("Failed to seed confidence threshold v1:", error);
  process.exit(1);
});
