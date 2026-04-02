import { prisma } from "@/lib/prisma";
import { syncDistressBootstrap, syncDistressUpdates } from "@/server/services/distress-analysis-service";

async function main() {
  const mode = process.argv[2] ?? "updates";

  if (mode === "bootstrap") {
    const limit = Number(process.argv[3]);
    const result = await syncDistressBootstrap({
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    console.log(JSON.stringify({ mode, ...result }, null, 2));
    return;
  }

  const result = await syncDistressUpdates();
  console.log(JSON.stringify({ mode: "updates", ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
