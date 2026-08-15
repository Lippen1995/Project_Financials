export type LlmCallsiteFile = {
  path: string;
  source: string;
};

export type LlmCallsiteFinding = {
  path: string;
  providerSignals: string[];
};

export type LlmCallsiteRegistration = {
  path: string;
  providerSignals: readonly string[];
};

const PROVIDER_PATTERNS: ReadonlyArray<{
  signal: string;
  patterns: readonly RegExp[];
}> = [
  {
    signal: "openai",
    patterns: [
      /api\.openai\.com\//,
      /from\s+["']openai["']/,
      /require\s*\(\s*["']openai["']\s*\)/,
      /\b(?:from\s+openai\s+import|import\s+openai\b)/,
      /\.(?:responses|chat\.completions)\.create\s*\(/,
    ],
  },
  {
    signal: "anthropic",
    patterns: [
      /api\.anthropic\.com\//,
      /from\s+["']@anthropic-ai\/sdk["']/,
      /require\s*\(\s*["']@anthropic-ai\/sdk["']\s*\)/,
      /\b(?:from\s+anthropic\s+import|import\s+anthropic\b)/,
    ],
  },
  {
    signal: "google-generative-ai",
    patterns: [
      /generativelanguage\.googleapis\.com\//,
      /from\s+["']@google\/generative-ai["']/,
      /require\s*\(\s*["']@google\/generative-ai["']\s*\)/,
      /\b(?:from\s+google\.(?:genai|generativeai)\s+import|import\s+google\.(?:genai|generativeai)\b)/,
    ],
  },
];

function normalizePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

export function auditLlmCallsites(
  files: readonly LlmCallsiteFile[],
  registrations: readonly LlmCallsiteRegistration[],
) {
  const registrationByPath = new Map(
    registrations.map((registration) => [
      normalizePath(registration.path),
      new Set(registration.providerSignals),
    ]),
  );
  const detected: LlmCallsiteFinding[] = [];

  for (const file of files) {
    const providerSignals = new Set(PROVIDER_PATTERNS
      .filter((candidate) => candidate.patterns.some((pattern) => pattern.test(file.source)))
      .map((candidate) => candidate.signal));
    const invokesTypedLlm = /\bLlmClient\b/.test(file.source) && /\.run\s*\(/.test(file.source);
    const constructsLlm = /\bnew\s+[A-Za-z_$][\w$]*LlmClient\s*\(/.test(file.source);
    if (invokesTypedLlm || constructsLlm) providerSignals.add("shared-llm-client");
    if (providerSignals.size === 0) continue;

    detected.push({
      path: normalizePath(file.path),
      providerSignals: [...providerSignals],
    });
  }

  const detectedPaths = new Set(detected.map((finding) => finding.path));
  return {
    detected: detected.sort((left, right) => left.path.localeCompare(right.path)),
    violations: detected
      .flatMap((finding) => {
        const allowedSignals = registrationByPath.get(finding.path);
        const unregisteredSignals = finding.providerSignals.filter(
          (signal) => !allowedSignals?.has(signal),
        );
        return unregisteredSignals.length > 0
          ? [{ path: finding.path, providerSignals: unregisteredSignals }]
          : [];
      })
      .sort((left, right) => left.path.localeCompare(right.path)),
    unusedRegistrations: [...registrationByPath.keys()]
      .filter((registeredPath) => !detectedPaths.has(registeredPath))
      .sort(),
  };
}
