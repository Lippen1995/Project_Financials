import { readFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SAMPLE_PATH = ".codex-manual-evaluation-candidates-3.json";
const REVIEWER_EMAIL = "qa-shareholder-admin@example.test";
const BATCH_MARKER = "Manual QA batch 2 2026-06-08";

type Sample = {
  selectedCompanies: number;
  selectedEvents: number;
  events: Array<{
    id: string;
    companyName: string;
    eventType: string;
    title: string;
    investorValueScore: number;
  }>;
};

const manualInvestorValues = [
  90, 50, 12, 88, 60, 12, 75, 58, 75, 90, 38, 58, 90, 55, 12, 85, 55, 75,
  90, 50, 45, 90, 58, 12, 90, 58, 12, 75, 58, 12, 88, 30, 12, 85, 55, 80,
  88, 58, 12, 88, 58, 12, 82, 58, 12, 86, 58, 12, 90, 58, 12, 88, 58, 12,
  90, 30, 78, 85, 58, 12, 80, 72, 88, 88, 50, 12, 70, 50, 88, 82, 15, 12,
  90, 50, 78, 90, 58, 12, 80, 30, 12, 88, 58, 12, 88, 58, 12, 82, 50, 12,
  90, 45, 25, 90, 58, 12, 88, 58, 35, 70, 50, 12, 88, 58, 12, 78, 30, 12,
  88, 12, 78, 82, 55, 90, 88, 68, 12, 90, 40, 45, 78, 58, 12, 88, 58, 12,
  88, 30, 92, 60, 58, 88, 85, 58, 12, 85, 30, 12, 85, 30, 12, 88, 58, 12,
  82, 58, 12, 12, 58, 90,
];

const manualRelevanceOverrides = new Map<number, number>([
  [34, 88],
  [36, 88],
  [61, 90],
  [62, 90],
  [71, 100],
  [79, 88],
]);

const corrections = new Map<
  number,
  { expectedEventType?: string; issueTags: string[] }
>([
  [21, { issueTags: ["same_reporting_period", "possible_duplicate"] }],
  [32, { expectedEventType: "insider_transaction", issueTags: ["wrong_event_type", "routine_settlement"] }],
  [36, { issueTags: ["subsidiary_event", "group_value_discount"] }],
  [61, { issueTags: ["subsidiary_event", "group_read_across"] }],
  [62, { issueTags: ["subsidiary_event", "group_read_across"] }],
  [71, { expectedEventType: "product_launch", issueTags: ["possible_duplicate", "same_underlying_update"] }],
  [75, { expectedEventType: "earnings", issueTags: ["mixed_results_and_invitation"] }],
  [79, { issueTags: ["subsidiary_event", "group_value_discount"] }],
  [93, { issueTags: ["employee_share_plan", "routine_disclosure"] }],
  [99, { issueTags: ["same_reporting_period", "possible_duplicate"] }],
  [110, { expectedEventType: "governance", issueTags: ["wrong_event_type", "agm_flagging_false_positive"] }],
  [113, { expectedEventType: "ownership_change", issueTags: ["mixed_insider_and_ownership"] }],
  [116, { issueTags: ["annual_report_with_material_refinancing_update"] }],
  [130, { issueTags: ["capital_raise_cancellation", "lower_incremental_value"] }],
  [136, { expectedEventType: "earnings", issueTags: ["ambiguous_presentation_title"] }],
  [137, { issueTags: ["routine_prospectus_approval"] }],
  [140, { issueTags: ["transaction_linked_insider_trade", "routine_disclosure"] }],
  [148, { expectedEventType: "reporting_calendar", issueTags: ["wrong_event_type", "invitation_not_results"] }],
]);

function reasonFor(eventType: string, value: number) {
  if (value <= 15) return "Kalender-, governance- eller duplikathendelse uten ny materiell informasjon.";
  if (value <= 35) return "Direkte, men hovedsakelig rutinemessig administrativ eller transaksjonsteknisk informasjon.";
  if (value <= 60) return "Relevant selskapsinformasjon med moderat inkrementell investorverdi.";
  if (eventType === "earnings" || eventType === "financial_statement") {
    return "Resultat- eller driftsoppdatering med høy betydning for estimater, utsikter og verdsettelse.";
  }
  return "Materiell selskapsutvikling med tydelig betydning for strategi, finansiering, drift eller kapitalallokering.";
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sample = JSON.parse(
    (await readFile(SAMPLE_PATH, "utf8")).replace(/^\uFEFF/, ""),
  ) as Sample;
  if (sample.selectedCompanies !== 50 || sample.selectedEvents !== 150) {
    throw new Error(`Expected 50 companies and 150 events, got ${sample.selectedCompanies}/${sample.selectedEvents}.`);
  }
  if (manualInvestorValues.length !== sample.events.length) {
    throw new Error(`Expected ${sample.events.length} values, got ${manualInvestorValues.length}.`);
  }

  const reviewed = sample.events.map((event, offset) => {
    const index = offset + 1;
    const investorValueScore = manualInvestorValues[offset];
    const correction = corrections.get(index);
    return {
      ...event,
      modelInvestorValueScore: event.investorValueScore,
      relevanceScore: manualRelevanceOverrides.get(index) ?? 100,
      investorValueScore,
      expectedEventType: correction?.expectedEventType ?? event.eventType,
      issueTags: correction?.issueTags ?? [],
      note: `${BATCH_MARKER}. ${reasonFor(event.eventType, investorValueScore)} Vurdert individuelt fra tittel, hendelsestype, offisiell kilde og lagret evidens.`,
    };
  });

  const summary = {
    companies: new Set(reviewed.map((item) => item.companyName)).size,
    events: reviewed.length,
    meanModelValue: Number(
      (reviewed.reduce((sum, item) => sum + item.modelInvestorValueScore, 0) / reviewed.length).toFixed(2),
    ),
    meanManualValue: Number(
      (reviewed.reduce((sum, item) => sum + item.investorValueScore, 0) / reviewed.length).toFixed(2),
    ),
    overvaluedBy20OrMore: reviewed.filter(
      (item) => item.investorValueScore - item.modelInvestorValueScore <= -20,
    ).length,
    classificationIssues: reviewed.filter((item) => item.issueTags.includes("wrong_event_type")).length,
    possibleDuplicates: reviewed.filter((item) => item.issueTags.includes("possible_duplicate")).length,
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
    const existing = await prisma.companyEventFeedback.findFirst({
      where: {
        eventId: item.id,
        userId: reviewer.id,
        action: "rated",
        notes: { startsWith: BATCH_MARKER },
      },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await recordCompanyEventFeedback({
      eventId: item.id,
      userId: reviewer.id,
      action: "rated",
      previousValue: {
        relevanceScore: 100,
        investorValueScore: item.modelInvestorValueScore,
        eventType: item.eventType,
      },
      correctedValue: {
        relevanceScore: item.relevanceScore,
        investorValueScore: item.investorValueScore,
        expectedEventType: item.expectedEventType,
        issueTags: item.issueTags,
        reviewerMethod: "manual-editorial-title-and-evidence-v2",
      },
      notes: item.note,
      actorRole: "ADMIN",
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
