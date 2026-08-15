import { Prisma } from "@prisma/client";

import type { SsbClassificationCode } from "@/integrations/ssb/ssb-industry-code-provider";
import { SsbIndustryCodeProvider } from "@/integrations/ssb/ssb-industry-code-provider";
import env from "@/lib/env";
import { prisma } from "@/lib/prisma";

const DEFAULT_CLASSIFICATION_IDS = [env.ssbIndustryClassificationId, "104", "131"];
const NEXT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1_000;

type SsbClassificationSource = {
  fetchClassificationCodes(
    classificationId: string,
    includeNotes?: boolean,
  ): Promise<SsbClassificationCode[]>;
};

export async function syncSsbClassifications(options: {
  classificationIds?: string[];
  provider?: SsbClassificationSource;
  now?: () => Date;
} = {}) {
  const classificationIds = Array.from(
    new Set(options.classificationIds ?? DEFAULT_CLASSIFICATION_IDS),
  );
  const provider = options.provider ?? new SsbIndustryCodeProvider();
  const now = options.now ?? (() => new Date());
  const datasetVersions: string[] = [];
  let codeCount = 0;

  for (const classificationId of classificationIds) {
    const fetchedAt = now();
    const validAt = new Date(Date.UTC(
      fetchedAt.getUTCFullYear(),
      fetchedAt.getUTCMonth(),
      fetchedAt.getUTCDate(),
    ));
    const validDate = validAt.toISOString().slice(0, 10);
    const datasetVersion = `ssb-klass:${classificationId}:${validDate}`;
    const codes = await provider.fetchClassificationCodes(
      classificationId,
      classificationId === env.ssbIndustryClassificationId,
    );
    const normalizedAt = now();

    // An empty Klass response is not a valid replacement snapshot. Keep the
    // last known-good mirror intact and let the scheduled route surface the
    // source failure for alerting/retry.
    if (codes.length === 0) {
      throw new Error(`SSB_KLASS_EMPTY_RESPONSE:${classificationId}`);
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.ssbClassificationCode.deleteMany({
        where: { classificationId },
      });
      if (codes.length > 0) {
        await transaction.ssbClassificationCode.createMany({
          data: codes.map((code) => ({
            classificationId,
            datasetVersion,
            validAt,
            code: code.code,
            name: code.name ?? code.shortName ?? code.code,
            shortName: code.shortName ?? null,
            parentCode: code.parentCode ?? null,
            level: code.level ?? null,
            notes: code.notes ?? null,
            sourceSystem: "SSB_KLASS",
            sourceEntityType: "classificationCode",
            sourceId: `${classificationId}:${code.code}`,
            fetchedAt,
            normalizedAt,
            rawPayload: JSON.parse(JSON.stringify(code)) as Prisma.InputJsonValue,
          })),
        });
      }
      await transaction.ssbClassificationSyncState.upsert({
        where: { classificationId },
        update: {
          datasetVersion,
          validAt,
          status: "AVAILABLE",
          codeCount: codes.length,
          lastErrorCode: null,
          lastCheckedAt: fetchedAt,
          nextCheckAt: new Date(fetchedAt.getTime() + NEXT_SYNC_INTERVAL_MS),
          sourceSystem: "SSB_KLASS",
          sourceEntityType: "classificationSnapshot",
          sourceId: datasetVersion,
          fetchedAt,
          normalizedAt,
        },
        create: {
          classificationId,
          datasetVersion,
          validAt,
          status: "AVAILABLE",
          codeCount: codes.length,
          lastErrorCode: null,
          lastCheckedAt: fetchedAt,
          nextCheckAt: new Date(fetchedAt.getTime() + NEXT_SYNC_INTERVAL_MS),
          sourceSystem: "SSB_KLASS",
          sourceEntityType: "classificationSnapshot",
          sourceId: datasetVersion,
          fetchedAt,
          normalizedAt,
        },
      });
    });

    codeCount += codes.length;
    datasetVersions.push(datasetVersion);
  }

  return {
    classifications: classificationIds.length,
    codes: codeCount,
    datasetVersions,
  };
}
