import {
  buildAnnouncementEvents,
  buildCompanyNameHistory,
  type AnnouncementCategory,
  type AnnouncementEvent,
  type ClassifiedAnnouncement,
  type NameChange,
  type NameSegment,
} from "@/lib/company-history";
import type { NormalizedAnnouncement, NormalizedPreviousName } from "@/lib/types";

/**
 * The Kunngjøringer tab read as the company's own story rather than as a feed.
 *
 * Three derivations carry the page, and every one of them comes out of what Brønnøysund
 * actually registered:
 *
 *  1. Chapters are the name periods. Announcements are keyed on the organisation number, so
 *     filings made under an earlier name sit in the same feed — splitting the feed on the name
 *     lineage is what makes it readable as one continuous history.
 *  2. A row is a filing day, not a single announcement. Brreg publishes one announcement per
 *     changed fact, so a change of control arrives as five announcements on one date; the day
 *     is the event, the announcements are its parts.
 *  3. Long runs of routine filing days collapse into a period row. The rows that stay standalone
 *     are the ones carrying a name, structure or insolvency announcement.
 *
 * Nothing here reads a motive into the register. Every sentence this module writes is a
 * restatement of dates, counts and announcement titles.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Brreg dates a name period from the registration, while the announcement covering the change
 * can be published a few days either side. Boundaries are widened by the same window
 * `buildCompanyNameHistory` uses to pair a change with its announcement, so the announcement
 * that renamed the company opens the chapter it created instead of closing the previous one.
 */
const ERA_BOUNDARY_SLACK_MS = 4 * DAY_MS;

/** Shortest run of routine filing days worth collapsing into a single period row. */
const ROLLUP_MIN_RUN = 3;

const NUMERALS = ["null", "Ett", "To", "Tre", "Fire", "Fem", "Seks", "Sju", "Åtte", "Ni", "Ti"];

export type StoryBucket = "navn" | "kapital" | "struktur" | "styre" | "konkurs";

/** The five colours the timeline reads in — also the legend and the filter. */
export const STORY_BUCKETS: { id: StoryBucket; label: string; color: string }[] = [
  { id: "navn", label: "Navn og formål", color: "var(--px-accent)" },
  { id: "kapital", label: "Kapital", color: "#c5a059" },
  { id: "struktur", label: "Struktur og eierskap", color: "var(--px-panel)" },
  { id: "styre", label: "Styre og formalia", color: "#8c98a8" },
  { id: "konkurs", label: "Konkurs og avvikling", color: "#9f1239" },
];

const BUCKET_COLOR: Record<StoryBucket, string> = Object.fromEntries(
  STORY_BUCKETS.map((bucket) => [bucket.id, bucket.color]),
) as Record<StoryBucket, string>;

const BUCKET_BY_CATEGORY: Record<AnnouncementCategory, StoryBucket> = {
  navn: "navn",
  formaal: "navn",
  kapital: "kapital",
  fusjon: "struktur",
  fisjon: "struktur",
  eierskap: "struktur",
  konkurs: "konkurs",
  avvikling: "konkurs",
  styre: "styre",
  ledelse: "styre",
  vedtekter: "styre",
  revisor: "styre",
  adresse: "styre",
  regnskap: "styre",
  annet: "styre",
};

/**
 * A filing day earns its own row when it carries one of these. They are the announcements that
 * change what the company *is* — its name, who controls it, whether it still trades.
 */
const STANDALONE_BUCKETS: ReadonlySet<StoryBucket> = new Set<StoryBucket>([
  "navn",
  "struktur",
  "konkurs",
]);

/**
 * Which announcement titles a mixed filing day, from most to least consequential. Ranked on the
 * category rather than the colour bucket, so a day carrying both "Foretaksnavn" and
 * "Vedtektsfestet formål" is titled by the name change.
 */
const PRIMARY_RANK: AnnouncementCategory[] = [
  "konkurs",
  "avvikling",
  "fusjon",
  "fisjon",
  "eierskap",
  "navn",
  "formaal",
  "kapital",
  "vedtekter",
  "ledelse",
  "styre",
  "revisor",
  "adresse",
  "regnskap",
  "annet",
];

export type StoryAnnouncement = {
  id: string;
  title: string;
  publishedAt: Date | null;
  dateLabel: string;
  detailUrl: string;
  /** Carried through so a row can key a DD comment thread without a second lookup. */
  sourceId: string;
  sourceSystem: string;
  category: AnnouncementCategory;
  categoryLabel: string;
  typeLabel: string;
  bucket: StoryBucket;
  color: string;
};

export type StoryEvent = {
  key: string;
  /** `filing` is one date in the register; `period` is a collapsed run of routine dates. */
  kind: "filing" | "period";
  dateLabel: string;
  typeLabel: string;
  bucket: StoryBucket;
  color: string;
  title: string;
  explain: string;
  /** Shown in the detail panel until (or unless) Brreg's own text has been fetched. */
  registerText: string;
  /** The announcement whose register text the detail panel opens. Null for period rows. */
  primary: StoryAnnouncement | null;
  /** Every announcement behind the row — empty when the row is a single announcement. */
  children: StoryAnnouncement[];
  announcementCount: number;
};

export type StoryEra = {
  key: string;
  chapter: string;
  name: string;
  years: string;
  lead: string;
  countLabel: string;
  color: string;
  events: StoryEvent[];
};

export type AnnouncementStory = {
  eras: StoryEra[];
  stats: { label: string; value: string }[];
  headline: string;
  lead: string;
  /** The one-line note under the intro, e.g. "Tre kapitler utledet av navneendringer". */
  chapterLabel: string | null;
  isEmpty: boolean;
  total: number;
  nameCount: number;
  firstYear: number | null;
};

function numeral(count: number) {
  return NUMERALS[count] ?? String(count);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** dd.mm.yyyy — the register's own notation, and what the timeline aligns on. */
function formatRegisterDate(value: Date | null) {
  if (!value) return "Udatert";
  const day = `${value.getDate()}`.padStart(2, "0");
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  return `${day}.${month}.${value.getFullYear()}`;
}

function joinNorwegian(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} og ${values.at(-1)}`;
}

function decorate(announcement: ClassifiedAnnouncement): StoryAnnouncement {
  const bucket = BUCKET_BY_CATEGORY[announcement.category];
  const publishedAt = toDate(announcement.publishedAt);
  return {
    id: announcement.id,
    title: announcement.title,
    publishedAt,
    dateLabel: formatRegisterDate(publishedAt),
    detailUrl: announcement.detailUrl,
    sourceId: announcement.sourceId,
    sourceSystem: announcement.sourceSystem,
    category: announcement.category,
    categoryLabel: announcement.categoryLabel,
    typeLabel: announcement.categoryLabel.toUpperCase(),
    bucket,
    color: BUCKET_COLOR[bucket],
  };
}

function pickPrimary(items: StoryAnnouncement[]): StoryAnnouncement {
  return [...items].sort(
    (left, right) => PRIMARY_RANK.indexOf(left.category) - PRIMARY_RANK.indexOf(right.category),
  )[0];
}

/** Distinct category labels for a set of announcements, most frequent first. */
function dominantLabels(items: StoryAnnouncement[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.categoryLabel, (counts.get(item.categoryLabel) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "nb-NO"))
    .map(([label]) => label);
}

/**
 * Which name period a filing day falls in. Undated announcements land in the first chapter —
 * the register gives nothing better to place them by.
 */
function eraIndexFor(date: Date | null, segments: NameSegment[]) {
  if (!date) return 0;
  let index = 0;
  for (let candidate = 1; candidate < segments.length; candidate += 1) {
    const from = segments[candidate].fromDate;
    if (from && date.getTime() >= from.getTime() - ERA_BOUNDARY_SLACK_MS) {
      index = candidate;
    }
  }
  return index;
}

function countLabel(count: number) {
  return count === 1 ? "1 kunngjøring" : `${count} kunngjøringer`;
}

/**
 * One filing date, stated as what the register holds for that day. Why a chapter began is the
 * chapter lead's job — a row only says what was published, and alongside what.
 */
function buildFilingEvent(event: AnnouncementEvent): StoryEvent {
  const items = event.announcements
    .map(decorate)
    .sort((left, right) => PRIMARY_RANK.indexOf(left.category) - PRIMARY_RANK.indexOf(right.category));
  const primary = pickPrimary(items);
  const others = items.filter((item) => item.id !== primary.id);
  const dateLabel = formatRegisterDate(event.publishedAt);

  const explain =
    others.length === 0
      ? `Eneste kunngjøring registrert ${dateLabel}.`
      : `Kunngjort ${dateLabel} sammen med ${others.length === 1 ? "én annen melding" : `${others.length} andre meldinger`}: ${joinNorwegian(
          others.map((item) => item.title.toLowerCase()),
        )}.`;

  return {
    key: `dag:${event.key}`,
    kind: "filing",
    dateLabel,
    typeLabel: primary.typeLabel,
    bucket: primary.bucket,
    color: primary.color,
    title: primary.title,
    explain,
    registerText: `${countLabel(items.length)} registrert ${dateLabel}.`,
    primary,
    children: items.length > 1 ? items : [],
    announcementCount: items.length,
  };
}

/** A run of routine filing days, collapsed into one row with the individual filings underneath. */
function buildPeriodEvent(events: AnnouncementEvent[], eraKey: string): StoryEvent {
  const items = events
    .flatMap((event) => event.announcements.map(decorate))
    .sort(
      (left, right) =>
        (left.publishedAt?.getTime() ?? 0) - (right.publishedAt?.getTime() ?? 0) ||
        left.title.localeCompare(right.title, "nb-NO"),
    );
  const labels = dominantLabels(items);
  const firstYear = items[0]?.publishedAt?.getFullYear() ?? null;
  const lastYear = items.at(-1)?.publishedAt?.getFullYear() ?? null;
  const dateLabel =
    firstYear && lastYear ? (firstYear === lastYear ? String(firstYear) : `${firstYear}–${lastYear}`) : "Udatert";
  const primary = pickPrimary(items);
  // Naming every category a decade of routine filings touched reads as a list, not a title.
  const named = labels.slice(0, 3).join(", ").toLowerCase();

  return {
    key: `periode:${eraKey}:${events[0]?.key ?? "0"}`,
    kind: "period",
    dateLabel,
    typeLabel: labels.slice(0, 2).join(" OG ").toUpperCase(),
    bucket: primary.bucket,
    color: primary.color,
    title: `Løpende endringer: ${named}${labels.length > 3 ? " m.m." : ""}`,
    explain: `${countLabel(items.length)} fordelt på ${events.length} kunngjøringsdatoer i perioden. Ingen av dem endrer foretaksnavn, eierstruktur eller status — de er samlet her for lesbarhet.`,
    registerText: `Samlevisning av ${items.length} kunngjøringer. Utvid for enkeltkunngjøringene.`,
    primary: null,
    children: items,
    announcementCount: items.length,
  };
}

/**
 * Why a chapter began, as a sentence. `buildCompanyNameHistory` already labels every change
 * from the filings that surround it; only its catch-all case is phrased as a clause that needs
 * a subject before it can open a chapter.
 */
function describeOpening(change: NameChange | undefined): string | null {
  if (!change) return null;
  if (change.contextKind !== "samtidige-endringer") return change.contextLabel;
  return `Navnet ble endret samme dag som ${joinNorwegian(
    change.context.map((item) => item.title.toLowerCase()),
  )} ble kunngjort.`;
}

function formatEraYears(segment: NameSegment, events: StoryEvent[], isCurrent: boolean) {
  const years = events
    .flatMap((event) => (event.children.length > 0 ? event.children : event.primary ? [event.primary] : []))
    .map((item) => item.publishedAt?.getFullYear())
    .filter((year): year is number => typeof year === "number");
  const from = segment.fromDate?.getFullYear() ?? years[0] ?? null;
  const to = isCurrent ? "i dag" : (segment.toDate?.getFullYear() ?? years.at(-1) ?? null);
  if (!from && !to) return "Udatert";
  if (!from) return String(to);
  return to && String(to) !== String(from) ? `${from}–${to}` : String(from);
}

export function buildAnnouncementStory({
  companyName,
  previousNames,
  announcements,
  statusLabel,
}: {
  companyName: string;
  previousNames: readonly NormalizedPreviousName[];
  announcements: readonly NormalizedAnnouncement[];
  statusLabel: string;
}): AnnouncementStory {
  const history = buildCompanyNameHistory({ currentName: companyName, previousNames, announcements });
  const segments = history.segments;

  // `buildAnnouncementEvents` returns newest first; the story is told forwards.
  const filingDays = [...buildAnnouncementEvents(announcements)].reverse();

  // The name change that opened each chapter — its context label is what the chapter lead says
  // about why the period began, read off the other filings from the same day.
  const changeByToName = new Map(history.changes.map((change) => [change.toName, change]));

  const daysByEra = segments.map<AnnouncementEvent[]>(() => []);
  for (const day of filingDays) {
    daysByEra[eraIndexFor(day.publishedAt, segments)].push(day);
  }

  const eras: StoryEra[] = [];
  segments.forEach((segment, index) => {
    const days = daysByEra[index];
    if (days.length === 0) return;

    // Standalone rows keep their date; everything between them collapses once a run is long
    // enough to be worth summarising.
    const events: StoryEvent[] = [];
    let run: AnnouncementEvent[] = [];
    const flush = () => {
      if (run.length === 0) return;
      if (run.length >= ROLLUP_MIN_RUN) {
        events.push(buildPeriodEvent(run, `${index}`));
      } else {
        for (const day of run) {
          events.push(buildFilingEvent(day));
        }
      }
      run = [];
    };

    days.forEach((day, position) => {
      const buckets = day.announcements.map((item) => BUCKET_BY_CATEGORY[item.category]);
      // The chapter's opening filing always stands alone: it is either the registration itself
      // or the change that started the period.
      const standalone = position === 0 || buckets.some((bucket) => STANDALONE_BUCKETS.has(bucket));
      if (standalone) {
        flush();
        events.push(buildFilingEvent(day));
        return;
      }
      run.push(day);
    });
    flush();

    const total = events.reduce((sum, event) => sum + event.announcementCount, 0);
    const first = formatRegisterDate(days[0]?.publishedAt ?? null);
    const last = formatRegisterDate(days.at(-1)?.publishedAt ?? null);
    const span = first === last ? first : `${first} til ${last}`;
    const lead = [
      `Under navnet ${segment.name} er det registrert ${countLabel(total)}, fra ${span}.`,
      describeOpening(changeByToName.get(segment.name)),
    ]
      .filter(Boolean)
      .join(" ");

    eras.push({
      key: `${index}:${segment.name}`,
      chapter: `KAPITTEL ${eras.length + 1}`,
      name: segment.name,
      years: formatEraYears(segment, events, segment.isCurrent),
      lead,
      countLabel: countLabel(total),
      color: BUCKET_COLOR[events[0]?.bucket ?? "styre"],
      events,
    });
  });

  const total = announcements.length;
  const nameCount = segments.length;
  const firstYear = filingDays.find((day) => day.year)?.year ?? null;
  const buckets = new Set(
    announcements.length > 0
      ? eras.flatMap((era) =>
          era.events.flatMap((event) =>
            event.children.length > 0 ? event.children.map((child) => child.bucket) : [event.bucket],
          ),
        )
      : [],
  );

  let headline: string;
  if (total === 0) headline = "Ingen kunngjøringer registrert";
  else if (nameCount > 1) headline = `${numeral(nameCount)} navn, ett organisasjonsnummer`;
  else if (total <= 2) headline = "Kort historikk, ett navn";
  else headline = firstYear ? `Samme navn siden ${firstYear}` : "Samme navn gjennom hele historikken";

  const clauses: string[] = [];
  if (total === 0) {
    clauses.push(
      "Foretaksregisteret har ingen kunngjøringer på dette organisasjonsnummeret. Siden viser ikke noe annet — historikken finnes ikke i kilden.",
    );
  } else {
    clauses.push(
      `${total === 1 ? "Én kunngjøring" : `${total} kunngjøringer`} på organisasjonsnummeret${
        firstYear ? `, den eldste fra ${firstYear}` : ""
      }.`,
    );
    if (nameCount > 1) {
      clauses.push(
        `Foretaket har hatt ${numeral(nameCount).toLowerCase()} navn, så eldre kunngjøringer står under tidligere foretaksnavn.`,
      );
    }
    if (buckets.has("struktur")) {
      clauses.push("Historikken inneholder kunngjøringer om fusjon, fisjon eller eierforhold.");
    }
    if (buckets.has("konkurs")) {
      clauses.push("Historikken inneholder kunngjøringer om konkurs eller avvikling.");
    }
    if (total <= 3 && nameCount === 1) {
      clauses.push("Historikken er kort, og siden viser den i sin helhet uten sammendrag.");
    }
  }

  return {
    eras,
    stats: [
      { label: "KUNNGJØRINGER", value: total > 0 ? String(total) : "—" },
      { label: "NAVN", value: String(nameCount) },
      { label: "FØRSTE SPOR", value: firstYear ? String(firstYear) : "—" },
      { label: "STATUS", value: statusLabel },
    ],
    headline,
    lead: clauses.join(" "),
    chapterLabel:
      total === 0
        ? null
        : eras.length > 1
          ? `${numeral(eras.length)} kapitler utledet av navneendringer`
          : "Ett sammenhengende kapittel",
    isEmpty: total === 0,
    total,
    nameCount,
    firstYear,
  };
}
