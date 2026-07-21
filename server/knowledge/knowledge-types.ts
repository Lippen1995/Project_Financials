import type {
  EeaIncorporationStatusValue,
  KnowledgeDocumentTypeValue,
  KnowledgeDomainValue,
  KnowledgeJurisdictionValue,
  KnowledgeLegalStatusValue,
  NorwayImplementationStatusValue,
} from "./knowledge-domain";

export type KnowledgeSearchInput = {
  query: string;
  domains: KnowledgeDomainValue[];
  jurisdictions?: KnowledgeJurisdictionValue[];
  asOf: Date;
  limit: number;
};

export type KnowledgeSearchResult = {
  citationId: string;
  documentId: string;
  externalId: string;
  title: string;
  authority: string;
  jurisdiction: KnowledgeJurisdictionValue;
  domain: KnowledgeDomainValue;
  documentType: KnowledgeDocumentTypeValue;
  legalStatus: KnowledgeLegalStatusValue;
  provisionRef: string | null;
  heading: string | null;
  excerpt: string;
  sourceUrl: string;
  publishedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  eeaStatus: {
    incorporationStatus: EeaIncorporationStatusValue;
    decisionReference: string | null;
    incorporatedAt: string | null;
    effectiveFrom: string | null;
  };
  norwayImplementation: {
    status: NorwayImplementationStatusValue;
    implementingReference: string | null;
    implementedAt: string | null;
  };
  effectiveAtDate: boolean;
  relevanceScore: number;
  provenance: {
    sourceSystem: string;
    sourceEntityType: string;
    sourceId: string;
    fetchedAt: string;
    normalizedAt: string;
  };
};

export type KnowledgeRuleStatusResult = {
  asOf: string;
  matched: boolean;
  candidates: KnowledgeSearchResult[];
};
