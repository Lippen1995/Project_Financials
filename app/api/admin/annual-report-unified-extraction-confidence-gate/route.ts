/**
 * POST /api/admin/annual-report-unified-extraction-confidence-gate
 *
 * Evaluates unified extraction results against the confidence gate and
 * optionally persists the gate report as an artifact.
 *
 * Authentication: requires FINANCIAL_REVIEWER role.
 *
 * Safety:
 * - Never modifies production facts, routing decisions, or publish state.
 * - Gate report canUseForProductionRouting is always false.
 * - Persistence is opt-in via persistArtifact flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  buildUnifiedExtractionConfidenceGateReport,
  DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
} from "@/server/services/annual-report-unified-extraction-confidence-gate-service";
import { persistUnifiedExtractionConfidenceGateArtifact } from "@/server/services/annual-report-unified-extraction-artifact-service";

// ── Request schema ─────────────────────────────────────────────────────────────

const configOverrideSchema = z.object({
  minCanonicalKeyCoverageForPass: z.number().min(0).max(1).optional(),
  minCanonicalKeyCoverageForFail: z.number().min(0).max(1).optional(),
  minComparisonMatchRateForPass: z.number().min(0).max(1).optional(),
  minComparisonMatchRateForFail: z.number().min(0).max(1).optional(),
  majorMismatchDeviationThreshold: z.number().min(0).max(1).optional(),
  maxMajorMismatchCountForFail: z.number().int().min(0).optional(),
  narrativeAbsenceIsFail: z.boolean().optional(),
});

const requestBodySchema = z.object({
  /** Unified financial extraction result (optional) */
  financial: z.record(z.unknown()).nullable().optional(),
  /** Unified narrative extraction result (optional) */
  narrative: z.record(z.unknown()).nullable().optional(),
  /** Legacy-vs-unified comparison report (optional) */
  comparison: z.record(z.unknown()).nullable().optional(),
  /** Filing metadata */
  meta: z
    .object({
      filingId: z.string().nullable().optional(),
      orgNumber: z.string().nullable().optional(),
      fiscalYear: z.number().int().nullable().optional(),
    })
    .optional(),
  /** Whether to persist the gate report as an artifact */
  persistArtifact: z.boolean().optional(),
  /** Config overrides */
  config: configOverrideSchema.optional(),
});

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ugyldig JSON i forespørselskropp." },
      { status: 400 },
    );
  }

  const parsed = requestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ugyldig foresporsel.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { financial, narrative, comparison, meta, persistArtifact, config } = parsed.data;

  try {
    const report = buildUnifiedExtractionConfidenceGateReport({
      financial: financial ?? null,
      narrative: narrative ?? null,
      comparison: comparison ?? null,
      meta: {
        filingId: meta?.filingId ?? null,
        orgNumber: meta?.orgNumber ?? null,
        fiscalYear: meta?.fiscalYear ?? null,
      },
      config: {
        ...DEFAULT_UNIFIED_EXTRACTION_CONFIDENCE_GATE_CONFIG,
        ...config,
      },
    });

    let artifactResult: { artifactId: string; kind: string; createdAt: Date } | null = null;
    if (persistArtifact === true) {
      artifactResult = await persistUnifiedExtractionConfidenceGateArtifact({
        report,
        sourceCommand: "api/admin/annual-report-unified-extraction-confidence-gate",
      });
    }

    return NextResponse.json({
      data: {
        report,
        artifact: artifactResult
          ? {
              artifactId: artifactResult.artifactId,
              kind: artifactResult.kind,
              createdAt: artifactResult.createdAt,
            }
          : null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Kunne ikke bygge confidence gate-rapport.",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
