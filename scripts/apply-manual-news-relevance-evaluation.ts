import { readFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DEFAULT_SAMPLE_PATH = ".codex-official-relevance-candidates-240.json";
const REVIEWER_EMAIL = "qa-shareholder-admin@example.test";
const BATCH_MARKER = "Manual official-source QA batch 2026-06-08";

type Pair = {
  articleId: string;
  companyId: string;
  companyName: string;
  source: string;
  title: string;
  summary: string | null;
  model: {
    totalScore: number;
    primaryType: string;
  };
};

type Sample = {
  selectedPairs: number;
  selectedCompanies: number;
  pairs: Pair[];
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

type Judgment = {
  relevanceScore: number;
  investorValueScore: number;
  issueTags: string[];
  rationale: string;
};

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function judgeEia(pair: Pair): Judgment {
  const text = `${pair.title} ${pair.summary ?? ""}`.toLowerCase();
  const globalOilShock = includesAny(text, [
    "middle east conflict",
    "hormuz",
    "brent crude",
    "crude oil and petroleum product prices",
    "international lng prices",
  ]);
  const globalGas = includesAny(text, [
    "natural gas price forecast",
    "natural gas exports",
    "lng export terminal",
    "lng facilities",
  ]);
  const oilMarket = includesAny(text, [
    "strategic petroleum reserve",
    "crude oil imports",
  ]);
  const weakUsOnly = includesAny(text, [
    "alaska proved reserves",
    "data centers",
    "electricity sales",
    "coal remains",
    "pipeline capacity",
    "renewable diesel",
  ]);

  if (pair.companyName === "EQUINOR ENERGY LIBYA AS") {
    if (globalOilShock) {
      return {
        relevanceScore: 88,
        investorValueScore: 84,
        issueTags: ["macro_energy", "geopolitical_supply_shock", "libya_exposure"],
        rationale: "Global olje-/LNG-pris og Hormuz-risiko er direkte økonomisk relevant for en oppstrømsenhet i Libya.",
      };
    }
    if (globalGas) {
      return {
        relevanceScore: 52,
        investorValueScore: 42,
        issueTags: ["macro_energy", "indirect_global_gas_market"],
        rationale: "Global LNG- og gassbalanse gir relevant markedskontekst, men koblingen til den libyske juridiske enheten er indirekte.",
      };
    }
    if (oilMarket) {
      return {
        relevanceScore: 58,
        investorValueScore: 48,
        issueTags: ["macro_energy", "oil_market_context"],
        rationale: "Tiltaket påvirker global oljebalanse, men har ingen direkte selskaps- eller Libya-kobling.",
      };
    }
    if (weakUsOnly) {
      return {
        relevanceScore: 8,
        investorValueScore: 4,
        issueTags: ["wrong_geography", "us_domestic_context"],
        rationale: "Saken gjelder et avgrenset amerikansk marked uten tydelig økonomisk transmisjon til Libya-enheten.",
      };
    }
    return {
      relevanceScore: 25,
      investorValueScore: 18,
      issueTags: ["broad_macro_context", "weak_geographic_link"],
      rationale: "Generell amerikansk energimakro har bare svak kontekstverdi for den libyske juridiske enheten.",
    };
  }

  if (globalOilShock) {
    return {
      relevanceScore: 92,
      investorValueScore: 88,
      issueTags: ["macro_energy", "material_price_driver"],
      rationale: "Brent-, LNG- eller Hormuz-sjokk påvirker direkte realiserte priser, marginer og markedssyn for Equinor.",
    };
  }
  if (globalGas) {
    return {
      relevanceScore: 82,
      investorValueScore: 74,
      issueTags: ["macro_energy", "gas_market_driver"],
      rationale: "Gasspris og LNG-kapasitet er sentrale drivere for Equinors gasseksponering.",
    };
  }
  if (oilMarket) {
    return {
      relevanceScore: 78,
      investorValueScore: 68,
      issueTags: ["macro_energy", "oil_balance_driver"],
      rationale: "Oljereserver, import eller lagerfrigivelse påvirker råvarebalanse og prisforventninger.",
    };
  }
  if (weakUsOnly) {
    return {
      relevanceScore: 18,
      investorValueScore: 10,
      issueTags: ["us_domestic_context", "weak_company_transmission"],
      rationale: "Saken er energirelatert, men den økonomiske transmisjonen til Equinor er svak eller spekulativ.",
    };
  }
  return {
    relevanceScore: 48,
    investorValueScore: 38,
    issueTags: ["broad_macro_context"],
    rationale: "Bred energimakro er relevant kontekst, men mangler en tydelig kortsiktig resultatdriver.",
  };
}

function judgeSodir(pair: Pair): Judgment {
  const text = `${pair.title} ${pair.summary ?? ""}`.toLowerCase();
  const isPermit = pair.source === "sodir-drilling-permits";
  const isExploration = pair.source === "sodir-exploration-results";
  const isDry = includesAny(text, ["tørr brønn", "tÃ¸rr brÃ¸nn"]);
  const isDiscovery = includesAny(text, ["funn", "påvist petroleum", "pÃ¥vist petroleum"]);
  const isFieldProject = includesAny(text, [
    "troll",
    "snorre",
    "breidablikk",
    "utgard",
    "trestakk",
    "tordis",
    "vigdis",
    "northern lights",
    "co2-lagring",
    "cook- og johansen",
  ]);
  const isRegulation = includesAny(text, [
    "forskrift",
    "høring",
    "hÃ¸ring",
    "veileder",
    "regelverk",
    "arealavgift",
    "kraft fra land",
  ]);

  if (pair.companyName === "EQUINOR BIL BERGEN") {
    return {
      relevanceScore: 0,
      investorValueScore: 0,
      issueTags: ["wrong_legal_entity", "ambiguous_group_name", "identity_collision"],
      rationale: "Bilvirksomheten er en separat juridisk enhet uten dokumentert økonomisk eksponering mot SODIR-saken.",
    };
  }
  if (pair.companyName === "EQUINOR ENERGY LIBYA AS") {
    return {
      relevanceScore: 0,
      investorValueScore: 0,
      issueTags: ["wrong_legal_entity", "wrong_geography", "invalid_group_propagation"],
      rationale: "Norsk sokkel- og myndighetsinformasjon skal ikke propageres til Equinors Libya-enhet uten dokumentert relasjon.",
    };
  }

  const isOperatingEntity = pair.companyName === "EQUINOR ENERGY AS";
  if (isPermit) {
    return {
      relevanceScore: isOperatingEntity ? 100 : 88,
      investorValueScore: isOperatingEntity ? 52 : 42,
      issueTags: isOperatingEntity ? ["direct_operator"] : ["group_read_across"],
      rationale: isOperatingEntity
        ? "Boretillatelsen navngir den juridiske operatøren direkte, men er normalt en forventet prosjektmilepæl."
        : "Tillatelsen gjelder et konsernselskap og er relevant for morselskapet via dokumentert konsernsti.",
    };
  }
  if (isExploration) {
    const value = isDry ? 58 : isDiscovery ? 82 : 65;
    return {
      relevanceScore: isOperatingEntity ? 100 : 92,
      investorValueScore: isOperatingEntity ? value : value - 8,
      issueTags: isOperatingEntity
        ? ["direct_operator", isDry ? "dry_well" : "exploration_result"]
        : ["group_read_across", isDry ? "dry_well" : "exploration_result"],
      rationale: "Leteresultatet påvirker ressursbase, sannsynlig prosjektverdi og framtidig leteaktivitet.",
    };
  }
  if (isFieldProject) {
    return {
      relevanceScore: isOperatingEntity ? 100 : 94,
      investorValueScore: 72,
      issueTags: isOperatingEntity ? ["direct_project"] : ["group_read_across", "material_project"],
      rationale: "Felt-, levetids- eller CO2-prosjektet er en konkret operasjonell utvikling i Equinor-systemet.",
    };
  }
  if (isRegulation) {
    return {
      relevanceScore: isOperatingEntity ? 68 : 58,
      investorValueScore: isOperatingEntity ? 44 : 34,
      issueTags: ["industry_regulation", "context_only"],
      rationale: "Regelverksendringen er relevant bransjekontekst, men mangler dokumentert selskapsspesifikk effekt.",
    };
  }
  return {
    relevanceScore: 20,
    investorValueScore: 10,
    issueTags: ["general_authority_news", "low_company_specificity"],
    rationale: "Generell SODIR-informasjon uten operatør-, lisens-, felt- eller materiell reguleringskobling.",
  };
}

function labelFor(score: number) {
  if (score >= 70) return "RELEVANT" as const;
  if (score >= 30) return "WEAK_RELEVANT" as const;
  return "NOT_RELEVANT" as const;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const samplePath = argValue("input") ?? DEFAULT_SAMPLE_PATH;
  const sample = JSON.parse(await readFile(samplePath, "utf8")) as Sample;
  if (sample.selectedPairs !== sample.pairs.length || sample.selectedCompanies < 1) {
    throw new Error(
      `Invalid sample metadata: ${sample.selectedPairs}/${sample.pairs.length} pairs across ${sample.selectedCompanies} companies.`,
    );
  }
  const reviewed = sample.pairs.map((pair) => ({
    ...pair,
    ...(pair.source.startsWith("eia-") ? judgeEia(pair) : judgeSodir(pair)),
  }));
  const summary = {
    pairs: reviewed.length,
    companies: new Set(reviewed.map((item) => item.companyId)).size,
    sources: new Set(reviewed.map((item) => item.source)).size,
    relevant: reviewed.filter((item) => item.relevanceScore >= 70).length,
    weakRelevant: reviewed.filter((item) => item.relevanceScore >= 30 && item.relevanceScore < 70).length,
    notRelevant: reviewed.filter((item) => item.relevanceScore < 30).length,
    identityOrGeographyErrors: reviewed.filter((item) =>
      item.issueTags.some((tag) => ["wrong_legal_entity", "wrong_geography", "identity_collision"].includes(tag)),
    ).length,
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
        notes: { startsWith: BATCH_MARKER },
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
      notes: `${BATCH_MARKER}. ${item.rationale} Modellscore ${(item.model.totalScore * 100).toFixed(0)}.`,
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
