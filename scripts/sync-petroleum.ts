import { prisma } from "@/lib/prisma";
import {
  PetroleumJobName,
  runPetroleumJobNow,
} from "@/server/services/petroleum-sync-service";

const DEFAULT_JOB: PetroleumJobName = "scheduled";
const SUPPORTED_JOBS: PetroleumJobName[] = [
  "bootstrap-core",
  "bootstrap-metrics",
  "bootstrap-publications",
  "bootstrap-events",
  "bootstrap-macros",
  "refresh-snapshots",
  "refresh-company-exposure",
  "bootstrap-all",
  "scheduled",
];

async function main() {
  const requested = process.argv[2] as PetroleumJobName | undefined;
  const job = requested && SUPPORTED_JOBS.includes(requested) ? requested : DEFAULT_JOB;
  const result = await runPetroleumJobNow(job);
  console.log(JSON.stringify({ job, result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
