import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

const inputSchema = z.object({
  query: z.string().min(2, "query is required"),
  limit: z.number().int().min(1).max(25).optional(),
});

export type FindByBusinessInput = z.infer<typeof inputSchema>;

export type BusinessMatch = {
  orgNumber: string;
  companyName: string | null;
  sourceUrl: string | null;
  businessSummary: string | null;
  score: number;
};

export type FindByBusinessOutput = {
  matches: BusinessMatch[];
};

/**
 * Candidate generation by WHAT A COMPANY DOES, not by industry code. Full-text search over the
 * offline-built CompanyWebProfile corpus (reasoned business descriptions from company websites),
 * so a query like "controllable pitch propeller" or "naval defence electronics" retrieves the
 * companies whose products/value-chain match — across NACE boundaries that a code join would miss.
 *
 * Read via raw SQL: the corpus table is queried directly (Postgres FTS with ranking), which also
 * keeps working before the Prisma client is regenerated to include the CompanyWebProfile model.
 */
export const findByBusinessTool = defineTool<FindByBusinessInput, FindByBusinessOutput>({
  name: "find_by_business",
  description:
    "Find companies by what they actually do — products, services, and value-chain position — via " +
    "free-text search over reasoned business descriptions built from company websites. Use this to " +
    "generate candidates for competitor, acquisition-target, or supply-chain questions when NACE " +
    "industry codes are too coarse or unset. Returns each match WITH its business summary so you can " +
    "reason about strategic fit. Query with product/capability terms (e.g. 'thruster propulsion', " +
    "'naval defence systems'), not company names.",
  inputSchema,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Free-text product/capability/value-chain terms to match (e.g. 'controllable pitch propeller').",
      },
      limit: { type: "number", description: "Max results to return (default 10)." },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute({ query, limit }) {
    const take = limit ?? 10;

    // Candidate generation wants OR semantics (match ANY term), ranked by how well the profile
    // matches — not websearch_to_tsquery's AND (which needs every term in one document and returns
    // nothing for a broad query like "machine gun mount pedestal stabilisation"). Build an OR
    // tsquery from sanitized words; ts_rank then rewards profiles that match more/stronger terms.
    const terms = (query.toLowerCase().match(/[a-zæøå0-9]+/gi) ?? []).filter((t) => t.length >= 2);
    if (terms.length === 0) {
      return { matches: [] };
    }
    const tsQuery = terms.join(" | ");

    // 'simple' config avoids stemming-language mismatch on the mixed Norwegian/English corpus.
    const rows = await prisma.$queryRawUnsafe<
      Array<{ orgNumber: string; companyName: string | null; sourceUrl: string | null; businessSummary: string | null; score: number }>
    >(
      `SELECT "orgNumber", "companyName", "sourceUrl", "businessSummary",
              ts_rank(
                to_tsvector('simple', coalesce("businessSummary",'') || ' ' || coalesce("scrapedText",'')),
                to_tsquery('simple', $1)
              ) AS score
         FROM "CompanyWebProfile"
        WHERE to_tsvector('simple', coalesce("businessSummary",'') || ' ' || coalesce("scrapedText",''))
              @@ to_tsquery('simple', $1)
        ORDER BY score DESC
        LIMIT $2`,
      tsQuery,
      take,
    );

    return {
      matches: rows.map((r) => ({
        orgNumber: r.orgNumber,
        companyName: r.companyName,
        sourceUrl: r.sourceUrl,
        businessSummary: r.businessSummary,
        score: Number(r.score),
      })),
    };
  },
});
