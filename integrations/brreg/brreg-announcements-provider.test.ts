import { describe, expect, it } from "vitest";

import { parseAnnouncementList } from "@/integrations/brreg/brreg-announcements-provider";

/**
 * Shaped like the real w2.brreg.no listing: the publication date is printed once and the
 * announcements filed together on that date leave the date cell empty.
 */
function row(dateText: string, kid: string, title: string) {
  return `<tr bgcolor="#ffffff">
<td>
<p>&nbsp;</p>
</td><td nowrap="true">
<p>${dateText}</p>
</td><td>
<p>&nbsp;</p>
</td><td nowrap="true">
<p>
<a href="hent_en.jsp?kid=${kid}&amp;sokeverdi=922493626&amp;spraak=nb">${title}</a>
</p>
</td><td>
<p>&nbsp;</p>
</td>
</tr>`;
}

const listHtml = `<html><body><table>
<tr><td><p><strong>Type</strong></p></td><td nowrap="true"><p><strong>Dato</strong></p></td><td><p>&nbsp;</p></td><td nowrap="true"><p><strong>Kunngj&oslash;ring</strong></p></td><td><p>&nbsp;</p></td></tr>
${row("05.08.2025", "20250000487222", "Godkjente &aring;rsregnskap")}
${row("05.12.2012", "20120000561596", "Rettelse av kapital")}
${row("", "20120000561593", "Vedtektsfestet form&aring;l")}
${row("", "20120000561588", "Foretaksnavn")}
${row("19.05.2003", "20030000108076", "Foretaksnavn")}
</table>
<p><a href="hent_alle.jsp?kid=20260000373317&amp;sokeverdi=922493626&amp;spraak=nb">Vis alle kunngj&oslash;ringer</a></p>
</body></html>`;

describe("parseAnnouncementList", () => {
  const result = parseAnnouncementList("922493626", listHtml);

  it("skips the header row and keeps every announcement", () => {
    expect(result.availability.available).toBe(true);
    expect(result.announcements.map((announcement) => announcement.id)).toEqual([
      "20250000487222",
      "20120000561596",
      "20120000561593",
      "20120000561588",
      "20030000108076",
    ]);
  });

  it("carries the publication date across the rows Brreg leaves blank", () => {
    const dates = result.announcements.map((announcement) =>
      announcement.publishedAt?.toISOString().slice(0, 10),
    );

    expect(dates).toEqual(["2025-08-05", "2012-12-05", "2012-12-05", "2012-12-05", "2003-05-19"]);
    expect(result.announcements.every((announcement) => announcement.year !== null)).toBe(true);
  });

  it("decodes the announcement titles", () => {
    expect(result.announcements[0].title).toBe("Godkjente årsregnskap");
    expect(result.announcements[2].title).toBe("Vedtektsfestet formål");
  });

  it("exposes the link to the full Brreg listing", () => {
    expect(result.allAnnouncementsUrl).toContain("hent_alle.jsp?kid=20260000373317");
    expect(result.allAnnouncementsUrl).not.toContain("&amp;");
  });

  it("reports an empty register listing as an available, empty result", () => {
    const empty = parseAnnouncementList(
      "999999999",
      "<html><body><p>Det finnes ingen kunngj&oslash;ringer</p></body></html>",
    );

    expect(empty.announcements).toEqual([]);
    expect(empty.availability.available).toBe(true);
  });
});
