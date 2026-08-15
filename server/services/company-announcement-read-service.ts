import { prisma } from "@/lib/prisma";
import { logRecoverableError } from "@/lib/recoverable-error";
import type {
  DataAvailability,
  NormalizedAnnouncement,
  NormalizedAnnouncementDetail,
} from "@/lib/types";

const SOURCE_ID = "brreg-announcements";
const PENDING_MESSAGE =
  "Kunngjøringer er ikke lastet ennå. Virksomheten er lagt i kø for bakgrunnshenting.";

export type StoredCompanyAnnouncements = {
  announcements: NormalizedAnnouncement[];
  availability: DataAvailability;
  allAnnouncementsUrl: string | null;
};

async function queueIfUntracked(companyId: string, orgNumber: string) {
  const now = new Date();
  try {
    await prisma.companyAnnouncementFetchState.create({
      data: {
        companyId,
        status: "PENDING",
        unavailableReason: null,
        allAnnouncementsUrl: null,
        lastCheckedAt: now,
        nextCheckAt: now,
        failureCount: 0,
        lastErrorCode: null,
        announcementCount: 0,
        sourceSystem: "BRREG",
        sourceEntityType: "announcementListQueued",
        sourceId: orgNumber,
        fetchedAt: now,
        normalizedAt: now,
      },
    });
  } catch (error) {
    // Concurrent page views may race to create the unique state row. The first
    // one wins; the request still returns the same honest pending state.
    logRecoverableError("company-announcements.queue", error, { orgNumber });
  }
}

export async function getStoredCompanyAnnouncements(
  orgNumber: string,
): Promise<StoredCompanyAnnouncements> {
  const company = await prisma.company.findUnique({
    where: { orgNumber },
    select: { id: true },
  });
  if (!company) {
    return {
      announcements: [],
      availability: {
        available: false,
        status: "UNAVAILABLE",
        sourceSystem: "BRREG",
        message: "Virksomheten finnes ikke i det lokale registerspeilet.",
      },
      allAnnouncementsUrl: null,
    };
  }

  const state = await prisma.companyAnnouncementFetchState.findUnique({
    where: { companyId: company.id },
  });
  if (!state) {
    await queueIfUntracked(company.id, orgNumber);
    return {
      announcements: [],
      availability: {
        available: false,
        status: "PENDING",
        sourceSystem: "BRREG",
        sourceEntityType: "announcementListQueued",
        sourceId: orgNumber,
        message: PENDING_MESSAGE,
      },
      allAnnouncementsUrl: null,
    };
  }

  const rows = state.status === "AVAILABLE"
    ? await prisma.sourceDocument.findMany({
        where: {
          sourceId: SOURCE_ID,
          sourcePayload: { path: ["orgNumber"], equals: orgNumber },
        },
        orderBy: [{ publishedAt: "desc" }, { externalId: "desc" }],
      })
    : [];
  const announcements = rows.flatMap<NormalizedAnnouncement>((row) => {
    if (!row.externalId) return [];
    return [{
      sourceSystem: "BRREG",
      sourceEntityType: "announcement",
      sourceId: row.externalId,
      fetchedAt: row.fetchedAt,
      normalizedAt: row.normalizedAt,
      rawPayload: row.sourcePayload,
      id: row.externalId,
      orgNumber,
      title: row.title,
      publishedAt: row.publishedAt,
      year: row.publishedAt?.getUTCFullYear() ?? null,
      detailUrl: row.canonicalUrl,
    }];
  });

  const status: DataAvailability["status"] =
    state.status === "AVAILABLE"
      ? "AVAILABLE"
      : state.status === "ERROR"
        ? "ERROR"
        : state.status === "PENDING"
          ? "PENDING"
          : "UNAVAILABLE";

  return {
    announcements,
    availability: {
      available: status === "AVAILABLE",
      status,
      sourceSystem: "BRREG",
      sourceEntityType: state.sourceEntityType,
      sourceId: state.sourceId,
      fetchedAt: state.fetchedAt,
      normalizedAt: state.normalizedAt,
      nextCheckAt: state.nextCheckAt,
      message:
        status === "PENDING"
          ? PENDING_MESSAGE
          : status === "AVAILABLE"
            ? announcements.length > 0
              ? `Kunngjøringer er lest fra lokal database (${announcements.length} registrerte hendelser).`
              : "Brreg har ingen registrerte kunngjøringer for denne virksomheten."
            : state.unavailableReason ?? "Kunngjøringer er midlertidig utilgjengelige.",
    },
    allAnnouncementsUrl: state.allAnnouncementsUrl,
  };
}

export async function getStoredCompanyAnnouncementDetail(
  orgNumber: string,
  announcementId: string,
): Promise<NormalizedAnnouncementDetail | null> {
  const row = await prisma.sourceDocument.findFirst({
    where: {
      sourceId: SOURCE_ID,
      externalId: announcementId,
      sourcePayload: { path: ["orgNumber"], equals: orgNumber },
    },
  });
  if (!row || !row.externalId || !row.sourcePayload || typeof row.sourcePayload !== "object" || Array.isArray(row.sourcePayload)) {
    return null;
  }

  const payload = row.sourcePayload as Record<string, unknown>;
  const contentHtml = typeof payload.contentHtml === "string" ? payload.contentHtml.trim() : "";
  if (!contentHtml) {
    return null;
  }

  return {
    sourceSystem: "BRREG",
    sourceEntityType: "announcementDetail",
    sourceId: row.externalId,
    fetchedAt: row.fetchedAt,
    normalizedAt: row.normalizedAt,
    rawPayload: row.sourcePayload,
    id: row.externalId,
    orgNumber,
    title: row.title,
    publishedAt: row.publishedAt,
    sourceLabel: typeof payload.sourceLabel === "string" ? payload.sourceLabel : null,
    detailUrl: row.canonicalUrl,
    contentHtml,
  };
}
