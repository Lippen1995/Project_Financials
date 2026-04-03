import { describe, expect, it } from "vitest";

import {
  mapGasscoRealtimeEntriesToEvents,
  mapGasscoUmmEntriesToEvents,
  parseGasscoAtomFeed,
} from "@/integrations/gassco/gassco-market-provider";

describe("gassco-market-provider", () => {
  it("parser og mapper sanntidsfeed til Gassco-events", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Real-time nomination information at umm.gassco.no</title>
        <updated>2026-04-03T10:38:11Z</updated>
        <entry>
          <title>Exit Nomination Dornum (MSm3)</title>
          <author><name>Gassco AS</name></author>
          <id>urn:uuid:523dd8fe-bbb1-352d-806b-09436e299b9a</id>
          <updated>2026-04-03T10:38:11Z</updated>
          <content>67.4</content>
        </entry>
      </feed>`;

    const parsed = parseGasscoAtomFeed(xml);
    const events = mapGasscoRealtimeEntriesToEvents(parsed);

    expect(parsed).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("REALTIME_NOMINATION");
    expect(events[0]?.title).toBe("Sanntidsnominering Dornum");
    expect(events[0]?.summary).toContain("67.4 MSm3");
    expect(events[0]?.sourceEntityType).toBe("real_time_atom_feed");
  });

  it("parser og mapper generell Atom-feed til UMM-events", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Published at umm.gassco.no</title>
        <entry>
          <title>Maintenance at Kollsnes</title>
          <id>urn:uuid:event-123</id>
          <updated>2026-04-03T11:00:00Z</updated>
          <summary>Planned maintenance with reduced capacity.</summary>
          <link rel="alternate" href="/details?id=event-123" />
        </entry>
      </feed>`;

    const parsed = parseGasscoAtomFeed(xml);
    const events = mapGasscoUmmEntriesToEvents(parsed);

    expect(parsed).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("UMM_ATOM_EVENT");
    expect(events[0]?.title).toBe("Maintenance at Kollsnes");
    expect(events[0]?.detailUrl).toBe("https://umm.gassco.no/details?id=event-123");
    expect(events[0]?.sourceEntityType).toBe("atom_feed");
  });
});
