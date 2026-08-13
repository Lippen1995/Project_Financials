import type { NormalizedAnnouncement, NormalizedPreviousName } from "@/lib/types";

/**
 * Brønnøysund publishes one announcement per changed fact, not one per event: a change of
 * control shows up as a handful of announcements filed the same day (foretaksnavn, styre,
 * daglig leder, forretningsadresse, kapital). Grouping them by publication date and naming
 * what each one covers is what turns the raw list into the company's story.
 *
 * Everything here is derived from what Brreg actually registered — a name change is reported
 * together with the other filings from the same day, never with an invented motive.
 */

export type AnnouncementCategory =
  | "navn"
  | "fusjon"
  | "fisjon"
  | "konkurs"
  | "avvikling"
  | "kapital"
  | "vedtekter"
  | "formaal"
  | "ledelse"
  | "styre"
  | "revisor"
  | "adresse"
  | "regnskap"
  | "eierskap"
  | "annet";

type CategoryRule = {
  category: AnnouncementCategory;
  label: string;
  pattern: RegExp;
};

// Order matters: the first matching rule wins, so the narrow event types come before the
// generic ones ("nedsettelse av kapital" must not be read as a plain vedtekts-change).
const CATEGORY_RULES: CategoryRule[] = [
  { category: "navn", label: "Navneendring", pattern: /foretaksnavn|endring av firma|^firma$|navneendring/i },
  { category: "fusjon", label: "Fusjon", pattern: /fusjon|sammensl(å|aa)ing/i },
  { category: "fisjon", label: "Fisjon", pattern: /fisjon|deling av selskap/i },
  {
    category: "konkurs",
    label: "Konkurs",
    pattern: /konkurs|bobehandling|bostyre|akkord|gjeldsforhandling/i,
  },
  {
    category: "avvikling",
    label: "Avvikling",
    pattern: /avvikling|oppl(ø|o)sning|sletting|slettet|tvangs/i,
  },
  {
    category: "kapital",
    label: "Kapital",
    pattern: /kapital|aksjer|tegningsrett|utbytte|fondsemisjon/i,
  },
  { category: "formaal", label: "Formål", pattern: /form(å|aa)l|virksomhet/i },
  { category: "vedtekter", label: "Vedtekter", pattern: /vedtekt/i },
  { category: "ledelse", label: "Ledelse", pattern: /daglig leder|forretningsf(ø|o)rer/i },
  { category: "styre", label: "Styre", pattern: /styre|deltaker|innehaver/i },
  { category: "revisor", label: "Revisor", pattern: /revisor|regnskapsf(ø|o)rer/i },
  { category: "adresse", label: "Adresse", pattern: /adresse|kommune/i },
  { category: "regnskap", label: "Regnskap", pattern: /(å|aa)rsregnskap|regnskap/i },
  { category: "eierskap", label: "Eierforhold", pattern: /meldepliktig avtale|eier|konsern/i },
];

const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  navn: "Navneendring",
  fusjon: "Fusjon",
  fisjon: "Fisjon",
  konkurs: "Konkurs",
  avvikling: "Avvikling",
  kapital: "Kapital",
  vedtekter: "Vedtekter",
  formaal: "Formål",
  ledelse: "Ledelse",
  styre: "Styre",
  revisor: "Revisor",
  adresse: "Adresse",
  regnskap: "Regnskap",
  eierskap: "Eierforhold",
  annet: "Annet",
};

/** How wide a window a registered name change and its announcement may sit apart. */
const NAME_CHANGE_MATCH_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ClassifiedAnnouncement = NormalizedAnnouncement & {
  category: AnnouncementCategory;
  categoryLabel: string;
};

export type AnnouncementEvent = {
  /** yyyy-mm-dd for dated events, "udatert" for the rest. */
  key: string;
  publishedAt: Date | null;
  year: number | null;
  announcements: ClassifiedAnnouncement[];
  categories: AnnouncementCategory[];
};

export type NameChangeContextKind =
  | "fusjon"
  | "fisjon"
  | "konkurs"
  | "avvikling"
  | "omlegging"
  | "navn-alene"
  /** Announced together with other changes that do not add up to a recognisable event. */
  | "samtidige-endringer"
  /** The change is registered, but no announcement in the archive covers it. */
  | "ingen-kunngjoring";

export type NameChange = {
  fromName: string;
  toName: string;
  changedAt: Date | null;
  /** The "Foretaksnavn"-announcement for this change, when the archive reaches back that far. */
  announcement: ClassifiedAnnouncement | null;
  /** Everything else Brreg published the same day — the evidence behind the context label. */
  context: ClassifiedAnnouncement[];
  contextKind: NameChangeContextKind;
  contextLabel: string;
};

export type NameSegment = {
  name: string;
  fromDate: Date | null;
  toDate: Date | null;
  isCurrent: boolean;
};

export type CompanyNameHistory = {
  segments: NameSegment[];
  /** Newest first. */
  changes: NameChange[];
  /** Oldest announcement we hold; changes before this date have no announcement to link to. */
  archiveStart: Date | null;
};

export function classifyAnnouncementTitle(title: string): {
  category: AnnouncementCategory;
  categoryLabel: string;
} {
  const rule = CATEGORY_RULES.find((candidate) => candidate.pattern.test(title));
  return rule
    ? { category: rule.category, categoryLabel: rule.label }
    : { category: "annet", categoryLabel: CATEGORY_LABELS.annet };
}

export function classifyAnnouncements(
  announcements: readonly NormalizedAnnouncement[],
): ClassifiedAnnouncement[] {
  return announcements.map((announcement) => ({
    ...announcement,
    ...classifyAnnouncementTitle(announcement.title),
  }));
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDayKey(value: Date | null): string {
  if (!value) return "udatert";
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Groups announcements into the filings they were published as — one group per date. */
export function buildAnnouncementEvents(
  announcements: readonly NormalizedAnnouncement[],
): AnnouncementEvent[] {
  const classified = classifyAnnouncements(announcements);
  const grouped = new Map<string, ClassifiedAnnouncement[]>();

  for (const announcement of classified) {
    const key = toDayKey(toDate(announcement.publishedAt));
    const current = grouped.get(key) ?? [];
    current.push(announcement);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([key, items]) => {
      const publishedAt = toDate(items[0]?.publishedAt);
      return {
        key,
        publishedAt,
        year: publishedAt ? publishedAt.getFullYear() : null,
        announcements: items,
        categories: Array.from(new Set(items.map((item) => item.category))),
      } satisfies AnnouncementEvent;
    })
    .sort((left, right) => {
      const leftTime = left.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightTime = right.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      return rightTime - leftTime;
    });
}

/**
 * The date bankruptcy proceedings were opened, from the company's own announcements. Used to
 * place another entity's founding date against the collapse of this one — the register never
 * links the two, but the two dates side by side are what make the sequence readable.
 */
export function findBankruptcyOpening(
  announcements: readonly NormalizedAnnouncement[],
): Date | null {
  const openings = classifyAnnouncements(announcements)
    .filter(
      (announcement) =>
        announcement.category === "konkurs" &&
        /konkurs(å|aa)pning|(å|aa)pning av konkurs/i.test(announcement.title),
    )
    .map((announcement) => toDate(announcement.publishedAt))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  return openings[0] ?? null;
}

function describeContext(
  context: readonly ClassifiedAnnouncement[],
): { kind: NameChangeContextKind; label: string } {
  const categories = new Set(context.map((item) => item.category));

  if (categories.has("fusjon")) {
    return { kind: "fusjon", label: "Navnet ble endret samtidig med en kunngjort fusjon." };
  }
  if (categories.has("fisjon")) {
    return { kind: "fisjon", label: "Navnet ble endret samtidig med en kunngjort fisjon." };
  }
  if (categories.has("konkurs")) {
    return { kind: "konkurs", label: "Navnet ble endret samtidig med kunngjøringer om konkursbehandling." };
  }
  if (categories.has("avvikling")) {
    return { kind: "avvikling", label: "Navnet ble endret samtidig med kunngjøringer om avvikling eller oppløsning." };
  }

  // A change of control is filed as a burst: new board, new management, new address, new
  // purpose. Three or more of those on the same day says more than the name change alone.
  const overhaulSignals = (["styre", "ledelse", "adresse", "kapital", "formaal", "vedtekter"] as const).filter(
    (category) => categories.has(category),
  );
  if (overhaulSignals.length >= 3) {
    return {
      kind: "omlegging",
      label: `Navnet ble endret som del av en større omlegging — ${overhaulSignals
        .map((category) => CATEGORY_LABELS[category].toLowerCase())
        .join(", ")} ble kunngjort samme dag.`,
    };
  }

  if (context.length === 0) {
    return { kind: "navn-alene", label: "Navnet ble endret uten andre kunngjøringer samme dag." };
  }

  return {
    kind: "samtidige-endringer",
    label: `Kunngjort samme dag som ${context.map((item) => item.title.toLowerCase()).join(", ")}.`,
  };
}

function findNameAnnouncement(
  changedAt: Date | null,
  nameAnnouncements: readonly ClassifiedAnnouncement[],
  used: Set<string>,
): ClassifiedAnnouncement | null {
  const candidates = nameAnnouncements.filter((announcement) => !used.has(announcement.id));
  if (candidates.length === 0) return null;

  if (!changedAt) {
    return null;
  }

  let best: { announcement: ClassifiedAnnouncement; distance: number } | null = null;
  for (const announcement of candidates) {
    const publishedAt = toDate(announcement.publishedAt);
    if (!publishedAt) continue;
    const distance = Math.abs(publishedAt.getTime() - changedAt.getTime());
    if (distance > NAME_CHANGE_MATCH_DAYS * DAY_MS) continue;
    if (!best || distance < best.distance) {
      best = { announcement, distance };
    }
  }

  return best?.announcement ?? null;
}

/**
 * Reconstructs the chain of names the company has carried and pairs every change with the
 * announcement that registered it. Brreg keys announcements on the organisation number, so
 * filings made under an earlier name are already part of the same feed — the only gap is
 * changes older than the announcement archive itself.
 */
export function buildCompanyNameHistory({
  currentName,
  previousNames,
  announcements,
}: {
  currentName: string;
  previousNames: readonly NormalizedPreviousName[];
  announcements: readonly NormalizedAnnouncement[];
}): CompanyNameHistory {
  const classified = classifyAnnouncements(announcements);
  const nameAnnouncements = classified
    .filter((announcement) => announcement.category === "navn")
    .sort((left, right) => {
      const leftTime = toDate(left.publishedAt)?.getTime() ?? 0;
      const rightTime = toDate(right.publishedAt)?.getTime() ?? 0;
      return rightTime - leftTime;
    });

  const datedAnnouncements = classified
    .map((announcement) => toDate(announcement.publishedAt))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());
  const archiveStart = datedAnnouncements[0] ?? null;

  const ordered = [...previousNames].sort((left, right) => {
    const leftTime = toDate(left.fromDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
    const rightTime = toDate(right.fromDate)?.getTime() ?? Number.NEGATIVE_INFINITY;
    return leftTime - rightTime;
  });

  const rawSegments: NameSegment[] = ordered.map((entry) => ({
    name: entry.name,
    fromDate: toDate(entry.fromDate),
    toDate: toDate(entry.toDate),
    isCurrent: false,
  }));
  rawSegments.push({
    name: currentName,
    fromDate: toDate(ordered.at(-1)?.toDate ?? null),
    toDate: null,
    isCurrent: true,
  });

  // Brreg records a re-registration of the same name as a new period (a correction, a
  // registry migration). Those are not name changes, so adjacent periods carrying the same
  // name are collapsed into the single stretch the company actually carried it.
  const segments = rawSegments.reduce<NameSegment[]>((collapsed, segment) => {
    const previous = collapsed.at(-1);
    if (previous && previous.name.trim().toUpperCase() === segment.name.trim().toUpperCase()) {
      collapsed[collapsed.length - 1] = {
        name: previous.name,
        fromDate: previous.fromDate ?? segment.fromDate,
        toDate: segment.toDate,
        isCurrent: previous.isCurrent || segment.isCurrent,
      };
      return collapsed;
    }

    collapsed.push({ ...segment });
    return collapsed;
  }, []);

  const used = new Set<string>();
  const changes: NameChange[] = [];
  for (let index = 0; index < segments.length - 1; index += 1) {
    const previous = segments[index];
    const next = segments[index + 1];
    const changedAt = previous.toDate ?? next.fromDate;
    const announcement = findNameAnnouncement(changedAt, nameAnnouncements, used);
    if (announcement) {
      used.add(announcement.id);
    }

    const announcementDay = toDayKey(toDate(announcement?.publishedAt ?? null));
    const context = announcement
      ? classified.filter(
          (candidate) =>
            candidate.id !== announcement.id && toDayKey(toDate(candidate.publishedAt)) === announcementDay,
        )
      : [];
    const described = announcement
      ? describeContext(context)
      : {
          kind: "ingen-kunngjoring" as const,
          label:
            archiveStart && changedAt && changedAt.getTime() < archiveStart.getTime()
              ? `Endringen er eldre enn Brregs kunngjøringsarkiv for foretaket, som starter ${archiveStart.getFullYear()}.`
              : "Det finnes ingen kunngjøring i arkivet som dekker denne endringen.",
        };

    changes.push({
      fromName: previous.name,
      toName: next.name,
      changedAt,
      announcement,
      context,
      contextKind: described.kind,
      contextLabel: described.label,
    });
  }

  changes.reverse();

  return { segments, changes, archiveStart };
}
