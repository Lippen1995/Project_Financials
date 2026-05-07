/**
 * Shadow-mode configuration for the unified extractor in the annual-report pipeline.
 *
 * The shadow path is ALWAYS disabled by default. It can be enabled via environment
 * variable for research/validation purposes without touching production routing.
 *
 * SAFETY:
 *  - DISABLED (default)   → no unified extraction runs at all
 *  - DRY_RUN              → run extraction in-memory, log results, persist nothing
 *  - PERSIST_ARTIFACTS    → run extraction and persist artifacts to DB (shadow-only)
 *
 * Production routing is NEVER affected by this config.
 */

export type AnnualReportUnifiedShadowMode =
  | "DISABLED"
  | "DRY_RUN"
  | "PERSIST_ARTIFACTS";

export interface AnnualReportUnifiedShadowConfig {
  /**
   * Controls whether and how the unified extractor runs alongside the primary pipeline.
   * Default: "DISABLED"
   */
  mode: AnnualReportUnifiedShadowMode;

  /**
   * If true and mode === PERSIST_ARTIFACTS, persist the unified parser document artifact.
   * Default: false
   */
  persistUnifiedParserDocument: boolean;

  /**
   * If true and mode === PERSIST_ARTIFACTS, persist the unified financial extraction artifact.
   * Default: false
   */
  persistUnifiedFinancialExtraction: boolean;

  /**
   * If true and mode === PERSIST_ARTIFACTS, persist the unified narrative extraction artifact.
   * Default: false
   */
  persistUnifiedNarrativeExtraction: boolean;

  /**
   * If true and mode === PERSIST_ARTIFACTS, persist the legacy-vs-unified comparison artifact.
   * Default: false
   */
  persistLegacyVsUnifiedComparison: boolean;
}

export const DEFAULT_ANNUAL_REPORT_UNIFIED_SHADOW_CONFIG: AnnualReportUnifiedShadowConfig =
  {
    mode: "DISABLED",
    persistUnifiedParserDocument: false,
    persistUnifiedFinancialExtraction: false,
    persistUnifiedNarrativeExtraction: false,
    persistLegacyVsUnifiedComparison: false,
  };

const VALID_MODES: ReadonlySet<string> = new Set<AnnualReportUnifiedShadowMode>(
  ["DISABLED", "DRY_RUN", "PERSIST_ARTIFACTS"]
);

/**
 * Reads shadow mode config from environment variables.
 *
 * Env vars:
 *   ANNUAL_REPORT_UNIFIED_SHADOW_MODE          = DISABLED | DRY_RUN | PERSIST_ARTIFACTS
 *   ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_DOC   = true | false
 *   ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_FIN   = true | false
 *   ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_NAR   = true | false
 *   ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_CMP   = true | false
 *
 * Unknown/invalid mode values are treated as DISABLED (safe default).
 */
export function getAnnualReportUnifiedShadowConfigFromEnv(): AnnualReportUnifiedShadowConfig {
  const rawMode = process.env.ANNUAL_REPORT_UNIFIED_SHADOW_MODE ?? "DISABLED";
  const mode: AnnualReportUnifiedShadowMode = VALID_MODES.has(rawMode)
    ? (rawMode as AnnualReportUnifiedShadowMode)
    : "DISABLED";

  const flag = (name: string): boolean =>
    (process.env[name] ?? "false").toLowerCase() === "true";

  return {
    mode,
    persistUnifiedParserDocument: flag(
      "ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_DOC"
    ),
    persistUnifiedFinancialExtraction: flag(
      "ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_FIN"
    ),
    persistUnifiedNarrativeExtraction: flag(
      "ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_NAR"
    ),
    persistLegacyVsUnifiedComparison: flag(
      "ANNUAL_REPORT_UNIFIED_SHADOW_PERSIST_CMP"
    ),
  };
}

/**
 * Validates an AnnualReportUnifiedShadowConfig object.
 * Returns a list of validation errors (empty = valid).
 */
export function validateAnnualReportUnifiedShadowConfig(
  config: AnnualReportUnifiedShadowConfig
): string[] {
  const errors: string[] = [];

  if (!VALID_MODES.has(config.mode)) {
    errors.push(
      `Invalid mode: "${config.mode}". Must be one of: ${[...VALID_MODES].join(", ")}`
    );
  }

  const persistFlags: Array<[string, boolean]> = [
    ["persistUnifiedParserDocument", config.persistUnifiedParserDocument],
    [
      "persistUnifiedFinancialExtraction",
      config.persistUnifiedFinancialExtraction,
    ],
    [
      "persistUnifiedNarrativeExtraction",
      config.persistUnifiedNarrativeExtraction,
    ],
    ["persistLegacyVsUnifiedComparison", config.persistLegacyVsUnifiedComparison],
  ];

  for (const [name, value] of persistFlags) {
    if (typeof value !== "boolean") {
      errors.push(`"${name}" must be a boolean`);
    }
    if (value === true && config.mode !== "PERSIST_ARTIFACTS") {
      errors.push(
        `"${name}" is true but mode is "${config.mode}" (only effective when mode is PERSIST_ARTIFACTS)`
      );
    }
  }

  return errors;
}
