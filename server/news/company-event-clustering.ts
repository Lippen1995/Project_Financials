import { normalizeTitleCore } from "@/server/news/company-event-fingerprinting";

export type EventClusterDocument = {
  id: string;
  title: string;
  publishedAt?: Date | null;
  sourceId?: string | null;
  contentHash?: string | null;
  documentFingerprint?: string | null;
};

export type EventDuplicateCluster = {
  clusterKey: string;
  duplicateCount: number;
  sourceCount: number;
  isFollowUp: boolean;
};

function dateBucket(date?: Date | null) {
  if (!date) return "undated";
  return date.toISOString().slice(0, 10);
}

export function buildDocumentClusterKey(document: EventClusterDocument) {
  return [normalizeTitleCore(document.title), dateBucket(document.publishedAt)].join("|");
}

export function clusterEventDocuments(documents: EventClusterDocument[]): EventDuplicateCluster {
  if (documents.length === 0) {
    return {
      clusterKey: "empty",
      duplicateCount: 0,
      sourceCount: 0,
      isFollowUp: false,
    };
  }

  const first = documents[0];
  const clusterKey = buildDocumentClusterKey(first);
  const sourceCount = new Set(documents.map((document) => document.sourceId).filter(Boolean)).size;
  const uniqueContentCount = new Set(
    documents.map((document) => document.contentHash ?? document.documentFingerprint ?? document.id),
  ).size;

  return {
    clusterKey,
    duplicateCount: Math.max(0, documents.length - uniqueContentCount),
    sourceCount,
    isFollowUp: documents.length > 1 && sourceCount > 1,
  };
}
