import { DdCompanyProfileField, DdFindingEvidenceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { createDdFindingEvidence } from "@/server/services/dd-investment-service";

const evidenceSchema = z.object({
  type: z.nativeEnum(DdFindingEvidenceType),
  note: z.string().trim().optional(),
  companyProfileField: z.nativeEnum(DdCompanyProfileField).optional(),
  financialStatementId: z.string().optional(),
  taskId: z.string().optional(),
  findingReferenceId: z.string().optional(),
  announcementId: z.string().optional(),
  announcementSourceId: z.string().optional(),
  announcementSourceSystem: z.string().trim().optional(),
  announcementPublishedAt: z.string().optional(),
  announcementLabel: z.string().trim().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ findingId: string }> }) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { findingId } = await params;
    const body = await request.json();
    const values = evidenceSchema.parse(body);
    const data = await createDdFindingEvidence(session.user.id, findingId, {
      ...values,
      announcementPublishedAt: values.announcementPublishedAt ? new Date(values.announcementPublishedAt) : null,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke legge til evidens." },
      { status: 400 },
    );
  }
}
