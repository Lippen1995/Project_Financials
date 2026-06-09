import { readFile } from "node:fs/promises";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SAMPLE_PATH = ".codex-manual-evaluation-sample.json";
const REVIEWER_EMAIL = "qa-shareholder-admin@example.test";
const BATCH_MARKER = "Manual QA batch 2026-06-08";

type SampleEvent = {
  id: string;
  companyName: string;
  eventType: string;
  title: string;
  investorValueScore: number;
};

type Sample = {
  selectedCompanies: number;
  selectedEvents: number;
  events: SampleEvent[];
};

type ReasonCode =
  | "material_transaction"
  | "routine_insider"
  | "annual_report"
  | "financial_results"
  | "ownership_disclosure"
  | "routine_buyback"
  | "dividend_ex_date"
  | "dividend_decision"
  | "reporting_invitation"
  | "management_change"
  | "subsidiary_management_change"
  | "capital_action"
  | "operating_update"
  | "strategic_change"
  | "contract_award"
  | "legal_resolution"
  | "governance_proxy"
  | "employee_share_plan"
  | "duplicate_results";

type Judgment = {
  relevanceScore: number;
  investorValueScore: number;
  reasonCode: ReasonCode;
  expectedEventType?: string;
  issueTags?: string[];
};

const judgments: Judgment[] = [
  { relevanceScore: 100, investorValueScore: 85, reasonCode: "material_transaction" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 84, reasonCode: "material_transaction" },
  { relevanceScore: 100, investorValueScore: 42, reasonCode: "routine_buyback" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 38, reasonCode: "dividend_ex_date" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 45, reasonCode: "routine_buyback" },
  { relevanceScore: 100, investorValueScore: 92, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 82, reasonCode: "management_change" },
  { relevanceScore: 100, investorValueScore: 38, reasonCode: "dividend_ex_date" },
  {
    relevanceScore: 100,
    investorValueScore: 35,
    reasonCode: "duplicate_results",
    issueTags: ["possible_duplicate", "same_reporting_period"],
  },
  {
    relevanceScore: 100,
    investorValueScore: 12,
    reasonCode: "reporting_invitation",
    expectedEventType: "reporting_calendar",
    issueTags: ["routine_calendar_item"],
  },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 38, reasonCode: "dividend_ex_date" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 75, reasonCode: "routine_buyback" },
  { relevanceScore: 100, investorValueScore: 65, reasonCode: "dividend_decision" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "legal_resolution" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 92, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 78, reasonCode: "contract_award" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 84, reasonCode: "material_transaction" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 88, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  {
    relevanceScore: 100,
    investorValueScore: 12,
    reasonCode: "reporting_invitation",
    expectedEventType: "reporting_calendar",
    issueTags: ["routine_calendar_item"],
  },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 38, reasonCode: "dividend_ex_date" },
  {
    relevanceScore: 88,
    investorValueScore: 55,
    reasonCode: "subsidiary_management_change",
    issueTags: ["subsidiary_event", "parent_value_discount"],
  },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 65, reasonCode: "dividend_decision" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 45, reasonCode: "capital_action" },
  { relevanceScore: 100, investorValueScore: 70, reasonCode: "management_change" },
  { relevanceScore: 100, investorValueScore: 92, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 40, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 30, reasonCode: "employee_share_plan" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 85, reasonCode: "dividend_decision" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "legal_resolution" },
  {
    relevanceScore: 100,
    investorValueScore: 12,
    reasonCode: "reporting_invitation",
    expectedEventType: "reporting_calendar",
    issueTags: ["routine_calendar_item"],
  },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 80, reasonCode: "contract_award" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 25, reasonCode: "employee_share_plan" },
  { relevanceScore: 100, investorValueScore: 85, reasonCode: "operating_update" },
  { relevanceScore: 100, investorValueScore: 38, reasonCode: "dividend_ex_date" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  {
    relevanceScore: 100,
    investorValueScore: 55,
    reasonCode: "capital_action",
    expectedEventType: "share_issue",
    issueTags: ["wrong_event_type", "chairperson_share_issue"],
  },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  {
    relevanceScore: 100,
    investorValueScore: 12,
    reasonCode: "governance_proxy",
    expectedEventType: "governance",
    issueTags: ["wrong_event_type", "not_ownership_change"],
  },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 85, reasonCode: "management_change" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "strategic_change" },
  { relevanceScore: 100, investorValueScore: 65, reasonCode: "dividend_decision" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 75, reasonCode: "management_change" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 65, reasonCode: "dividend_decision" },
  { relevanceScore: 100, investorValueScore: 75, reasonCode: "routine_buyback" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 75, reasonCode: "management_change" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  { relevanceScore: 100, investorValueScore: 38, reasonCode: "dividend_ex_date" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "capital_action" },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 60, reasonCode: "annual_report" },
  { relevanceScore: 100, investorValueScore: 90, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 50, reasonCode: "ownership_disclosure" },
  {
    relevanceScore: 100,
    investorValueScore: 12,
    reasonCode: "reporting_invitation",
    expectedEventType: "reporting_calendar",
    issueTags: ["wrong_event_type", "invitation_not_results"],
  },
  { relevanceScore: 100, investorValueScore: 35, reasonCode: "routine_insider" },
  { relevanceScore: 100, investorValueScore: 95, reasonCode: "financial_results" },
  { relevanceScore: 100, investorValueScore: 38, reasonCode: "dividend_ex_date" },
  {
    relevanceScore: 100,
    investorValueScore: 12,
    reasonCode: "governance_proxy",
    expectedEventType: "governance",
    issueTags: ["wrong_event_type", "not_ownership_change"],
  },
];

const reasonNotes: Record<ReasonCode, string> = {
  material_transaction:
    "Direkte og strategisk vesentlig transaksjon. M&A eller eksklusive forhandlinger kan endre vekst, kapitalbehov, risiko og inntjeningsprofil, og bør rangeres klart over rutinemeldinger.",
  routine_insider:
    "Selskapstreffet er sikkert, men en standard primærinnsider- eller rettighetstransaksjon har begrenset investorverdi uten uvanlig størrelse, retning eller kontekst.",
  annual_report:
    "Årsrapporten er klart relevant og informasjonsrik, men publiseringen gjentar ofte tall som allerede er kjent fra resultatmeldingen. Verdien bør være middels til høy, ikke automatisk toppscore.",
  financial_results:
    "Faktiske kvartals- eller perioderesultater er både direkte relevante og normalt blant de mest beslutningsrelevante hendelsene fordi de oppdaterer inntjening, balanse, utsikter og estimater.",
  ownership_disclosure:
    "Flagging eller vesentlig aksjonærendring er korrekt koblet. Investorverdien er moderat og avhenger av hvem som handler, terskelpassering og om endringen signaliserer kontroll eller strategisk interesse.",
  routine_buyback:
    "Tilbakekjøpet er direkte relevant. En ordinær programoppdatering har moderat verdi, mens endring i størrelse, periode eller kapitalallokering løfter verdien.",
  dividend_ex_date:
    "Ex-datoen er korrekt selskapsinformasjon, men beslutningen og beløpet er normalt kjent tidligere. Dette er nyttig kalenderinformasjon med lavere nyhetsverdi enn selve utbyttebeslutningen.",
  dividend_decision:
    "Utbyttebeslutning eller forslag er direkte relevant for avkastning og kapitalallokering. Verdien er klart høyere enn en ren ex-dato, særlig ved ekstraordinært utbytte.",
  reporting_invitation:
    "Dette er en invitasjon eller kalenderpåminnelse, ikke nye finansielle resultater. Selskapstreffet er korrekt, men investorverdien er svært lav og hendelsen bør klassifiseres som rapporteringskalender.",
  management_change:
    "Endring i styre eller konsernledelse er direkte relevant og kan påvirke strategi, gjennomføring og styring. Verdien avhenger av senioritet og om fratredelsen er planlagt eller uventet.",
  subsidiary_management_change:
    "Hendelsen gjelder ledelsen i et datterselskap, ikke konsernsjefen i det børsnoterte morselskapet. Den er relevant via konsernforholdet, men må diskonteres og merkes som datterselskapshendelse.",
  capital_action:
    "Kapitalhandlingen er direkte relevant fordi den påvirker aksjeantall, finansiering, utvanning eller transaksjonsoppgjør. Verdien avhenger av størrelse og om vilkårene allerede er kjent.",
  operating_update:
    "Operasjonelle volum- eller trafikktall er direkte ledende indikatorer for inntekter og kapasitetsutnyttelse. Dette er høyverdi selv om hendelsestypen må være sektortilpasset.",
  strategic_change:
    "En strategisk gjennomgang kan føre til salg, restrukturering eller endret kapitalallokering. Utfallet er usikkert, men signalet er klart relevant og normalt høyverdi.",
  contract_award:
    "Kontrakten eller ordren er direkte relevant for ordreinngang og framtidig omsetning. Verdien avhenger av beløp relativt til selskapets størrelse, margin og leveringsrisiko.",
  legal_resolution:
    "Forliket er direkte og potensielt vesentlig fordi det reduserer juridisk usikkerhet og kan ha kontantstrøm- og omdømmeeffekt. Bør rangeres høyt når saken er materiell.",
  governance_proxy:
    "Fullmakter til generalforsamling er governance-administrasjon, ikke en reell endring i eierskap. Selskapstreffet er korrekt, men klassifisering og verdi er klart overvurdert.",
  employee_share_plan:
    "Ansattaksjeprogrammet er korrekt knyttet til selskapet, men er vanligvis rutinemessig og lite kursdrivende med mindre volumet eller utvanningen er vesentlig.",
  duplicate_results:
    "Tittelen ser ut til å dekke samme rapporteringsperiode som en annen resultathendelse for selskapet. Saken er relevant, men den marginale feedverdien er lav dersom den ikke grupperes som samme investorhistorie.",
};

async function main() {
  const apply = process.argv.includes("--apply");
  const sample = JSON.parse(
    (await readFile(SAMPLE_PATH, "utf8")).replace(/^\uFEFF/, ""),
  ) as Sample;

  if (sample.selectedCompanies !== 20 || sample.selectedEvents !== 100) {
    throw new Error(
      `Expected a 20-company/100-event sample, got ${sample.selectedCompanies}/${sample.selectedEvents}.`,
    );
  }
  if (judgments.length !== sample.events.length) {
    throw new Error(
      `Expected ${sample.events.length} judgments, got ${judgments.length}.`,
    );
  }

  const reviewed = sample.events.map((event, index) => {
    const judgment = judgments[index];
    const delta = judgment.investorValueScore - event.investorValueScore;
    return {
      ...event,
      ...judgment,
      modelInvestorValueScore: event.investorValueScore,
      valueDelta: Number(delta.toFixed(2)),
      note: `${BATCH_MARKER}. ${reasonNotes[judgment.reasonCode]} Vurdert fra tittel, hendelsestype, offisiell kilde og lagret selskapsevidens; full dokumenttekst var ikke tilgjengelig i eventobjektet.`,
    };
  });

  const summary = {
    companies: new Set(reviewed.map((item) => item.companyName)).size,
    events: reviewed.length,
    meanModelValue: Number(
      (
        reviewed.reduce((sum, item) => sum + item.modelInvestorValueScore, 0) /
        reviewed.length
      ).toFixed(2),
    ),
    meanManualValue: Number(
      (
        reviewed.reduce((sum, item) => sum + item.investorValueScore, 0) /
        reviewed.length
      ).toFixed(2),
    ),
    meanRelevance: Number(
      (
        reviewed.reduce((sum, item) => sum + item.relevanceScore, 0) /
        reviewed.length
      ).toFixed(2),
    ),
    overvaluedBy20OrMore: reviewed.filter((item) => item.valueDelta <= -20).length,
    undervaluedBy20OrMore: reviewed.filter((item) => item.valueDelta >= 20).length,
    classificationIssues: reviewed.filter(
      (item) => item.expectedEventType || item.issueTags?.includes("wrong_event_type"),
    ).length,
    possibleDuplicates: reviewed.filter((item) =>
      item.issueTags?.includes("possible_duplicate"),
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
        expectedEventType: item.expectedEventType ?? item.eventType,
        issueTags: item.issueTags ?? [],
        reasonCode: item.reasonCode,
        reviewerMethod: "manual-editorial-title-and-evidence-v1",
      },
      notes: item.note,
      actorRole: "ADMIN",
    });
    created += 1;
  }

  const verification = await prisma.companyEventFeedback.count({
    where: {
      userId: reviewer.id,
      action: "rated",
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
