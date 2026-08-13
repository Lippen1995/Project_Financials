import { describe, expect, it } from "vitest";

import {
  buildAnnouncementEvents,
  buildCompanyNameHistory,
  classifyAnnouncementTitle,
  findBankruptcyOpening,
} from "@/lib/company-history";
import type { NormalizedAnnouncement, NormalizedPreviousName } from "@/lib/types";

function announcement(
  id: string,
  title: string,
  publishedAt: string | null,
): NormalizedAnnouncement {
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

describe("classifyAnnouncementTitle", () => {
  it("reads Brreg's own announcement labels", () => {
    expect(classifyAnnouncementTitle("Foretaksnavn").category).toBe("navn");
    expect(classifyAnnouncementTitle("Endring av firma").category).toBe("navn");
    expect(classifyAnnouncementTitle("Fusjon").category).toBe("fusjon");
    expect(classifyAnnouncementTitle("Åpning av konkurs").category).toBe("konkurs");
    expect(classifyAnnouncementTitle("Nedsettelse av kapital").category).toBe("kapital");
    expect(classifyAnnouncementTitle("Vedtektsfestet formål").category).toBe("formaal");
    expect(classifyAnnouncementTitle("Godkjente årsregnskap").category).toBe("regnskap");
    expect(classifyAnnouncementTitle("Noe helt annet").category).toBe("annet");
  });
});

describe("buildAnnouncementEvents", () => {
  it("groups the announcements published on the same day into one filing", () => {
    const events = buildAnnouncementEvents([
      announcement("1", "Foretaksnavn", "2012-12-05"),
      announcement("2", "Styre", "2012-12-05"),
      announcement("3", "Kapital", "2003-05-19"),
    ]);

    expect(events).toHaveLength(2);
    expect(events[0].key).toBe("2012-12-05");
    expect(events[0].announcements).toHaveLength(2);
    expect(events[0].categories).toEqual(["navn", "styre"]);
  });
});

describe("findBankruptcyOpening", () => {
  it("picks the date proceedings were opened, not later bankruptcy filings", () => {
    const opened = findBankruptcyOpening([
      announcement("3", "Innstilling av bobehandling", "2026-03-01"),
      announcement("1", "Konkursåpning", "2025-04-22"),
      announcement("2", "Konkursåpning", "2025-09-10"),
    ]);

    expect(opened?.toISOString().slice(0, 10)).toBe("2025-04-22");
  });

  it("returns null for a company without bankruptcy proceedings", () => {
    expect(findBankruptcyOpening([announcement("1", "Godkjente årsregnskap", "2025-08-05")])).toBeNull();
  });
});

describe("buildCompanyNameHistory", () => {
  // Reach Subsea ASA (922493626): four names, three changes, and an announcement archive
  // that only reaches back to 2000 — so the 1996 change has no announcement to link to.
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
    announcement("20120000347211", "Vedtektsdato", "2012-08-18"),
    announcement("20030000108076", "Foretaksnavn", "2003-05-19"),
    announcement("20000000000001", "Godkjente årsregnskap", "2000-05-12"),
  ];

  const history = buildCompanyNameHistory({
    currentName: "REACH SUBSEA ASA",
    previousNames,
    announcements,
  });

  it("chains every name the company has carried, newest last", () => {
    expect(history.segments.map((segment) => segment.name)).toEqual([
      "NOMADIC SHIPPING ASA",
      "GREEN REEFERS ASA",
      "TRANSIT INVEST ASA",
      "REACH SUBSEA ASA",
    ]);
    expect(history.segments.at(-1)?.isCurrent).toBe(true);
    expect(history.segments.at(-1)?.fromDate?.toISOString()).toBe(
      new Date("2012-12-05T11:57:59").toISOString(),
    );
  });

  it("links each change to the announcement that registered it", () => {
    expect(history.changes.map((change) => change.toName)).toEqual([
      "REACH SUBSEA ASA",
      "TRANSIT INVEST ASA",
      "GREEN REEFERS ASA",
    ]);
    expect(history.changes[0].announcement?.id).toBe("20120000561588");
    expect(history.changes[1].announcement?.id).toBe("20120000347210");
    expect(history.changes[2].announcement?.id).toBe("20030000108076");
  });

  it("reads a name change filed with new board, management and address as an overhaul", () => {
    expect(history.changes[0].contextKind).toBe("omlegging");
    expect(history.changes[0].context.map((item) => item.title)).toContain("Daglig leder");
  });

  it("calls out a change that predates the announcement archive", () => {
    // The 1996 rename is older than every announcement Brreg holds for the company.
    const early = buildCompanyNameHistory({
      currentName: "NOMADIC SHIPPING ASA",
      previousNames: [previousName("SHIPPINGSELSKAPET AS", "1990-01-01", "1996-01-22T21:03:00")],
      announcements: [announcement("20000000000001", "Godkjente årsregnskap", "2000-05-12")],
    });

    expect(early.changes[0].announcement).toBeNull();
    expect(early.changes[0].contextKind).toBe("ingen-kunngjoring");
    expect(early.changes[0].contextLabel).toContain("starter 2000");
  });

  it("does not blame the archive when the change falls inside the archived period", () => {
    const unmatched = buildCompanyNameHistory({
      currentName: "GREEN REEFERS ASA",
      previousNames: [previousNames[0]],
      announcements: [announcement("20000000000001", "Godkjente årsregnskap", "2000-05-12")],
    });

    expect(unmatched.changes[0].contextKind).toBe("ingen-kunngjoring");
    expect(unmatched.changes[0].contextLabel).not.toContain("eldre enn");
  });

  it("separates a linked change with minor same-day filings from one without an announcement", () => {
    const change = history.changes[1];

    expect(change.announcement?.id).toBe("20120000347210");
    expect(change.contextKind).toBe("samtidige-endringer");
    expect(change.contextLabel).toContain("vedtektsdato");
  });

  it("reports a merger announced the same day as the reason on record", () => {
    const merger = buildCompanyNameHistory({
      currentName: "NYTT NAVN AS",
      previousNames: [previousName("GAMMELT NAVN AS", "2010-01-01", "2020-06-01")],
      announcements: [
        announcement("a", "Foretaksnavn", "2020-06-01"),
        announcement("b", "Fusjon", "2020-06-01"),
      ],
    });

    expect(merger.changes[0].contextKind).toBe("fusjon");
    expect(merger.changes[0].contextLabel).toContain("fusjon");
  });

  it("collapses a re-registration of the same name instead of calling it a change", () => {
    // Bennett Reklamebyrå (977511410) carries the same name across two adjacent periods.
    const collapsed = buildCompanyNameHistory({
      currentName: "BENNETT GRUPPEN AS",
      previousNames: [
        previousName("HULAAS & KVARBERG AS", "1997-05-07", "1997-05-16"),
        previousName("HULAAS & KVARBERG AS", "1997-05-16", "1999-11-29"),
      ],
      announcements: [],
    });

    expect(collapsed.segments.map((segment) => segment.name)).toEqual([
      "HULAAS & KVARBERG AS",
      "BENNETT GRUPPEN AS",
    ]);
    expect(collapsed.segments[0].fromDate?.getFullYear()).toBe(1997);
    expect(collapsed.segments[0].toDate?.getFullYear()).toBe(1999);
    expect(collapsed.changes).toHaveLength(1);
  });

  it("does not reuse one announcement for two changes", () => {
    const twoChanges = buildCompanyNameHistory({
      currentName: "TREDJE NAVN AS",
      previousNames: [
        previousName("FØRSTE NAVN AS", "2000-01-01", "2015-03-02"),
        previousName("ANDRE NAVN AS", "2015-03-02", "2021-09-09"),
      ],
      announcements: [announcement("only", "Foretaksnavn", "2021-09-09")],
    });

    expect(twoChanges.changes[0].announcement?.id).toBe("only");
    expect(twoChanges.changes[1].announcement).toBeNull();
  });
});
