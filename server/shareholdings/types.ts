import { ShareholdingSourceSystem, ShareholderType } from "@/lib/types";

export type ShareholdingColumnMapping = {
  issuerOrgNumber?: string;
  issuerName?: string;
  shareholderName: string;
  shareholderIdentifier?: string;
  birthYear?: string;
  postalCode?: string;
  postalPlace?: string;
  shareClass?: string;
  numberOfShares: string;
  totalShares?: string;
};

export type ParsedShareholdingRow = {
  rowNumber: number;
  issuerOrgNumber?: string | null;
  issuerName?: string | null;
  shareholderName: string;
  shareholderIdentifier?: string | null;
  birthYear?: number | null;
  postalCode?: string | null;
  postalPlace?: string | null;
  shareClass?: string | null;
  numberOfShares?: bigint | null;
  totalShares?: bigint | null;
  raw: Record<string, string>;
};

export type ShareholdingImportValidationError = {
  stage: string;
  rowNumber?: number;
  message: string;
  payload?: unknown;
};

export type NormalizedShareholdingRow = {
  rowNumber: number;
  shareholderName: string;
  normalizedName: string;
  shareholderType: ShareholderType;
  shareholderIdentifier?: string | null;
  birthYear?: number | null;
  postalCode?: string | null;
  postalPlace?: string | null;
  shareClass?: string | null;
  numberOfShares: bigint;
  totalShares?: bigint | null;
  fingerprint: string;
  sourceRowKey: string;
  raw: Record<string, string>;
};

export type ShareholdingResolutionResult = {
  type: ShareholderType;
  linkedCompanyId?: string | null;
  linkedCompanyOrgNumber?: string | null;
  linkedCompanyName?: string | null;
  confidence?: number | null;
};

export type ShareholdingImportInput = {
  orgNumber: string;
  taxYear: number;
  sourceSystem?: ShareholdingSourceSystem;
  sourceKey: string;
  rawText: string;
  columnMapping?: ShareholdingColumnMapping;
};

export type ShareholdingOwnershipAggregate = {
  fingerprint: string;
  shareholderName: string;
  normalizedName: string;
  shareholderType: ShareholderType;
  shareholderIdentifier?: string | null;
  birthYear?: number | null;
  postalCode?: string | null;
  postalPlace?: string | null;
  shareClass?: string | null;
  numberOfShares: bigint;
  totalShares?: bigint | null;
  sourceRowKeys: string[];
  rows: NormalizedShareholdingRow[];
};
