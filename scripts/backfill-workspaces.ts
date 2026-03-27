import { prisma } from "@/lib/prisma";
import { ensureUserWorkspaceState } from "@/server/services/workspace-service";

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
    },
  });

  for (const user of users) {
    await ensureUserWorkspaceState(user.id);
    console.log(`Backfilled workspace state for ${user.email}`);
  }
}

main()
  .catch((error) => {
    console.error("Workspace backfill failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
