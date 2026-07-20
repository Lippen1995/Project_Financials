import { z } from "zod";

import { findChainProfile } from "@/server/franchise/chain-service";
import type { SerializableSourceMetadata } from "@/lib/types";
import { getLatestFinancialsByOrgNumbers } from "./enrich";
import { defineTool, type FinancialSnapshot } from "./types";

const inputSchema = z.object({
  chainQuery: z.string().min(2, "chainQuery is required"),
});

export type GetChainFinancialsInput = z.infer<typeof inputSchema>;

export type ChainFinancialOperator = {
  orgNumber: string;
  name: string | null;
  storeCount: number;
  latestFinancials: FinancialSnapshot | null;
  provenance: SerializableSourceMetadata;
};

export type GetChainFinancialsOutput = {
  chain: {
    slug: string;
    name: string;
    storeCount: number;
    operatorCount: number;
    confidence: number | null;
    builtAt: string;
    provenance: SerializableSourceMetadata;
  } | null;
  operators: ChainFinancialOperator[];
  coverage: {
    operatorCount: number;
    withLatestFinancials: number;
    plottableCount: number;
  };
};

export const getChainFinancialsTool = defineTool<
  GetChainFinancialsInput,
  GetChainFinancialsOutput
>({
  name: "get_chain_financials",
  description:
    "Resolve a Norwegian retail/franchise chain mentioned in natural language and return every " +
    "known operating company with its latest available company-scope financial statement. Use for " +
    "chain comparisons, profitability analysis and plots. Chain membership is derived from official " +
    "Brønnøysund subunit names; missing financials mean unknown, never zero.",
  inputSchema,
  parameters: {
    type: "object",
    properties: {
      chainQuery: {
        type: "string",
        description: "Chain name or the user's full question containing it, such as 'REMA1000'.",
      },
    },
    required: ["chainQuery"],
    additionalProperties: false,
  },
  async execute({ chainQuery }) {
    const profile = await findChainProfile(chainQuery);
    if (!profile) {
      return {
        chain: null,
        operators: [],
        coverage: { operatorCount: 0, withLatestFinancials: 0, plottableCount: 0 },
      };
    }

    const financialsByOrgNumber = await getLatestFinancialsByOrgNumbers(
      profile.operators.map((operator) => operator.orgNumber),
    );
    const builtAt = profile.builtAt.toISOString();
    const operators = profile.operators.map((operator) => ({
      ...operator,
      latestFinancials: financialsByOrgNumber.get(operator.orgNumber) ?? null,
      provenance: {
        sourceSystem: "BRREG",
        sourceEntityType: "derivedRetailChainOperator",
        sourceId: `${profile.slug}:${operator.orgNumber}`,
        fetchedAt: builtAt,
        normalizedAt: builtAt,
      },
    }));

    return {
      chain: {
        slug: profile.slug,
        name: profile.name,
        storeCount: profile.storeCount,
        operatorCount: profile.operatorCount,
        confidence: profile.confidence,
        builtAt,
        provenance: {
          sourceSystem: "BRREG",
          sourceEntityType: "derivedRetailChain",
          sourceId: profile.slug,
          fetchedAt: builtAt,
          normalizedAt: builtAt,
        },
      },
      operators,
      coverage: {
        operatorCount: operators.length,
        withLatestFinancials: operators.filter((operator) => operator.latestFinancials !== null).length,
        plottableCount: operators.filter((operator) => {
          const financials = operator.latestFinancials;
          return (
            financials?.revenue != null &&
            financials.revenue > 0 &&
            financials.netIncome != null &&
            financials.currency === "NOK"
          );
        }).length,
      },
    };
  },
});
