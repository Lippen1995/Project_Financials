/**
 * Track B pilot: populate CompanyWebProfile from the scraped corpus + reasoned summaries.
 * Raw text (scrapedText) comes from the scraper; businessSummary is the reasoned prose
 * (produced by the agent reading that text — no OpenAI). Insert via raw SQL because the
 * Prisma client is not regenerated while the dev server holds the query-engine DLL.
 */
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

const CORPUS_PATH =
  process.argv[2] ?? process.env.CORPUS_PATH ?? "output/ai-search/corpus.json";

// name in corpus → { orgNumber (confident operating entity), reasoned summary }
const ANCHORS: Record<string, { org: string; company: string; summary: string }> = {
  "Kongsberg Maritime": {
    org: "936346340",
    company: "KONGSBERG MARITIME ASA",
    summary:
      "Full-line maritime technology integrator and OEM. Products span propulsors & propulsion (thrusters, waterjets), deck machinery & cranes, automation, bridge/control systems, electrical & hybrid power, positioning/stabilisation/manoeuvring, and ship design. Serves cargo, fisheries/aquaculture, naval & coast guard, offshore oil & gas, offshore wind, passenger, research and workboat segments; also retrofits, conversions and strategic advisory. Value chain: top-tier systems integrator that both manufactures propulsors and integrates complete propulsion + automation packages for shipyards and owners — simultaneously a competitor to and an acquirer of focused propulsion specialists (thrusters/CPP).",
  },
  Brunvoll: {
    org: "917225702",
    company: "BRUNVOLL (VOLDA) AS",
    summary:
      "Dedicated propulsion & manoeuvring OEM: tunnel and azimuth thrusters, main propulsion, control systems, and (via Brunvoll Mar-El) hybrid/electric solutions; retrofit & upgrade plus a global sales & service network. Value chain: focused component/system supplier of manoeuvring & propulsion to shipyards and vessel owners — a direct competitor to Kongsberg's Propulsors line and a classic complementary bolt-on for a full-line integrator wanting thruster/manoeuvring capability.",
  },
  Servogear: {
    org: "980414159",
    company: "SERVOGEAR AS",
    summary:
      "Manufacturer of Controllable Pitch Propeller (CPP) systems — the 'Ecoflow Propulsor': CPP, propeller blades, tunnel-effect, rudders, shaft brackets, gearboxes and emission-reduction, focused on high-speed workboats, fast ferries, offshore vessels and yachts. Value chain: focused propulsion-system OEM for the fast/planing-vessel niche. Complements thruster makers (CPP for high-speed thrust vs thrusters for low-speed manoeuvring) and competes at the propulsion-package level — the archetypal niche bolt-on target for a full-line integrator (mirrors the Kongsberg/Berg Propulsion logic).",
  },
  "Scana Propulsion": {
    org: "",
    company: "SCANA ASA",
    summary:
      "NOTE: repositioned. Scana ASA today presents as an active industrial OWNER (holding company) of technology and services for the offshore and energy industries — building businesses organically and via M&A, adjusting the portfolio over time. Its historical Scana Propulsion marine-gear/propulsion identity is no longer the group's stated focus. Value chain: industrial investor/parent over offshore-energy portfolio companies, not a standalone propulsion OEM — a good example of website text revealing a strategic pivot that NACE and the company name would miss.",
  },
  "Ulstein Group": {
    org: "",
    company: "ULSTEIN GROUP ASA",
    summary:
      "Ship designer, shipbuilder (Ulstein Verft) and system integrator (power & control). Vessels: offshore (AHTS, tugs, cable-lay, CSOV/walk-to-work, ERRV, heavy construction/transport, PSV, seismic, subsea support), cruise/yacht and seafood/fishery. Services: ship design, design conversions, CFD, feasibility, shipbuilding, aftermarket, pipe fabrication, crane lift, system integration & support. Value chain: DOWNSTREAM of the propulsion OEMs — a yard/integrator that BUYS thrusters and propulsion systems (a customer of Brunvoll/Servogear/Kongsberg), not a propulsion competitor. Strategic-fit relationship to propulsion makers is supplier→integrator, not head-to-head.",
  },
  "Nogva Motorfabrikk": {
    org: "",
    company: "NOGVA MOTORFABRIKK AS",
    summary:
      "Marine propulsion-system packager for smaller vessels: bespoke propulsion plants (incl. electric/hybrid), marine & industrial gensets built on Cummins, Scania, John Deere and Nanni engines, hydraulics, service and spare parts. Value chain: integrator/packager that BUYS engines from major diesel OEMs and sells complete propulsion + auxiliary systems — upstream engine buyer, downstream systems seller. Complementary to thruster/CPP specialists (different vessel size class) and a direct competitor to Frydenbø's Maritim Industri.",
  },
  Frydenbo: {
    org: "",
    company: "FRYDENBØ",
    summary:
      "Family-owned conglomerate, five divisions: Bil (car dealer — Volvo/Polestar/Audi/VW/Škoda/Zeekr), Eiendom (property), Maritim Industri (propulsion systems from FPT, ABC and Deutz plus an own hybrid solution for smaller vessels; mechanical/electrical service), Marine (own boat brands Nordkapp and Sting) and Global (international investment). Value chain: only the Maritim Industri and Marine divisions are propulsion-relevant — a propulsion packager/reseller (buys engines FPT/ABC/Deutz) competing with Nogva. Note: Frydenbø Group's defence unit Frydenbø Milpro is the reported target of Fjord Defence — i.e. this diversified holding is a live source of carve-out acquisition targets.",
  },
};

async function main() {
  const corpus: Array<{ name: string; url: string; text: string; pages: number; ok: boolean }> =
    JSON.parse(readFileSync(CORPUS_PATH, "utf8"));

  let inserted = 0;
  for (const entry of corpus) {
    const anchor = ANCHORS[entry.name];
    if (!anchor) {
      console.log(`  skip (no anchor mapping): ${entry.name}`);
      continue;
    }
    let org = anchor.org;
    if (!org) {
      // Resolve the operating entity by exact-ish name, preferring a maritime/industrial NACE.
      const cands = await prisma.registryEntity.findMany({
        where: { name: { contains: anchor.company.split(" ")[0], mode: "insensitive" } },
        select: { orgNumber: true, name: true, naceCode: true },
        take: 25,
      });
      const pick =
        cands.find((c) => c.name.toUpperCase() === anchor.company.toUpperCase()) ??
        cands.find((c) => /^(28|29|30|33)\./.test(c.naceCode ?? "")) ??
        cands[0];
      if (!pick) {
        console.log(`  UNRESOLVED orgNumber for ${anchor.company} — skipping`);
        continue;
      }
      org = pick.orgNumber;
      console.log(`  resolved ${anchor.company} → ${org} (${pick.name} [${pick.naceCode ?? "----"}])`);
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "CompanyWebProfile"
         ("orgNumber","companyName","sourceUrl","scrapedText","businessSummary","pagesScraped","scrapedAt","reasonedAt","provenance")
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW(),'website-scrape')
       ON CONFLICT ("orgNumber") DO UPDATE SET
         "companyName"=EXCLUDED."companyName","sourceUrl"=EXCLUDED."sourceUrl",
         "scrapedText"=EXCLUDED."scrapedText","businessSummary"=EXCLUDED."businessSummary",
         "pagesScraped"=EXCLUDED."pagesScraped","scrapedAt"=NOW(),"reasonedAt"=NOW()`,
      org,
      anchor.company,
      entry.url,
      entry.text ?? "",
      anchor.summary,
      entry.pages ?? 0,
    );
    inserted++;
    console.log(`  ✓ ${anchor.company} (${org}) — ${entry.text?.length ?? 0} chars raw, summary ${anchor.summary.length} chars`);
  }

  const total = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "CompanyWebProfile"`,
  );
  console.log(`\nInserted/updated ${inserted}. CompanyWebProfile now holds ${total[0].count} rows.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
