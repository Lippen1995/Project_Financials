/**
 * Correct the Fjord Defence modeling. fjorddefence.com is the OPERATING product company
 * (weapon accessories) = Fjord Defence AS (918699856), not the consolidator. The row was
 * wrongly keyed to the GROUP ASA (917811288), whose actual business model is a DEFENCE
 * CONSOLIDATOR (buy-and-build). Split them: product scrape → operating co; consolidator thesis
 * → parent. The parent's summary encodes the target-selection rubric for the search-LLM.
 */
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const CORPUS_PATH =
  process.argv[2] ?? process.env.CORPUS_PATH ?? "output/ai-search/corpus.json";

const OPERATING_ORG = "918699856"; // FJORD DEFENCE AS (product company, fjorddefence.com)
const GROUP_ORG = "917811288"; // FJORD DEFENCE GROUP ASA (the consolidator / acquirer)

const OPERATING_SUMMARY =
  "Operating product company (the Fjord Defence brand, fjorddefence.com) — ONE holding under the " +
  "Fjord Defence Group consolidator (see 917811288). Specialises in weapon ACCESSORIES & mounting/" +
  "stabilisation systems for light/medium machine guns: ground mounts, tripods, weapon carriers, " +
  "vehicle mounts (skate/ring/swing-arm, pintle interface), maritime mounts (pedestals & gunwales in " +
  "316 stainless for RIBs/patrol/naval), sight mounts, triggers, ballistic shields, accessories. " +
  "Small, agile, user-driven engineering; 'soft mount' technology improves hit probability and reduces " +
  "recoil. Value chain: weapon-to-platform integration hardware.";

const GROUP_SUMMARY =
  "DEFENCE CONSOLIDATOR (buy-and-build platform) — this is the ACQUIRER. Fjord Defence Group ASA's " +
  "business model is NOT single-product operation: it acquires smaller defence companies and assembles " +
  "them into a larger group with a broad defence portfolio (holdings include the weapon-accessories " +
  "maker Fjord Defence AS and the acquired Frydenbø Milpro). Therefore its acquisition-target thesis is " +
  "portfolio ROLL-UP, not product adjacency: the right targets are acquirable defence SMEs across many " +
  "niches that add portfolio breadth. Rank candidates for this acquirer by ACQUIRABILITY (concentrated / " +
  "willing ownership, standalone — not already inside a big group, founder succession / PE-exit), SIZE " +
  "(small enough to bolt on), FINANCIAL QUALITY (profitable, growing, defensible niche) and PORTFOLIO " +
  "FIT (adds or consolidates a capability) — NOT by similarity to any one existing holding.";

async function main() {
  const corpus: Array<{ org: string; company: string; url: string; text: string; pages: number }> =
    JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
  const fdScrape = corpus.find((e) => e.org === GROUP_ORG); // the fjorddefence.com product scrape

  // 1. Operating product company gets the product scrape + product summary.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompanyWebProfile"
       ("orgNumber","companyName","sourceUrl","scrapedText","businessSummary","pagesScraped","scrapedAt","reasonedAt","provenance")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW(),'website-scrape')
     ON CONFLICT ("orgNumber") DO UPDATE SET
       "companyName"=EXCLUDED."companyName","sourceUrl"=EXCLUDED."sourceUrl",
       "scrapedText"=EXCLUDED."scrapedText","businessSummary"=EXCLUDED."businessSummary",
       "pagesScraped"=EXCLUDED."pagesScraped","scrapedAt"=NOW(),"reasonedAt"=NOW()`,
    OPERATING_ORG,
    "FJORD DEFENCE AS",
    "https://www.fjorddefence.com/",
    fdScrape?.text ?? "",
    OPERATING_SUMMARY,
    fdScrape?.pages ?? 0,
  );

  // 2. Parent = the consolidator. Business-model summary (no product scrape — the product site is the
  //    operating co). provenance flags this as reasoned corporate context, not a website scrape.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CompanyWebProfile"
       ("orgNumber","companyName","sourceUrl","scrapedText","businessSummary","pagesScraped","scrapedAt","reasonedAt","provenance")
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW(),'reasoned-business-model')
     ON CONFLICT ("orgNumber") DO UPDATE SET
       "companyName"=EXCLUDED."companyName","sourceUrl"=EXCLUDED."sourceUrl",
       "scrapedText"=EXCLUDED."scrapedText","businessSummary"=EXCLUDED."businessSummary",
       "pagesScraped"=EXCLUDED."pagesScraped","scrapedAt"=NOW(),"reasonedAt"=NOW(),"provenance"='reasoned-business-model'`,
    GROUP_ORG,
    "FJORD DEFENCE GROUP ASA",
    "https://www.fjorddefence.com/",
    "Defence consolidator / buy-and-build platform. Portfolio holdings include Fjord Defence AS (weapon accessories) and Frydenbø Milpro. See businessSummary for the acquisition-target rubric.",
    GROUP_SUMMARY,
    0,
  );

  const rows = await prisma.$queryRawUnsafe<Array<{ orgNumber: string; companyName: string; businessSummary: string }>>(
    `SELECT "orgNumber","companyName","businessSummary" FROM "CompanyWebProfile" WHERE "orgNumber" IN ($1,$2) ORDER BY "orgNumber"`,
    OPERATING_ORG,
    GROUP_ORG,
  );
  for (const r of rows) console.log(`\n● ${r.companyName} (${r.orgNumber})\n   ${r.businessSummary}`);
  const total = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "CompanyWebProfile"`);
  console.log(`\nCompanyWebProfile now holds ${total[0].count} rows.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
