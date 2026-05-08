/**
 * Tests for POST /api/admin/annual-report-unified-extraction-confidence-gate
 *
 * Covers:
 * - 401 when not authenticated
 * - 400 for invalid JSON
 * - 400 for malformed financial/narrative/comparison inputs
 * - 400 for invalid config threshold ordering
 * - 200 for valid inputs (financial/narrative/comparison null — gates still run)
 * - persistArtifact defaults to false (artifact not created unless opt-in)
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Auth mock ──────────────────────────────────────────────────────────────────

const authState = {
  shouldFail: false,
};

vi.mock("@/lib/admin-auth", () => ({
  requireFinancialReviewer: vi.fn(async () => {
    if (authState.shouldFail) {
      return {
        error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      };
    }
    return { error: null };
  }),
}));

// ── Artifact service mock ──────────────────────────────────────────────────────

const artifactService = {
  persistUnifiedExtractionConfidenceGateArtifact: vi.fn(),
};

vi.mock(
  "@/server/services/annual-report-unified-extraction-artifact-service",
  () => ({
    persistUnifiedExtractionConfidenceGateArtifact:
      artifactService.persistUnifiedExtractionConfidenceGateArtifact,
  }),
);

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/admin/annual-report-unified-extraction-confidence-gate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("POST /api/admin/annual-report-unified-extraction-confidence-gate", () => {
  beforeEach(() => {
    authState.shouldFail = false;
    artifactService.persistUnifiedExtractionConfidenceGateArtifact.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    authState.shouldFail = true;
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const request = new NextRequest(
      "http://localhost/api/admin/annual-report-unified-extraction-confidence-gate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      },
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 when financial has wrong version", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(
      makeRequest({
        financial: { version: "wrong-version", safety: {}, statements: [] },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/financial/i);
  });

  it("returns 400 when narrative has wrong version", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(
      makeRequest({
        narrative: { version: "bad-narrative-version" },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/narrative/i);
  });

  it("returns 400 when comparison has wrong version", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(
      makeRequest({
        comparison: { version: "not-the-right-one" },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/comparison/i);
  });

  it("returns 400 when minComparisonMatchRateForFail > minComparisonMatchRateForPass", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(
      makeRequest({
        config: {
          minComparisonMatchRateForFail: 0.9,
          minComparisonMatchRateForPass: 0.5,
        },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/minComparisonMatchRateForFail/);
  });

  it("returns 400 when minCanonicalKeyCoverageForFail > minCanonicalKeyCoverageForPass", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(
      makeRequest({
        config: {
          minCanonicalKeyCoverageForFail: 0.8,
          minCanonicalKeyCoverageForPass: 0.3,
        },
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/minCanonicalKeyCoverageForFail/);
  });

  it("returns 200 with all inputs null (gate runs with INSUFFICIENT_DATA checks)", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(
      makeRequest({
        financial: null,
        narrative: null,
        comparison: null,
        meta: { filingId: "filing-1", orgNumber: "928846466", fiscalYear: 2024 },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.report.overallVerdict).toBe("INSUFFICIENT_DATA");
    expect(body.data.artifact).toBeNull();
  });

  it("does not persist artifact unless persistArtifact=true", async () => {
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    await POST(makeRequest({ financial: null, narrative: null, comparison: null }));
    expect(
      artifactService.persistUnifiedExtractionConfidenceGateArtifact,
    ).not.toHaveBeenCalled();
  });

  it("persists artifact when persistArtifact=true", async () => {
    artifactService.persistUnifiedExtractionConfidenceGateArtifact.mockResolvedValue({
      artifactId: "art-1",
      kind: "UNIFIED_EXTRACTION_CONFIDENCE_GATE",
      createdAt: new Date("2024-01-01"),
    });
    const { POST } = await import(
      "@/app/api/admin/annual-report-unified-extraction-confidence-gate/route"
    );
    const response = await POST(
      makeRequest({
        financial: null,
        narrative: null,
        comparison: null,
        persistArtifact: true,
      }),
    );
    expect(response.status).toBe(200);
    expect(
      artifactService.persistUnifiedExtractionConfidenceGateArtifact,
    ).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body.data.artifact?.artifactId).toBe("art-1");
  });
});
