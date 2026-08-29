import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ jobId: z.string().cuid() }).strict();

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Krever innlogging." }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Ugyldig jobb-id." }, { status: 400 });
  }
  const { jobId } = parsedParams.data;
  const job = await prisma.aiSearchJob.findFirst({
    where: { id: jobId, userId: session.user.id },
    select: {
      id: true,
      status: true,
      result: true,
      errorMessage: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!job) {
    return NextResponse.json({ error: "AI-jobben finnes ikke." }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    result: job.status === "COMPLETED" ? job.result : null,
    error: job.status === "FAILED" ? job.errorMessage : null,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
}
