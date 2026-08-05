import { spawn } from "node:child_process";
import path from "node:path";

function runDockerCompose(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`docker compose exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function main() {
  const composeFile = path.join(process.cwd(), "docker-compose.opendataloader-hybrid.yml");
  await runDockerCompose(["compose", "-f", composeFile, "down"]);
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Kunne ikke stoppe OpenDataLoader hybrid-backend.",
  );
  process.exitCode = 1;
});
