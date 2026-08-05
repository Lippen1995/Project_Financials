import { PdfModelCandidateStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  createPdfModelCandidateFromManifestArtifact,
  listPdfModelCandidates,
  PdfModelCandidateError,
} from "@/server/services/pdf-model-candidate-service";

const querySchema = z.object({
  status: z.nativeEnum(PdfModelCandidateStatus).optional(),
  modelTarget: z.string().trim().min(1).max(100).optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const postSchema = z.object({
  manifestArtifactId: z.string().trim().min(1),
  gateArtifactId: z.string().trim().min(1).nullish(),
  analysisArtifactId: z.string().trim().min(1).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

function domainError(err: unknown) {
  if (err instanceof PdfModelCandidateError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  return NextResponse.json({ error: "Could not process model candidate request." }, { status: 400 });
}

export async function GET(request: NextRequest) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = querySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    modelTarget: request.nextUrl.searchParams.get("modelTarget") ?? undefined,
    modelId: request.nextUrl.searchParams.get("modelId") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = await listPdfModelCandidates(parsed.data);
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
    const data = await createPdfModelCandidateFromManifestArtifact({
      ...parsed.data,
      createdByUserId: user.id,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return domainError(err);
  }
}
