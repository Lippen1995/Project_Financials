import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { financialSourceAccessRegistrations } from "@/config/financial-source-access";
import {
  auditFinancialSourceAccess,
  type FinancialSourceFile,
} from "@/lib/financial-source-access-inventory";

const SOURCE_ROOTS = ["app", "lib", "scripts", "server"] as const;

function collectSourceFiles(repositoryRoot: string, relativeDirectory: string): FinancialSourceFile[] {
  const absoluteDirectory = path.join(repositoryRoot, relativeDirectory);

  return readdirSync(absoluteDirectory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(repositoryRoot, relativePath);
    if (!entry.name.match(/\.(?:ts|tsx)$/) || entry.name.match(/\.(?:test|spec)\.(?:ts|tsx)$/)) {
      return [];
    }

    return [
      {
        path: relativePath.replaceAll("\\", "/"),
        source: readFileSync(path.join(repositoryRoot, relativePath), "utf8"),
      },
    ];
  });
}

const repositoryRoot = process.cwd();
const sourceFiles = SOURCE_ROOTS.flatMap((root) => collectSourceFiles(repositoryRoot, root));
const audit = auditFinancialSourceAccess(sourceFiles, financialSourceAccessRegistrations);

if (audit.violations.length > 0) {
  console.error("Unregistered direct financial source access detected:");
  for (const violation of audit.violations) {
    console.error(`  ${violation.path}: ${violation.sources.join(", ")}`);
  }
}

if (audit.unusedRegistrations.length > 0) {
  console.error("Stale financial source access registrations detected:");
  for (const filePath of audit.unusedRegistrations) console.error(`  ${filePath}`);
}

if (audit.violations.length > 0 || audit.unusedRegistrations.length > 0) {
  process.exitCode = 1;
} else {
  const permittedClassifications = new Set(["source-ingest", "source-migration"]);
  const prohibitedCount = audit.registeredAccess.filter(
    (entry) => !permittedClassifications.has(entry.classification),
  ).length;
  console.log(
    `Financial source-access baseline is unchanged: ${audit.registeredAccess.length} registered files.`,
  );
  if (prohibitedCount > 0) {
    console.warn(
      `${prohibitedCount} prohibited direct source accesses remain migration debt; FI-SIM activation must stay disabled until they are removed or moved behind FinancialsRepository.`,
    );
  }
}
