export type FinancialSource =
  | "FinancialStatement"
  | "FinancialLineItem"
  | "PublishedFinancialLineItem";

export type FinancialSourceAccessClassification =
  | "source-ingest"
  | "source-migration"
  | "source-admin"
  | "source-maintenance"
  | "source-observability"
  | "temporary-runtime-reader";

export type FinancialSourceFile = {
  path: string;
  source: string;
};

export type FinancialSourceAccessRegistration = {
  path: string;
  sources: readonly FinancialSource[];
  classification: FinancialSourceAccessClassification;
  rationale: string;
};

type DetectedAccess = {
  path: string;
  sources: FinancialSource[];
};

export type FinancialSourceAccessAudit = {
  violations: DetectedAccess[];
  registeredAccess: Array<
    DetectedAccess & {
      classification: FinancialSourceAccessClassification;
    }
  >;
  unusedRegistrations: string[];
};

const SOURCE_PATTERNS: ReadonlyArray<{
  source: FinancialSource;
  patterns: readonly RegExp[];
}> = [
  {
    source: "FinancialStatement",
    patterns: [
      /\.\s*financialStatement\s*\./,
      /\bfinancialStatements\s*:\s*{/,
      /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+"FinancialStatement"/i,
    ],
  },
  {
    source: "FinancialLineItem",
    patterns: [
      /\.\s*financialLineItem\s*\./,
      /\bfinancialLineItems\s*:\s*{/,
      /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+"FinancialLineItem"/i,
    ],
  },
  {
    source: "PublishedFinancialLineItem",
    patterns: [
      /\.\s*publishedFinancialLineItem\s*\./,
      /\bpublishedLineItems\s*:\s*{/,
      /\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+"PublishedFinancialLineItem"/i,
    ],
  },
];

function normalizePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

function detectSources(sourceText: string): FinancialSource[] {
  return SOURCE_PATTERNS.filter((candidate) =>
    candidate.patterns.some((pattern) => pattern.test(sourceText)),
  )
    .map((candidate) => candidate.source)
    .sort();
}

export function auditFinancialSourceAccess(
  files: readonly FinancialSourceFile[],
  registrations: readonly FinancialSourceAccessRegistration[],
): FinancialSourceAccessAudit {
  const registrationByPath = new Map(
    registrations.map((registration) => [normalizePath(registration.path), registration]),
  );
  const detectedPaths = new Set<string>();
  const violations: DetectedAccess[] = [];
  const registeredAccess: FinancialSourceAccessAudit["registeredAccess"] = [];

  for (const file of files) {
    const path = normalizePath(file.path);
    const sources = detectSources(file.source);
    if (sources.length === 0) continue;

    detectedPaths.add(path);
    const registration = registrationByPath.get(path);
    if (!registration) {
      violations.push({ path, sources });
      continue;
    }

    const unregisteredSources = sources.filter(
      (source) => !registration.sources.includes(source),
    );
    if (unregisteredSources.length > 0) {
      violations.push({ path, sources: unregisteredSources });
    }

    registeredAccess.push({
      path,
      sources,
      classification: registration.classification,
    });
  }

  return {
    violations: violations.sort((left, right) => left.path.localeCompare(right.path)),
    registeredAccess: registeredAccess.sort((left, right) => left.path.localeCompare(right.path)),
    unusedRegistrations: [...registrationByPath.keys()]
      .filter((path) => !detectedPaths.has(path))
      .sort(),
  };
}
