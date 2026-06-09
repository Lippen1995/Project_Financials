import { readFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";

loadEnvConfig(process.cwd());

const INPUT_PATH = ".codex-indirect-exposures.json";
const REVIEWER_EMAIL = "qa-shareholder-admin@example.test";
const BATCH_MARKER = "Manual exposure QA batch 2026-06-08";

type ExposureCandidate = {
  exposureId: string;
  targetCompanyId: string;
  targetCompany: string;
  sourceCompanyId: string;
  sourceCompany: string;
  eventId: string;
  eventType: string;
  title: string;
  eventInvestorValueScore: number;
  exposureType: string;
  exposureScore: number;
  confidenceScore: number;
  rationale: string | null;
};

type Judgment = {
  relevanceScore: number;
  investorValueScore: number;
  issueTags: string[];
  note: string;
};

function labelForScore(score: number) {
  if (score >= 70) return "RELEVANT" as const;
  if (score >= 30) return "WEAK_RELEVANT" as const;
  return "NOT_RELEVANT" as const;
}

function judge(candidate: ExposureCandidate): Judgment {
  if (candidate.sourceCompany === "COMMERCE AS") {
    return {
      relevanceScore: 0,
      investorValueScore: 0,
      issueTags: [
        "wrong_source_company",
        "ambiguous_alias",
        "department_of_commerce",
        "invalid_sector_propagation",
      ],
      note:
        "Fullt feil kobling. «Commerce» i tittelen viser til amerikanske Department of Commerce, ikke det norske foretaket COMMERCE AS. Dermed er både kildehendelsen og all sektorpropagering til målselskapet ugyldig.",
    };
  }

  if (candidate.title.includes("BENIN PROJECT")) {
    const supplierLike = [
      "DOF GROUP ASA",
      "NORAM DRILLING AS",
      "JACKTEL AS",
      "DOLPHIN DRILLING AS",
      "SCANA ASA",
    ].includes(candidate.targetCompany);
    return {
      relevanceScore: supplierLike ? 15 : 8,
      investorValueScore: supplierLike ? 8 : 3,
      issueTags: [
        "broad_petroleum_match",
        "no_documented_commercial_link",
        "peer_or_supplier_speculation",
      ],
      note:
        "Hendelsen gjelder Lime Petroleums Benin-prosjekt. Målselskapet har bare en bred petroleumstilknytning; det finnes ingen dokumentert partner-, kontrakt-, lisens- eller leverandørrelasjon i evidensen. Dette bør normalt ikke inn i selskapsfeeden.",
    };
  }

  if (candidate.title.includes("NORWAY & GERMANY PRODUCTION UPDATE")) {
    const duplicateTarget =
      candidate.targetCompany === "VÅR ENERGI ASA" &&
      candidate.exposureType === "petroleum";
    return {
      relevanceScore: duplicateTarget ? 3 : 18,
      investorValueScore: duplicateTarget ? 0 : 8,
      issueTags: duplicateTarget
        ? ["duplicate_exposure", "broad_petroleum_match", "peer_news"]
        : ["peer_news", "incorrect_value_chain_label", "no_shared_asset_evidence"],
      note: duplicateTarget
        ? "Samme Lime-hendelse er allerede koblet til målselskapet via en annen eksponeringstype. Den ekstra petroleumskoblingen er et duplikat og tilfører ingen feedverdi."
        : "Dette er en produksjonsoppdatering for Lime Petroleum. Andre produsenter kan ha svak peer-kontekst, men det er ikke dokumentert verdikjede, felles lisens eller direkte økonomisk smitte. Eksponeringsscore over 0,9 er klart for høy.",
    };
  }

  if (candidate.title.includes("Bay du Nord")) {
    if (candidate.targetCompany === "EQUINOR ENERGY AS") {
      return {
        relevanceScore: 48,
        investorValueScore: 30,
        issueTags: ["group_read_across", "different_operating_entity", "needs_group_path"],
        note:
          "Saken gjelder Equinor-konsernet og er derfor svakt til moderat relevant for Equinor Energy. Bay du Nord tilhører likevel en annen geografisk operasjon; koblingen må forklares med konsernsti, ikke generell petroleumslikhet.",
      };
    }
    if (candidate.targetCompany === "EQUINOR ENERGY INTERNATIONAL AS") {
      return {
        relevanceScore: 25,
        investorValueScore: 12,
        issueTags: ["group_read_across", "uncertain_operating_entity"],
        note:
          "Det finnes en mulig konsernmessig kobling til internasjonal virksomhet, men evidensen identifiserer ikke dette juridiske selskapet som kontraktspart eller operatør. Relevansen er derfor svak og må ikke behandles som direkte.",
      };
    }
    return {
      relevanceScore: 5,
      investorValueScore: 2,
      issueTags: [
        "unrelated_group_subsidiary",
        "broad_petroleum_match",
        "wrong_geographic_entity",
      ],
      note:
        "Målselskapet er et geografisk Equinor-datterselskap uten dokumentert rolle i Bay du Nord-saken. Felles konsern og petroleum er ikke nok til å propagere en anskaffelsessak til alle juridiske enheter.",
    };
  }

  throw new Error(`No manual judgment rule for exposure ${candidate.exposureId}.`);
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const candidates = JSON.parse(
    (await readFile(INPUT_PATH, "utf8")).replace(/^\uFEFF/, ""),
  ) as ExposureCandidate[];
  const reviewed = candidates.map((candidate) => ({
    ...candidate,
    ...judge(candidate),
  }));

  const summary = {
    exposures: reviewed.length,
    targetCompanies: new Set(reviewed.map((item) => item.targetCompanyId)).size,
    sourceEvents: new Set(reviewed.map((item) => item.eventId)).size,
    meanModelExposureScore: Number(
      (
        (reviewed.reduce((sum, item) => sum + item.exposureScore, 0) /
          reviewed.length) *
        100
      ).toFixed(2),
    ),
    meanManualRelevance: Number(
      (
        reviewed.reduce((sum, item) => sum + item.relevanceScore, 0) /
        reviewed.length
      ).toFixed(2),
    ),
    notRelevant: reviewed.filter((item) => item.relevanceScore < 30).length,
    weakRelevant: reviewed.filter(
      (item) => item.relevanceScore >= 30 && item.relevanceScore < 70,
    ).length,
    relevant: reviewed.filter((item) => item.relevanceScore >= 70).length,
    wrongSourceCompany: reviewed.filter((item) =>
      item.issueTags.includes("wrong_source_company"),
    ).length,
  };

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", summary, reviewed }, null, 2));
    return;
  }

  const [{ prisma }, { recordCompanyEventFeedback }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/server/news/company-event-feedback-service"),
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
    const existing = await prisma.companyEventExposureFeedback.findFirst({
      where: {
        exposureId: item.exposureId,
        userId: reviewer.id,
        notes: { startsWith: BATCH_MARKER },
      },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.companyEventExposureFeedback.create({
      data: {
        exposureId: item.exposureId,
        userId: reviewer.id,
        relevanceScore: item.relevanceScore,
        investorValueScore: item.investorValueScore,
        label: labelForScore(item.relevanceScore),
        previousValue: json({
          exposureScore: item.exposureScore,
          confidenceScore: item.confidenceScore,
          exposureType: item.exposureType,
        }),
        correctedValue: json({
          relevanceScore: item.relevanceScore,
          investorValueScore: item.investorValueScore,
          issueTags: item.issueTags,
          targetCompanyId: item.targetCompanyId,
          sourceCompanyId: item.sourceCompanyId,
          reviewerMethod: "manual-read-across-adjudication-v1",
        }),
        notes: `${BATCH_MARKER}. ${item.note}`,
      },
    });
    created += 1;
  }

  const commerceEvents = await prisma.companyEvent.findMany({
    where: {
      company: { name: "COMMERCE AS" },
      title: { contains: "USA Rare Earth Secures" },
    },
    select: { id: true },
  });
  for (const commerceEvent of commerceEvents) {
    const existingWrongCompany = await prisma.companyEventFeedback.findFirst({
      where: {
        eventId: commerceEvent.id,
        userId: reviewer.id,
        action: "wrong_company",
      },
      select: { id: true },
    });
    if (!existingWrongCompany) {
      await recordCompanyEventFeedback({
        eventId: commerceEvent.id,
        userId: reviewer.id,
        action: "wrong_company",
        correctedValue: {
          issueTags: ["department_of_commerce", "ambiguous_alias"],
          reviewerMethod: "manual-read-across-adjudication-v1",
        },
        notes:
          "«Commerce» viser til US Department of Commerce, ikke COMMERCE AS. Kildehendelsen er feil selskapskoblet og skal ikke propageres.",
        actorRole: "ADMIN",
      });
    }
  }

  const verification = await prisma.companyEventExposureFeedback.count({
    where: {
      userId: reviewer.id,
      notes: { startsWith: BATCH_MARKER },
    },
  });
  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      { mode: "apply", summary, created, skipped, verification },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
