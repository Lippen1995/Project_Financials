import type { SerializableSourceMetadata } from "./types";

export type NjordFinancialMetric =
  | "revenue"
  | "netMargin"
  | "operatingMargin"
  | "netIncome"
  | "operatingProfit"
  | "equity"
  | "assets";

export type NjordScatterPoint = {
  orgNumber: string;
  name: string;
  x: number;
  y: number;
  fiscalYear: number;
  currency: string;
  storeCount: number;
  provenance: {
    chainOperator: SerializableSourceMetadata;
    financialStatement: SerializableSourceMetadata;
  };
};

export type NjordVisualization = {
  state: "rendered" | "suggested";
  kind: "scatter";
  title: string;
  description: string;
  suggestionLabel: string | null;
  chain: {
    slug: string;
    name: string;
    confidence: number | null;
    builtAt: string;
    provenance: SerializableSourceMetadata;
  };
  xAxis: { metric: NjordFinancialMetric; label: string; unit: "NOK" | "percent" };
  yAxis: { metric: NjordFinancialMetric; label: string; unit: "NOK" | "percent" };
  points: NjordScatterPoint[];
  coverage: {
    operatorCount: number;
    withLatestFinancials: number;
    plottedCount: number;
  };
  sourceNote: string;
};
