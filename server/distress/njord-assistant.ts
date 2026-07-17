import {
  formatCompactAmount,
  formatPercentValue,
  formatRatio,
  formatScore,
} from "@/lib/distress-presentation";
import { DistressCompanyRow, DistressModuleSectorRow } from "@/lib/types";

/**
 * Njord's answer engine. Deterministic and rule-based — it calls NO model and costs NO tokens,
 * mirroring the stance of server/ai-search/llm/heuristic-client.ts. It classifies the question into
 * one of a few analytical intents and templates a grounded answer straight from the distress rows,
 * so every number it prints is one the table can be checked against. It does not reason; when it
 * cannot recognise an intent it says so rather than improvising.
 */

export type NjordIntent =
  | "REALIZABLE_ASSETS"
  | "BANKRUPTCY_PRESSURE"
  | "COUNTERPARTY_RISK"
  | "COMPANY_LOOKUP"
  | "UNKNOWN";

export type NjordAnswer = {
  intent: NjordIntent;
  answer: string;
};

const TOP_N = 5;

function normalize(text: string) {
  return text
    .toLowerCase()
    .replaceAll("æ", "ae")
    .replaceAll("ø", "o")
    .replaceAll("å", "a");
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function getRealizableAssets(row: DistressCompanyRow) {
  const { fixedAssets, inventory } = row.financials;
  if ((fixedAssets ?? null) === null && (inventory ?? null) === null) {
    return null;
  }

  return (fixedAssets ?? 0) + (inventory ?? 0);
}

function findCompany(rows: DistressCompanyRow[], question: string) {
  const normalizedQuestion = normalize(question);
  const digits = question.replace(/\D/g, "");

  if (digits.length === 9) {
    const byOrgNumber = rows.find((row) => row.company.orgNumber.replace(/\D/g, "") === digits);
    if (byOrgNumber) {
      return byOrgNumber;
    }
  }

  // Longest name first, so "Nordic Marine Services" wins over a company merely called "Nordic".
  return (
    [...rows]
      .sort((left, right) => right.company.name.length - left.company.name.length)
      .find((row) => normalizedQuestion.includes(normalize(row.company.name))) ?? null
  );
}

function classify(question: string): NjordIntent {
  const text = normalize(question);

  if (includesAny(text, ["verdier", "by pa", "bud", "bo", "oppkjop", "kjope", "eiendeler", "aktiva", "realiser"])) {
    return "REALIZABLE_ASSETS";
  }

  if (includesAny(text, ["press", "flest konkurs", "hvor er", "sektor", "bransje", "utsatt"])) {
    return "BANKRUPTCY_PRESSURE";
  }

  if (includesAny(text, ["motpart", "risikabel", "risiko", "handle med", "kredittrisiko", "leverandor", "kunde"])) {
    return "COUNTERPARTY_RISK";
  }

  return "UNKNOWN";
}

function describeCompany(row: DistressCompanyRow) {
  const realizable = getRealizableAssets(row);
  const lines = [
    `${row.company.name} (org.nr ${row.company.orgNumber}) står i ${row.distress.label.toLowerCase()}${
      row.distress.daysInStatus !== null && row.distress.daysInStatus !== undefined
        ? ` og har vært der i ${row.distress.daysInStatus.toLocaleString("nb-NO")} dager`
        : ""
    }.`,
  ];

  if (row.healthScore === null || row.healthScore === undefined) {
    lines.push(
      "Det finnes ingen regnskapstall for selskapet i datasettet, så jeg kan ikke si noe om finansiell helse — bare at statusen er registrert.",
    );
    return lines.join(" ");
  }

  lines.push(
    `Finansiell helse er ${formatScore(row.healthScore)} av 100. Likviditetsgrad ${formatRatio(
      row.financials.liquidityRatio,
    )}, EK-andel ${formatPercentValue(row.financials.equityRatio)}.`,
  );

  if (realizable !== null) {
    lines.push(
      `Anleggsmidler og varelager er bokført til ${formatCompactAmount(
        realizable,
      )}, mot rentebærende gjeld på ${formatCompactAmount(row.financials.interestBearingDebt)}.`,
    );
  }

  return lines.join(" ");
}

function answerRealizableAssets(rows: DistressCompanyRow[]) {
  const ranked = rows
    .map((row) => ({ row, realizable: getRealizableAssets(row) }))
    .filter((entry): entry is { row: DistressCompanyRow; realizable: number } => entry.realizable !== null)
    .sort((left, right) => right.realizable - left.realizable)
    .slice(0, TOP_N);

  if (ranked.length === 0) {
    return "Ingen av selskapene i utvalget har bokførte anleggsmidler eller varelager i datasettet, så jeg har ikke grunnlag for å peke ut verdier.";
  }

  const lines = ranked.map(
    ({ row, realizable }, index) =>
      `${index + 1}. ${row.company.name} — ${formatCompactAmount(realizable)} i anleggsmidler og varelager, ${
        row.distress.label.toLowerCase()
      }, rentebærende gjeld ${formatCompactAmount(row.financials.interestBearingDebt)}.`,
  );

  return [
    `Størst bokførte verdier i utvalget, målt som anleggsmidler pluss varelager:`,
    ...lines,
    "Merk at bokført verdi ikke er realisasjonsverdi, og at panteheftelser ikke er trukket fra. Rekkefølgen sier hvor det er mest å hente, ikke hva som faktisk er fritt for boet.",
  ].join("\n");
}

function answerBankruptcyPressure(sectors: DistressModuleSectorRow[]) {
  const ranked = [...sectors].sort(
    (left, right) => right.bankruptcyCount - left.bankruptcyCount || right.companyCount - left.companyCount,
  );
  const withBankruptcies = ranked.filter((sector) => sector.bankruptcyCount > 0).slice(0, TOP_N);

  if (withBankruptcies.length === 0) {
    return "Ingen sektorer i utvalget har registrerte konkursåpninger akkurat nå.";
  }

  const lines = withBankruptcies.map(
    (sector, index) =>
      `${index + 1}. ${sector.sectorLabel ?? sector.sectorCode} — ${sector.bankruptcyCount} konkursåpninger av ${
        sector.companyCount
      } selskaper, snitt finansiell helse ${formatScore(sector.avgHealthScore)}.`,
  );

  return ["Konkurspresset er størst her:", ...lines].join("\n");
}

function answerCounterpartyRisk(rows: DistressCompanyRow[]) {
  const scored = rows.filter(
    (row): row is DistressCompanyRow & { healthScore: number } =>
      row.healthScore !== null && row.healthScore !== undefined,
  );

  if (scored.length === 0) {
    return "Ingen av selskapene i utvalget har regnskapstall å score på, så jeg kan ikke rangere motpartsrisiko på annet enn formell status.";
  }

  const ranked = [...scored].sort((left, right) => left.healthScore - right.healthScore).slice(0, TOP_N);
  const lines = ranked.map(
    (row, index) =>
      `${index + 1}. ${row.company.name} — helse ${formatScore(row.healthScore)}, likviditetsgrad ${formatRatio(
        row.financials.liquidityRatio,
      )}, EK-andel ${formatPercentValue(row.financials.equityRatio)}, ${row.distress.label.toLowerCase()}.`,
  );

  const unscored = rows.length - scored.length;
  const caveat =
    unscored > 0
      ? `\n${unscored} av ${rows.length} selskaper i utvalget mangler regnskap og er ikke vurdert her. Fravær av score er ikke det samme som lav risiko.`
      : "";

  return [
    "De svakeste motpartene i utvalget, sortert på finansiell helse (lav = svak):",
    ...lines,
    `${caveat}`,
  ]
    .join("\n")
    .trim();
}

export function answerNjordQuestion(input: {
  question: string;
  rows: DistressCompanyRow[];
  sectors: DistressModuleSectorRow[];
}): NjordAnswer {
  const question = input.question.trim();

  if (!question) {
    return { intent: "UNKNOWN", answer: "Still meg gjerne et spørsmål om selskapene i utvalget." };
  }

  const company = findCompany(input.rows, question);
  if (company) {
    return { intent: "COMPANY_LOOKUP", answer: describeCompany(company) };
  }

  const intent = classify(question);

  switch (intent) {
    case "REALIZABLE_ASSETS":
      return { intent, answer: answerRealizableAssets(input.rows) };
    case "BANKRUPTCY_PRESSURE":
      return { intent, answer: answerBankruptcyPressure(input.sectors) };
    case "COUNTERPARTY_RISK":
      return { intent, answer: answerCounterpartyRisk(input.rows) };
    default:
      return {
        intent: "UNKNOWN",
        answer:
          "Jeg svarer foreløpig bare på et fast sett spørsmål om dette utvalget: hvilke selskaper som har verdier å by på, hvor konkurspresset er størst, hvilke motparter som er svakest — eller på et konkret selskap hvis du nevner navnet eller org.nummeret. Jeg gjetter ikke på resten.",
      };
  }
}
