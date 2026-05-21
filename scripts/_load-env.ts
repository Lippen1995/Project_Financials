/**
 * Loads the project's .env file so standalone scripts have DATABASE_URL and
 * other variables available.
 *
 * MUST be the FIRST import in any script that touches the database — the
 * Prisma client reads DATABASE_URL at import time, and ES module imports run
 * in order, so this has to load the env before `@/lib/prisma` is imported.
 *
 * Usage (first line of the script):
 *   import "./_load-env";
 */
try {
  // Node 20.12+ / 24: built-in .env loader. No dotenv dependency needed.
  process.loadEnvFile();
} catch {
  // .env missing or already loaded — scripts can still run if the
  // environment was populated some other way (CI, exported vars).
}
