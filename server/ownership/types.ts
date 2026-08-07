import type { OwnershipRelationship } from "@/server/ownership/ownership-thresholds";

export type { OwnershipRelationship };

/** A single company in a rendered group (konsern) tree. */
export type GroupNode = {
  orgNumber: string;
  name: string;
  /** Relationship this node has to its parent in the tree (null for the root). */
  relationshipToParent: OwnershipRelationship | null;
  /** Percentage the parent owns of this node (null for the root). */
  ownershipPercent: number | null;
  /** 0 = root of the rendered tree (konsernspiss, or the company itself). */
  depth: number;
  parentOrgNumber: string | null;
  /** The company the user is currently viewing. */
  isCurrent: boolean;
  /** Number of direct children present in this tree (for collapse/expand UI). */
  childCount: number;
  /** Registry status from the local Company table, when known (null = not loaded). */
  status?: "ACTIVE" | "DISSOLVED" | "BANKRUPT" | null;
};

export type GroupStructure = {
  year: number;
  /** Root of the rendered tree: the konsernspiss, or the current company if it has no parent. */
  rootOrgNumber: string;
  currentOrgNumber: string;
  /** Set when the current company is controlled (>50 %) from above. */
  ultimateParent: { orgNumber: string; name: string } | null;
  /** Flattened tree including the root, in breadth-first order. */
  nodes: GroupNode[];
  /** True when depth or node-count limits stopped the traversal short. */
  truncated: boolean;
  /** Status of the Skatteetaten import the published snapshot was built from. */
  sourceImportStatus?: "COMPLETED" | "PARTIAL";
  /** Consumers may show a definitive group label only for RESOLVED membership. */
  membershipStatus?: "RESOLVED" | "UNKNOWN" | "CONFLICT";
  ruleVersion?: string;
};

/** A direct shareholder (person or company) of a company, aggregated across share classes. */
export type DirectShareholder = {
  type: "PERSON" | "COMPANY" | "UNKNOWN";
  orgNumber: string | null;
  name: string;
  birthYear: number | null;
  postalPlace: string | null;
  countryCode: string | null;
  shares: string;
  ownershipPercent: number | null;
};

/** A company that the viewed company holds shares in. */
export type CompanyHolding = {
  orgNumber: string;
  name: string;
  shares: string;
  ownershipPercent: number | null;
  relationship: OwnershipRelationship | "FINANCIAL_POSITION";
};

/** Everything the Eierskap tab needs for a single tax year. */
export type OwnershipOverview = {
  orgNumber: string;
  companyName: string;
  year: number | null;
  availableYears: number[];
  /** Exact Skatteetaten import used for the raw ownership lists. */
  sourceImportStatus: "COMPLETED" | "PARTIAL" | null;
  group: GroupStructure | null;
  directShareholders: DirectShareholder[];
  holdings: CompanyHolding[];
  availabilityMessage: string | null;
};
