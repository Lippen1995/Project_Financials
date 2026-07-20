import type {
  NjordFinancialMetric,
  NjordVisualization,
} from "@/lib/njord-visualization";
import type { SerializableSourceMetadata } from "@/lib/types";
import type { AgentToolResult } from "./agent-loop";

type ChainFinancialsToolOutput = {
  chain: {
    slug: string;
    name: string;
    confidence: number | null;
    builtAt: string;
    provenance: SerializableSourceMetadata;
  } | null;
  operators: Array<{
    orgNumber: string;
    name: string | null;
    storeCount: number;
    provenance: SerializableSourceMetadata;
    latestFinancials: {
      fiscalYear: number;
      currency: string;
      revenue: number | null;
      operatingProfit: number | null;
      netIncome: number | null;
      equity: number | null;
      assets: number | null;
      provenance: SerializableSourceMetadata;
    } | null;
  }>;
  coverage: {
    operatorCount: number;
    withLatestFinancials: number;
  };
};

type MetricDefinition = {
  metric: NjordFinancialMetric;
  label: string;
  unit: "NOK" | "percent";
  patterns: RegExp[];
};

const METRICS: MetricDefinition[] = [
  { metric: "netMargin", label: "Nettomargin", unit: "percent", patterns: [/nettomargin/i] },
  { metric: "operatingMargin", label: "Driftsmargin", unit: "percent", patterns: [/driftsmargin/i] },
  { metric: "revenue", label: "Omsetning", unit: "NOK", patterns: [/omsetning/i, /driftsinntekt/i, /revenue/i] },
  { metric: "operatingProfit", label: "Driftsresultat", unit: "NOK", patterns: [/driftsresultat/i, /operating profit/i] },
  { metric: "netIncome", label: "Årsresultat", unit: "NOK", patterns: [/årsresultat/i, /aarsresultat/i, /nettoresultat/i, /net income/i] },
  { metric: "equity", label: "Egenkapital", unit: "NOK", patterns: [/egenkapital/i, /equity/i] },
  { metric: "assets", label: "Eiendeler", unit: "NOK", patterns: [/eiendeler/i, /assets/i] },
];

const EXPLICIT_PLOT = /\b(plott|plot|tegn|visualiser|visualize|scatter|spredningsdiagram)\b|[xy]\s*[- ]?\s*aks/i;
const PROFITABILITY = /\b(lønnsom\w*|nettomargin|driftsmargin|marginer?|profit\w*)\b/i;

function getChainFinancials(results: AgentToolResult[]): ChainFinancialsToolOutput | null {
  const result = results.find((candidate) => candidate.name === "get_chain_financials");
  if (!result?.output || typeof result.output !== "object") return null;
  return result.output as ChainFinancialsToolOutput;
}

function metricMentionRanges(query: string, definition: MetricDefinition): Array<{ start: number; end: number }> {
  return definition.patterns.flatMap((pattern) => {
    const match = pattern.exec(query);
    return match?.index == null
      ? []
      : [{ start: match.index, end: match.index + match[0].length }];
  });
}

function metricForAxis(query: string, axis: "x" | "y"): MetricDefinition | null {
  const axisIndex = query.search(new RegExp(`\\b${axis}\\s*[- ]?\\s*aks\\w*`, "i"));
  if (axisIndex < 0) return null;

  const nearest = METRICS.flatMap((definition) =>
    metricMentionRanges(query, definition).map((range) => ({
      definition,
      distance: Math.min(
        Math.abs(range.start - axisIndex),
        Math.abs(range.end - axisIndex),
      ),
    })),
  ).sort((left, right) => left.distance - right.distance)[0];
  return nearest && nearest.distance <= 64 ? nearest.definition : null;
}

function resolveAxes(query: string): { x: MetricDefinition; y: MetricDefinition } {
  let x = metricForAxis(query, "x");
  let y = metricForAxis(query, "y");
  const revenue = METRICS.find((metric) => metric.metric === "revenue")!;
  const netMargin = METRICS.find((metric) => metric.metric === "netMargin")!;

  if (!x && !y) return { x: revenue, y: netMargin };
  if (!x) x = y?.metric === "revenue" ? netMargin : revenue;
  if (!y) y = x.metric === "netMargin" ? revenue : netMargin;
  if (x.metric === y.metric) {
    y = x.metric === "revenue" ? netMargin : revenue;
  }
  return { x, y };
}

function metricValue(
  metric: NjordFinancialMetric,
  financials: NonNullable<ChainFinancialsToolOutput["operators"][number]["latestFinancials"]>,
): number | null {
  if (metric === "netMargin" || metric === "operatingMargin") {
    if (financials.revenue == null || financials.revenue <= 0) return null;
    const numerator = metric === "netMargin" ? financials.netIncome : financials.operatingProfit;
    return numerator == null
      ? null
      : Number(((numerator / financials.revenue) * 100).toFixed(2));
  }
  return financials[metric] ?? null;
}

export function buildNjordVisualization(
  query: string,
  toolResults: AgentToolResult[],
): NjordVisualization | null {
  const state = EXPLICIT_PLOT.test(query)
    ? "rendered"
    : PROFITABILITY.test(query)
      ? "suggested"
      : null;
  if (!state) return null;

  const output = getChainFinancials(toolResults);
  if (!output?.chain) return null;
  const axes = resolveAxes(query);
  const requiresNok = axes.x.unit === "NOK" || axes.y.unit === "NOK";

  const points = output.operators.flatMap((operator) => {
    const financials = operator.latestFinancials;
    if (!financials || (requiresNok && financials.currency !== "NOK")) return [];
    const x = metricValue(axes.x.metric, financials);
    const y = metricValue(axes.y.metric, financials);
    if (x == null || y == null) return [];
    return [{
      orgNumber: operator.orgNumber,
      name: operator.name ?? operator.orgNumber,
      x,
      y,
      fiscalYear: financials.fiscalYear,
      currency: financials.currency,
      storeCount: operator.storeCount,
      provenance: {
        chainOperator: operator.provenance,
        financialStatement: financials.provenance,
      },
    }];
  });

  const defaultProfitabilityPlot =
    axes.x.metric === "revenue" && axes.y.metric === "netMargin";
  return {
    state,
    kind: "scatter",
    title: defaultProfitabilityPlot
      ? `Lønnsomhet i ${output.chain.name}`
      : `${axes.y.label} mot ${axes.x.label} i ${output.chain.name}`,
    description:
      `Hvert punkt er et utledet operatørselskap. Plasseringen viser siste tilgjengelige ${axes.x.label.toLowerCase()} og ${axes.y.label.toLowerCase()}.`,
    suggestionLabel: state === "suggested" ? "Plott nettomargin mot omsetning" : null,
    chain: output.chain,
    xAxis: axes.x,
    yAxis: axes.y,
    points,
    coverage: {
      ...output.coverage,
      plottedCount: points.length,
    },
    sourceNote:
      "Kjedetilhørighet er utledet fra Brønnøysundregistrenes underenhetsnavn og er ikke et offisielt franchisefelt. Regnskapspunktene bruker siste tilgjengelige selskapsregnskap med full kildeproveniens.",
  };
}
