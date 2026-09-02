import { describe, expect, it } from "vitest";

import { buildAnnouncementStory } from "@/lib/announcement-story";
import type { NormalizedAnnouncement, NormalizedPreviousName } from "@/lib/types";

function announcement(id: string, title: string, publishedAt: string | null): NormalizedAnnouncement {
  const published = publishedAt ? new Date(publishedAt) : null;
  return {
    sourceSystem: "BRREG",
    sourceEntityType: "announcement",
    sourceId: id,
    fetchedAt: new Date("2026-08-11"),
    normalizedAt: new Date("2026-08-11"),
    id,
    orgNumber: "922493626",
    title,
    publishedAt: published,
    year: published ? published.getFullYear() : null,
    detailUrl: `https://w2.brreg.no/kunngjoring/hent_en.jsp?kid=${id}`,
  };
}

function previousName(name: string, fromDate: string, toDate: string): NormalizedPreviousName {
  return { name, fromDate: new Date(fromDate), toDate: new Date(toDate) };
}

describe("buildAnnouncementStory", () => {
  // Reach Subsea ASA (922493626): the change of control arrives as five announcements on one
  // date, and the three name changes cut the same feed into four chapters.
  const previousNames = [
    previousName("NOMADIC SHIPPING ASA", "1996-01-22T21:03:00", "2003-05-19T13:02:17"),
    previousName("GREEN REEFERS ASA", "2003-05-19T13:02:17", "2012-08-18T15:00:52"),
    previousName("TRANSIT INVEST ASA", "2012-08-18T15:00:52", "2012-12-05T11:57:59"),
  ];

  const announcements = [
    announcement("20120000561588", "Foretaksnavn", "2012-12-05"),
    announcement("20120000561593", "Vedtektsfestet formål", "2012-12-05"),
    announcement("20120000561591", "Forretningsadresse", "2012-12-05"),
    announcement("20120000561590", "Styre", "2012-12-05"),
    announcement("20120000561589", "Daglig leder", "2012-12-05"),
    announcement("20120000347210", "Foretaksnavn", "2012-08-18"),
    announcement("20030000108076", "Foretaksnavn", "2003-05-19"),
    // Four routine filing dates under Green Reefers, with nothing structural among them.
    announcement("20040000000001", "Kapitalforhøyelse", "2004-06-18"),
    announcement("20050000000001", "Styre", "2005-04-26"),
    announcement("20070000000001", "Kapitalforhøyelse", "2007-03-07"),
    announcement("20090000000001", "Nedsettelse av kapital", "2009-05-29"),
    announcement("20000000000001", "Godkjente årsregnskap", "2000-05-12"),
  ];

  const story = buildAnnouncementStory({
    companyName: "REACH SUBSEA ASA",
    previousNames,
    announcements,
    statusLabel: "Aktiv",
  });

  it("splits the feed into one chapter per name period, oldest first", () => {
    expect(story.eras.map((era) => era.name)).toEqual([
      "NOMADIC SHIPPING ASA",
      "GREEN REEFERS ASA",
      "TRANSIT INVEST ASA",
      "REACH SUBSEA ASA",
    ]);
    expect(story.eras.map((era) => era.chapter)).toEqual([
      "KAPITTEL 1",
      "KAPITTEL 2",
      "KAPITTEL 3",
      "KAPITTEL 4",
    ]);
  });

  it("opens a chapter with the announcement that renamed the company", () => {
    const reach = story.eras.at(-1);
    expect(reach?.events[0].title).toBe("Foretaksnavn");
    expect(reach?.events[0].bucket).toBe("navn");
    // Five announcements were filed that day; they hang under the row rather than beside it.
    expect(reach?.events[0].children).toHaveLength(5);
    expect(reach?.events[0].announcementCount).toBe(5);
  });

  it("names the other filings from the same day on the row, and why the chapter began in its lead", () => {
    const reach = story.eras.at(-1);
    expect(reach?.events[0].explain).toContain("sammen med 4 andre meldinger");
    expect(reach?.events[0].explain).toContain("daglig leder");
    expect(reach?.lead).toContain("større omlegging");
  });

  it("collapses a run of routine filing dates into one period row", () => {
    const greenReefers = story.eras[1];
    const period = greenReefers.events.find((event) => event.kind === "period");

    expect(period).toBeDefined();
    expect(period?.dateLabel).toBe("2004–2009");
    expect(period?.children.map((child) => child.title)).toEqual([
      "Kapitalforhøyelse",
      "Styre",
      "Kapitalforhøyelse",
      "Nedsettelse av kapital",
    ]);
    expect(period?.registerText).toBe("Samlevisning av 4 kunngjøringer. Utvid for enkeltkunngjøringene.");
  });

  it("counts every announcement, not every row", () => {
    const rows = story.eras.reduce((sum, era) => sum + era.events.length, 0);
    expect(rows).toBeLessThan(announcements.length);
    expect(story.stats.find((stat) => stat.label === "KUNNGJØRINGER")?.value).toBe("12");
    expect(story.eras[1].countLabel).toBe("5 kunngjøringer");
  });

  it("derives the headline and the stats from the register alone", () => {
    expect(story.headline).toBe("Fire navn, ett organisasjonsnummer");
    expect(story.lead).toContain("12 kunngjøringer på organisasjonsnummeret, den eldste fra 2000");
    expect(story.lead).toContain("fire navn");
    expect(story.chapterLabel).toBe("Fire kapitler utledet av navneendringer");
    expect(story.stats).toEqual([
      { label: "KUNNGJØRINGER", value: "12" },
      { label: "NAVN", value: "4" },
      { label: "FØRSTE SPOR", value: "2000" },
      { label: "STATUS", value: "Aktiv" },
    ]);
  });
});

describe("buildAnnouncementStory — a company with a short history", () => {
  const story = buildAnnouncementStory({
    companyName: "HAVBRIS UTVIKLING AS",
    previousNames: [],
    announcements: [announcement("1", "Nyregistrering i Foretaksregisteret", "2025-02-06")],
    statusLabel: "Aktiv",
  });

  it("shows the single filing without summarising it", () => {
    expect(story.headline).toBe("Kort historikk, ett navn");
    expect(story.eras).toHaveLength(1);
    expect(story.eras[0].events).toHaveLength(1);
    expect(story.eras[0].events[0].kind).toBe("filing");
    expect(story.eras[0].events[0].children).toEqual([]);
    expect(story.eras[0].events[0].explain).toBe("Eneste kunngjøring registrert 06.02.2025.");
    expect(story.chapterLabel).toBe("Ett sammenhengende kapittel");
  });
});

describe("buildAnnouncementStory — a company with nothing in the register", () => {
  const story = buildAnnouncementStory({
    companyName: "GRINDVIK HOLDING AS",
    previousNames: [],
    announcements: [],
    statusLabel: "Aktiv",
  });

  it("says the source is empty instead of constructing a history", () => {
    expect(story.isEmpty).toBe(true);
    expect(story.emptyReason).toBe("none-in-source");
    expect(story.eras).toEqual([]);
    expect(story.headline).toBe("Ingen kunngjøringer registrert");
    expect(story.lead).toContain("historikken finnes ikke i kilden");
    expect(story.chapterLabel).toBeNull();
    expect(story.stats.find((stat) => stat.label === "KUNNGJØRINGER")?.value).toBe("—");
  });
});

describe("buildAnnouncementStory — a company that has not been fetched yet", () => {
  const story = buildAnnouncementStory({
    companyName: "REACH SUBSEA ASA",
    previousNames: [],
    announcements: [],
    statusLabel: "Aktiv",
    availabilityStatus: "PENDING",
  });

  it("does not claim the register is empty when the queue has not run", () => {
    expect(story.isEmpty).toBe(true);
    expect(story.emptyReason).toBe("not-loaded");
    expect(story.headline).toBe("Kunngjøringer er ikke hentet ennå");
    expect(story.lead).not.toContain("historikken finnes ikke i kilden");
    expect(story.lead).toContain("står i kø");
  });
});

describe("buildAnnouncementStory — a source that did not answer", () => {
  const story = buildAnnouncementStory({
    companyName: "REACH SUBSEA ASA",
    previousNames: [],
    announcements: [],
    statusLabel: "Aktiv",
    availabilityStatus: "ERROR",
  });

  it("reports the failed fetch rather than an absent history", () => {
    expect(story.emptyReason).toBe("unavailable");
    expect(story.headline).toBe("Kunngjøringer kunne ikke hentes");
    expect(story.lead).not.toContain("historikken finnes ikke i kilden");
  });
});

describe("buildAnnouncementStory — bankruptcy", () => {
  const story = buildAnnouncementStory({
    companyName: "KYSTBYGG ENTREPRENØR AS",
    previousNames: [],
    announcements: [
      announcement("1", "Nyregistrering i Foretaksregisteret", "2001-09-02"),
      announcement("2", "Nedsettelse av kapital", "2023-11-28"),
      announcement("3", "Konkursåpning", "2024-01-14"),
    ],
    statusLabel: "Konkurs",
  });

  it("keeps the insolvency filing on its own row and flags it in the lead", () => {
    const rows = story.eras[0].events;
    expect(rows.map((event) => event.kind)).toEqual(["filing", "filing", "filing"]);
    expect(rows.at(-1)?.bucket).toBe("konkurs");
    expect(story.lead).toContain("konkurs eller avvikling");
  });
});
