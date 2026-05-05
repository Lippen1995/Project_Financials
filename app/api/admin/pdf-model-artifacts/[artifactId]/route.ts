import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireFinancialReviewer } from "@/lib/admin-auth";
import {
  archivePersistedPdfModelArtifactSnapshot,
  getPersistedPdfModelArtifactSnapshot,
} from "@/server/services/pdf-model-artifact-snapshot-service";

const patchSchema = z.object({
  action: z.literal("archive"),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const { artifactId } = await params;
  const data = await getPersistedPdfModelArtifactSnapshot(artifactId);
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const { error } = await requireFinancialReviewer();
  if (error) return error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { artifactId } = await params;
  try {
    const data = await archivePersistedPdfModelArtifactSnapshot(artifactId);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
