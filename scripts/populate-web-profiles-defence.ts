/**
 * Track B — defence corpus. Populate CompanyWebProfile from the scraped defence set + reasoned
 * summaries. orgNumbers are pre-resolved (baked into the scrape JSON), so no name resolution.
 * Raw-SQL insert because the Prisma client is not regenerated while the dev server holds the DLL.
 */
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const CORPUS_PATH =
  process.argv[2] ?? process.env.CORPUS_PATH ?? "output/ai-search/corpus-defence.json";

const SUMMARIES: Record<string, string> = {
  "917811288":
    "THE ACQUIRER. Fjord Defence makes weapon MOUNTING & STABILISATION systems for light/medium machine guns: ground mounts and tripods, vehicle mounts (skate mounts, swing arms, ring mounts, pintle interfaces), maritime mounts (pedestals, gunwale systems in 316 stainless for RIBs, patrol boats and naval platforms), plus sight mounts, triggers, ballistic shields and accessories. 'Soft mount' technology improves hit probability while reducing recoil. Value chain: the weapon-to-PLATFORM integration layer — sits between the weapon (machine gun) and the platform (ground/vehicle/vessel). Its acquisition of Frydenbø Milpro fits this. Ideal targets are complementary platform-integration hardware: remote/automated weapon stations, naval mounts/pedestals, soldier & vehicle systems.",
  "978614582":
    "Norway's flagship defence prime (part of Kongsberg Gruppen). Products: PROTECTOR Remote Weapon Stations (RWS), NASAMS air-defence, Naval/Joint Strike Missiles, surveillance & C4ISR, uncrewed surface vessels, space/aerospace; defence, security and surveillance markets. Value chain: top-tier systems integrator/OEM. Relative to Fjord Defence: STRATEGICALLY ADJACENT — its PROTECTOR RWS is the remote/automated sibling of Fjord's manual weapon mounts (same weapon-station domain). A potential acquirer of, competitor to, or integration partner/channel for mount specialists — the closest strategic neighbour in this set.",
  "979984731":
    "International aerospace & defence group (HQ Norway, 4,100+ employees, 27 sites, 12 countries). Products: specialty ammunition, rocket motors (incl. space — LEROS engines), shoulder-fired systems, demilitarization, CAD/PAD, composite solutions. Value chain: munitions & energetic-propulsion OEM (consumables + rocket propulsion). Relative to Fjord Defence: same small-arms ecosystem (ammunition for the machine guns Fjord's mounts carry) but a different product class (consumables vs mounting hardware) — a supply-chain neighbour, not a bolt-on target.",
  "991191984":
    "Europe's leading manufacturer of advanced explosives / energetic materials (150+ years; part of Chemring Group). Value chain: UPSTREAM energetic-materials supplier — explosives feed ammunition makers such as Nammo. Relative to Fjord Defence: distant (raw energetic materials, not weapon hardware) — a deep supply-chain node, not a strategic-fit target.",
  "990295697":
    "Defence communications hardware OEM: tactical antennas, telescopic & tactical masts, naval antennas & systems, mission systems, couplers/diplexers, ruggedised power supplies. Field-proven for ground, vehicle and naval platforms. Value chain: C4ISR / communications component OEM. Relative to Fjord Defence: an ADJACENT ruggedised platform-hardware peer (both make platform-mounted, harsh-environment hardware across ground/vehicle/naval) — a plausible complementary bolt-on for a group building a broad platform-systems portfolio.",
  "979340354":
    "Leading Scandinavian Electronics Manufacturing Services (EMS): manufacturing, development, industrialisation, sourcing, logistics and repair; market sectors include Defence/Aerospace, medical, industry, electrification, connectivity. Value chain: UPSTREAM contract manufacturer/supplier to defence OEMs (builds electronics for others) — not an end-product defence company. Relative to Fjord Defence: a potential supplier, not an acquisition target.",
  "918684735":
    "One of Norway's largest Electronics Manufacturing Services (EMS) providers (est. 1973, Jaren/Hadeland): assembles everything from PCBs to complete electronic + mechatronic units, from prototype through industrialisation, incl. sourcing and logistics. Value chain: UPSTREAM contract electronics manufacturer serving defence and industrial OEMs. Relative to Fjord Defence: a potential supplier of electronics/mechatronics, not a strategic-fit target.",
};

async function main() {
  const corpus: Array<{ org: string; company: string; url: string; text: string; pages: number; ok: boolean }> =
    JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

  let n = 0;
  for (const e of corpus) {
    if (!e.ok) { console.log(`  skip (scrape failed): ${e.company}`); continue; }
    const summary = SUMMARIES[e.org];
    if (!summary) { console.log(`  skip (no summary): ${e.company}`); continue; }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompanyWebProfile"
         ("orgNumber","companyName","sourceUrl","scrapedText","businessSummary","pagesScraped","scrapedAt","reasonedAt","provenance")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW(),'website-scrape')
       ON CONFLICT ("orgNumber") DO UPDATE SET
         "companyName"=EXCLUDED."companyName","sourceUrl"=EXCLUDED."sourceUrl",
         "scrapedText"=EXCLUDED."scrapedText","businessSummary"=EXCLUDED."businessSummary",
         "pagesScraped"=EXCLUDED."pagesScraped","scrapedAt"=NOW(),"reasonedAt"=NOW()`,
      e.org, e.company, e.url, e.text ?? "", summary, e.pages ?? 0,
    );
    n++;
    console.log(`  ✓ ${e.company} (${e.org})`);
  }
  const total = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "CompanyWebProfile"`);
  console.log(`\nInserted/updated ${n}. CompanyWebProfile now holds ${total[0].count} rows.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
