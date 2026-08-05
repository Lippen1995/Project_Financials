import type { AnnualReportArtifact, AnnualReportFiling, FinancialExtractionRun, PdfModelArtifactSnapshot } from "@prisma/client";

type FilingIdentity = Pick<
  AnnualReportFiling,
  | "id"
  | "fiscalYear"
  | "sourceDiscoveryKey"
  | "sourceIdempotencyKey"
  | "sourceDocumentHash"
  | "sourceDocumentType"
  | "sourceUrl"
> & {
  company: {
    orgNumber: string;
  };
};

export type FilingArtifactLookupStrategy =
  | "EXACT_FILING_ID"
  | "SOURCE_IDEMPOTENCY_KEY"
  | "SOURCE_DISCOVERY_KEY"
  | "SOURCE_DOCUMENT_HASH"
  | "ORG_FISCAL_YEAR_SAFE_FALLBACK"
  | "ORG_NUMBER_SAFE_FALLBACK"
  | "MISSING"
  | "AMBIGUOUS";

export type FilingArtifactLookupDiagnostic = {
  code:
    | "LOOKUP_EXACT_FILING_ID"
    | "LOOKUP_SOURCE_IDEMPOTENCY_KEY"
    | "LOOKUP_SOURCE_DISCOVERY_KEY"
    | "LOOKUP_SOURCE_DOCUMENT_HASH"
    | "LOOKUP_ORG_FISCAL_YEAR_FALLBACK"
    | "LOOKUP_ORG_NUMBER_FALLBACK"
    | "LOOKUP_MISSING"
    | "LOOKUP_AMBIGUOUS";
  message: string;
  strategy: FilingArtifactLookupStrategy;
};

export type FilingArtifactLookupResult<T> = {
  artifact: T | null;
  strategy: FilingArtifactLookupStrategy;
  diagnostics: FilingArtifactLookupDiagnostic[];
};

type PdfArtifactIdentity = {
  filingId: string | null;
  orgNumber: string | null;
  fiscalYear: number | null;
  sourceIdempotencyKey: string | null;
  sourceDiscoveryKey: string | null;
  sourceDocumentHash: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPdfModelArtifactIdentity(artifact: PdfModelArtifactSnapshot): PdfArtifactIdentity {
  const payload = asRecord(artifact.payload);
  const summary = asRecord(artifact.summary);
  const source = asRecord(payload.source);
  const meta = asRecord(payload.meta);
  const filingIdentity = asRecord(payload.filingIdentity);

  return {
    filingId:
      asString(meta.filingId) ??
      asString(source.filingId) ??
      asString(summary.filingId) ??
      asString(filingIdentity.filingId),
    orgNumber:
      artifact.orgNumber ??
      asString(meta.orgNumber) ??
      asString(source.orgNumber) ??
      asString(summary.orgNumber) ??
      asString(filingIdentity.orgNumber),
    fiscalYear:
      artifact.fiscalYear ??
      asNumber(meta.fiscalYear) ??
      asNumber(source.fiscalYear) ??
      asNumber(summary.fiscalYear) ??
      asNumber(filingIdentity.fiscalYear),
    sourceIdempotencyKey:
      asString(filingIdentity.sourceIdempotencyKey) ??
      asString(summary.sourceIdempotencyKey) ??
      asString(source.sourceIdempotencyKey),
    sourceDiscoveryKey:
      asString(filingIdentity.sourceDiscoveryKey) ??
      asString(summary.sourceDiscoveryKey) ??
      asString(source.sourceDiscoveryKey),
    sourceDocumentHash:
      asString(filingIdentity.sourceDocumentHash) ??
      asString(summary.sourceDocumentHash) ??
      asString(source.sourceDocumentHash),
  };
}

export function resolveAnnualReportArtifactForFiling(
  filing: FilingIdentity,
  artifacts: AnnualReportArtifact[],
  artifactType: AnnualReportArtifact["artifactType"],
): FilingArtifactLookupResult<AnnualReportArtifact> {
  const matches = artifacts
    .filter((artifact) => artifact.filingId === filing.id && artifact.artifactType === artifactType)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  if (matches.length === 0) {
    return {
      artifact: null,
      strategy: "MISSING",
      diagnostics: [
        {
          code: "LOOKUP_MISSING",
          strategy: "MISSING",
          message: `No ${artifactType} artifact found for filing ${filing.id}.`,
        },
      ],
    };
  }

  return {
    artifact: matches[0] ?? null,
    strategy: "EXACT_FILING_ID",
    diagnostics: [
      {
        code: "LOOKUP_EXACT_FILING_ID",
        strategy: "EXACT_FILING_ID",
        message: `Resolved ${artifactType} artifact by exact filing id.`,
      },
    ],
  };
}

export function resolvePdfModelArtifactForFiling(
  filing: FilingIdentity,
  artifacts: PdfModelArtifactSnapshot[],
): FilingArtifactLookupResult<PdfModelArtifactSnapshot> {
  const exact = artifacts.filter((artifact) => getPdfModelArtifactIdentity(artifact).filingId === filing.id);
  if (exact.length > 0) {
    const sorted = [...exact].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return {
      artifact: sorted[0] ?? null,
      strategy: "EXACT_FILING_ID",
      diagnostics: [
        {
          code: "LOOKUP_EXACT_FILING_ID",
          strategy: "EXACT_FILING_ID",
          message: `Resolved ${sorted[0]?.kind ?? "artifact"} by exact filing id.`,
        },
      ],
    };
  }

  const byIdempotencyKey = artifacts.filter((artifact) => {
    const identity = getPdfModelArtifactIdentity(artifact);
    return identity.sourceIdempotencyKey !== null && identity.sourceIdempotencyKey === filing.sourceIdempotencyKey;
  });
  if (byIdempotencyKey.length === 1) {
    return {
      artifact: byIdempotencyKey[0] ?? null,
      strategy: "SOURCE_IDEMPOTENCY_KEY",
      diagnostics: [
        {
          code: "LOOKUP_SOURCE_IDEMPOTENCY_KEY",
          strategy: "SOURCE_IDEMPOTENCY_KEY",
          message: "Resolved artifact by sourceIdempotencyKey fallback because exact filing id was missing.",
        },
      ],
    };
  }

  const byDiscoveryKey = artifacts.filter((artifact) => {
    const identity = getPdfModelArtifactIdentity(artifact);
    return identity.sourceDiscoveryKey !== null && identity.sourceDiscoveryKey === filing.sourceDiscoveryKey;
  });
  if (byDiscoveryKey.length === 1) {
    return {
      artifact: byDiscoveryKey[0] ?? null,
      strategy: "SOURCE_DISCOVERY_KEY",
      diagnostics: [
        {
          code: "LOOKUP_SOURCE_DISCOVERY_KEY",
          strategy: "SOURCE_DISCOVERY_KEY",
          message: "Resolved artifact by sourceDiscoveryKey fallback because exact filing id was missing.",
        },
      ],
    };
  }

  const byDocumentHash = artifacts.filter((artifact) => {
    const identity = getPdfModelArtifactIdentity(artifact);
    return (
      filing.sourceDocumentHash !== null &&
      filing.sourceDocumentHash !== undefined &&
      identity.sourceDocumentHash !== null &&
      identity.sourceDocumentHash === filing.sourceDocumentHash
    );
  });
  if (byDocumentHash.length === 1) {
    return {
      artifact: byDocumentHash[0] ?? null,
      strategy: "SOURCE_DOCUMENT_HASH",
      diagnostics: [
        {
          code: "LOOKUP_SOURCE_DOCUMENT_HASH",
          strategy: "SOURCE_DOCUMENT_HASH",
          message: "Resolved artifact by sourceDocumentHash fallback because exact filing id was missing.",
        },
      ],
    };
  }

  const byOrgAndYear = artifacts.filter((artifact) => {
    const identity = getPdfModelArtifactIdentity(artifact);
    return identity.orgNumber === filing.company.orgNumber && identity.fiscalYear === filing.fiscalYear;
  });
  if (byOrgAndYear.length === 1) {
    return {
      artifact: byOrgAndYear[0] ?? null,
      strategy: "ORG_FISCAL_YEAR_SAFE_FALLBACK",
      diagnostics: [
        {
          code: "LOOKUP_ORG_FISCAL_YEAR_FALLBACK",
          strategy: "ORG_FISCAL_YEAR_SAFE_FALLBACK",
          message:
            "Resolved artifact by orgNumber + fiscalYear singleton fallback. This is shadow-safe only because there was exactly one candidate.",
        },
      ],
    };
  }
  if (byOrgAndYear.length > 1) {
    return {
      artifact: null,
      strategy: "AMBIGUOUS",
      diagnostics: [
        {
          code: "LOOKUP_AMBIGUOUS",
          strategy: "AMBIGUOUS",
          message:
            "Artifact lookup was ambiguous for orgNumber + fiscalYear. Exact filing identity was required to avoid cross-filing reuse.",
        },
      ],
    };
  }

  const byOrg = artifacts.filter(
    (artifact) => getPdfModelArtifactIdentity(artifact).orgNumber === filing.company.orgNumber,
  );
  if (byOrg.length === 1) {
    return {
      artifact: byOrg[0] ?? null,
      strategy: "ORG_NUMBER_SAFE_FALLBACK",
      diagnostics: [
        {
          code: "LOOKUP_ORG_NUMBER_FALLBACK",
          strategy: "ORG_NUMBER_SAFE_FALLBACK",
          message:
            "Resolved artifact by orgNumber singleton fallback because no filing-specific identity was persisted. Treat as weaker evidence.",
        },
      ],
    };
  }
  if (byOrg.length > 1) {
    return {
      artifact: null,
      strategy: "AMBIGUOUS",
      diagnostics: [
        {
          code: "LOOKUP_AMBIGUOUS",
          strategy: "AMBIGUOUS",
          message: "Artifact lookup was ambiguous at orgNumber level; refusing cross-filing reuse.",
        },
      ],
    };
  }

  return {
    artifact: null,
    strategy: "MISSING",
    diagnostics: [
      {
        code: "LOOKUP_MISSING",
        strategy: "MISSING",
        message: "No matching artifact found for filing under any safe lookup strategy.",
      },
    ],
  };
}

export function summarizeExtractionRoute(run: FinancialExtractionRun | null): string | null {
  if (!run) {
    return null;
  }

  const parts = [run.documentEngine, run.documentEngineMode, run.ocrEngine].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join("/") : run.parserVersion;
}
