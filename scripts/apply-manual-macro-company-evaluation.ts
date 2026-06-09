import { readFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SAMPLE_PATH = ".codex-macro-company-candidates.json";
const REVIEWER_EMAIL = "qa-shareholder-admin@example.test";
const BATCH_MARKER = "Manual cross-company macro QA batch 2026-06-08";

type Pair = {
  articleId: string;
  companyId: string;
  companyName: string;
  title: string;
  summary: string | null;
  source: string;
  petroleumExposure: {
    operatorFieldCount: number;
    licenceCount: number;
    operatedProductionOe: number;
    remainingReservesOe: number;
  };
};

type Sample = {
  selectedPairs: number;
  selectedCompanies: number;
  selectedArticles: number;
  pairs: Pair[];
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function companyAdjustment(companyName: string, topic: "oil" | "gas" | "broad") {
  if (companyName === "NORTH ENERGY ASA") return topic === "broad" ? -20 : -15;
  if (companyName === "BLUENORD ASA") return topic === "gas" ? 8 : topic === "oil" ? -12 : -5;
  if (companyName === "AKER BP ASA") return topic === "gas" ? -8 : 5;
  if (companyName === "EQUINOR ASA") return -5;
  return 0;
}

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function judge(pair: Pair) {
  const text = `${pair.title} ${pair.summary ?? ""}`.toLowerCase();
  let relevanceScore = 18;
  let investorValueScore = 10;
  let topic: "oil" | "gas" | "broad" = "broad";
  let issueTags = ["us_domestic_context", "weak_company_transmission"];
  let rationale =
    "Energirelatert, men avgrenset amerikansk markedsinformasjon uten tydelig transmisjon til selskapets kontantstrøm.";

  if (includesAny(text, ["mideast disruption", "brent crude", "strait of hormuz"])) {
    topic = includesAny(text, ["lng", "natural gas"]) ? "gas" : "oil";
    relevanceScore = 92;
    investorValueScore = 88;
    issueTags = ["macro_energy", "material_price_driver", "geopolitical_supply_shock"];
    rationale =
      "Globalt tilbudssjokk eller Brent/LNG-prisendring påvirker realiserte priser og verdsettelse direkte.";
  } else if (includesAny(text, ["strategic petroleum reserve"])) {
    topic = "oil";
    relevanceScore = 78;
    investorValueScore = 68;
    issueTags = ["macro_energy", "oil_balance_driver"];
    rationale =
      "Frigivelse fra strategiske oljelagre påvirker global oljebalanse og kortsiktige prisforventninger.";
  } else if (includesAny(text, ["lng export terminal", "natural gas inventories", "natural gas for power generation"])) {
    topic = "gas";
    relevanceScore = 72;
    investorValueScore = 62;
    issueTags = ["macro_energy", "gas_market_driver"];
    rationale =
      "LNG-kapasitet, lagre eller kraftetterspørsel påvirker gassbalansen og er relevant for gasseksponerte produsenter.";
  } else if (includesAny(text, ["industrial natural gas consumption", "natural gas pipeline capacity"])) {
    topic = "gas";
    relevanceScore = 55;
    investorValueScore = 42;
    issueTags = ["macro_energy", "indirect_us_gas_demand"];
    rationale =
      "Amerikansk gassetterspørsel og transportkapasitet gir markedsretning, men koblingen til norsk sokkel er indirekte.";
  } else if (includesAny(text, ["record energy production", "major energy exporter and importer", "alaska proved reserves"])) {
    topic = "oil";
    relevanceScore = 48;
    investorValueScore = 36;
    issueTags = ["macro_energy", "competitive_supply_context"];
    rationale =
      "Amerikansk produksjon og reserver påvirker konkurrerende tilbud, men er normalt ikke en umiddelbar selskapsdriver.";
  } else if (includesAny(text, ["regional differences in gasoline prices", "renewable diesel", "saf production"])) {
    topic = "oil";
    relevanceScore = 22;
    investorValueScore = 12;
    issueTags = ["downstream_us_context", "weak_upstream_transmission"];
    rationale =
      "Regionalt amerikansk sluttmarked eller biodrivstoff har svak og diffus betydning for norsk oppstrømsinntjening.";
  } else if (includesAny(text, ["data center", "solar could exceed coal", "coal remains", "coal distributions", "small modular reactors"])) {
    topic = "broad";
    relevanceScore = 6;
    investorValueScore = 3;
    issueTags = ["unrelated_power_market", "us_domestic_context"];
    rationale =
      "Saken gjelder amerikansk kraftteknologi eller sluttbruk og mangler en dokumentert økonomisk kobling til selskapet.";
  }

  const adjustment = companyAdjustment(pair.companyName, topic);
  relevanceScore = clamp(relevanceScore + adjustment);
  investorValueScore = clamp(investorValueScore + adjustment);
  return { relevanceScore, investorValueScore, issueTags, rationale };
}

function labelFor(score: number) {
  if (score >= 70) return "RELEVANT" as const;
  if (score >= 30) return "WEAK_RELEVANT" as const;
  return "NOT_RELEVANT" as const;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sample = JSON.parse(await readFile(SAMPLE_PATH, "utf8")) as Sample;
  if (
    sample.selectedPairs !== 100 ||
    sample.selectedCompanies !== 7 ||
    sample.selectedArticles !== 20
  ) {
    throw new Error(
      `Expected 100 pairs, 7 companies and 20 articles, got ${sample.selectedPairs}/${sample.selectedCompanies}/${sample.selectedArticles}.`,
    );
  }
  const reviewed = sample.pairs.map((pair) => ({ ...pair, ...judge(pair) }));
  const summary = {
    pairs: reviewed.length,
    companies: new Set(reviewed.map((item) => item.companyId)).size,
    articles: new Set(reviewed.map((item) => item.articleId)).size,
    relevant: reviewed.filter((item) => item.relevanceScore >= 70).length,
    weakRelevant: reviewed.filter((item) => item.relevanceScore >= 30 && item.relevanceScore < 70).length,
    notRelevant: reviewed.filter((item) => item.relevanceScore < 30).length,
  };
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", summary, reviewed }, null, 2));
    return;
  }

  const [{ prisma }, { recordNewsFeedback }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/server/services/news-relevance-service"),
  ]);
  const reviewer = await prisma.user.findUnique({
    where: { email: REVIEWER_EMAIL },
    select: { id: true, appRole: true },
  });
  if (!reviewer || reviewer.appRole !== "ADMIN") {
    throw new Error("QA admin reviewer was not found with ADMIN access.");
  }

  let created = 0;
  let skipped = 0;
  for (const item of reviewed) {
    const existing = await prisma.newsRelevanceFeedback.findFirst({
      where: {
        newsArticleId: item.articleId,
        companyId: item.companyId,
        reviewedById: reviewer.id,
      },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await recordNewsFeedback({
      articleId: item.articleId,
      companyId: item.companyId,
      label: labelFor(item.relevanceScore),
      relevanceScore: item.relevanceScore,
      investorValueScore: item.investorValueScore,
      issueTags: item.issueTags,
      reviewedById: reviewer.id,
      notes: `${BATCH_MARKER}. ${item.rationale}`,
    });
    created += 1;
  }
  console.log(JSON.stringify({ mode: "apply", summary, created, skipped }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
