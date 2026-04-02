import { prisma } from "@/lib/prisma";
import { syncAllActiveWorkspaces } from "@/server/services/workspace-sync-service";

async function main() {
  const summary = await syncAllActiveWorkspaces();

  for (const result of summary.results) {
    if (result.skipped) {
      console.log(`${result.workspaceName}: hoppet over (${result.reason})`);
      continue;
    }

    console.log(
      `${result.workspaceName}: ${result.createdNotifications} varsler opprettet (${result.watchCount} watches, ${result.monitorCount} monitorer)`,
    );
  }

  console.log(
    `Ferdig. Synkroniserte ${summary.syncedWorkspaceCount} workspaces og opprettet ${summary.createdNotifications} varsler.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
