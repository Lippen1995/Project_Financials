import { PdfModelArtifactKind, PdfModelArtifactStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import { norwegianOrganizationNumberSchema } from "@/lib/norwegian-organization-number";
import {
  listPersistedPdfModelArtifactSnapshots,
  persistPdfModelArtifactSnapshot,
} from "@/server/services/pdf-model-artifact-snapshot-service";

const querySchema = z.object({
  kind: z.nativeEnum(PdfModelArtifactKind).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  modelVersion: z.string().trim().min(1).max(200).optional(),
  fiscalYear: z.coerce.number().int().optional(),
  orgNumber: norwegianOrganizationNumberSchema.optional(),
  status: z.nativeEnum(PdfModelArtifactStatus).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const postSchema = z.object({
  kind: z.nativeEnum(PdfModelArtifactKind),
  payload: z.unknown(),
  modelId: z.string().trim().min(1).max(200).nullish(),
  modelVersion: z.string().trim().min(1).max(200).nullish(),
  modelTarget: z.string().trim().min(1).max(200).nullish(),
  featureSchemaVersion: z.string().trim().min(1).max(200).nullish(),
  fiscalYear: z.number().int().nullish(),
  orgNumber: norwegianOrganizationNumberSchema.nullish(),
  split: z.string().trim().min(1).max(30).nullish(),
  sourceCommand: z.string().trim().max(500).nullish(),
  sourceCommitSha: z.string().trim().max(80).nullish(),
});

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    kind: request.nextUrl.searchParams.get("kind") ?? undefined,
    modelId: request.nextUrl.searchParams.get("modelId") ?? undefined,
    modelVersion: request.nextUrl.searchParams.get("modelVersion") ?? undefined,
    fiscalYear: request.nextUrl.searchParams.get("fiscalYear") ?? undefined,
    orgNumber: request.nextUrl.searchParams.get("orgNumber") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = await listPersistedPdfModelArtifactSnapshots(parsed.data);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const data = await persistPdfModelArtifactSnapshot({
      ...parsed.data,
      payload: parsed.data.payload as unknown,
      createdByUserId: user.id,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not persist artifact snapshot." },
      { status: 400 },
    );
  }
}
