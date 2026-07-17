import { describe, expect, it } from "vitest";

import { parseNewswebInsiderDisclosure } from "@/server/insider-transactions/newsweb-insider-parser";

// Extracted from NewsWeb message 678361 / KRT-1500 attachment 329871.
const reachKrtText = `
1.2.1 Rapportøres Navn
PETTERSEN ARVID STÅLE
1.2.2 Rapportøres Foretaksnavn
PI SUBSEA AS
1.4.2 Fullt navn
PETTERSEN ARVID STÅLE
1.4.4 Stilling/Rolle
Styremedlem
2.3.1 Instrument : Aksje
2.3.2 ISIN-kode : NO0003117202
2.3.2.1 Utstedernavn : REACH SUBSEA ASA
2.4.1 Transaksjonstype : Kjøp
2.6.1 Valuta : NOK
2.8.1 Gjennomsnittlig pris per enhet : 4,885
2.8.2 Aggregert volum : 10 000
2.9.1 Angi dato : 16.07.2026
2.10.1 Handelsplass : XOSL - Oslo Børs
`;

describe("NewsWeb insider disclosure parser", () => {
  it("extracts a dated company purchase from an official KRT-1500 form", () => {
    const result = parseNewswebInsiderDisclosure({
      messageId: 678361,
      title: "Mandatory Notification of Trade by Primary Insider",
      body: "PI Subsea AS, a Close Associate of Arvid Ståle Pettersen, purchased 10,000 shares.",
      publishedAt: new Date("2026-07-17T06:54:27.169Z"),
      sourceUrl: "https://newsweb.oslobors.no/message/678361",
      attachments: [{ attachmentId: 329871, name: "KRT-1500 PI SUBSEA AS_160726.pdf", text: reachKrtText }],
    });

    expect(result).toEqual([
      expect.objectContaining({
        sourceId: "newsweb:678361:329871",
        transactionDate: new Date("2026-07-16T00:00:00.000Z"),
        action: "PURCHASE",
        instrumentType: "SHARE",
        isin: "NO0003117202",
        reportedShares: 10_000n,
        reportingPartyName: "PI SUBSEA AS",
        primaryInsiderName: "PETTERSEN ARVID STÅLE",
      }),
    ]);
  });

  it("rejects a form without an explicit transaction date", () => {
    const result = parseNewswebInsiderDisclosure({
      messageId: 1,
      title: "Mandatory notification",
      body: null,
      publishedAt: new Date("2026-01-02T00:00:00Z"),
      sourceUrl: "https://newsweb.oslobors.no/message/1",
      attachments: [{ attachmentId: 2, name: "form.pdf", text: reachKrtText.replace("2.9.1 Angi dato : 16.07.2026", "") }],
    });

    expect(result).toEqual([]);
  });

  it("does not publish a transaction when the attachment and announcement disagree on volume", () => {
    const result = parseNewswebInsiderDisclosure({
      messageId: 675619,
      title: "Mandatory Notification of Trade by Primary Insider",
      body: "Audun Brandtzæg has today purchased 100,000 shares in Reach Subsea ASA.",
      publishedAt: new Date("2026-06-08T11:02:07.748Z"),
      sourceUrl: "https://newsweb.oslobors.no/message/675619",
      attachments: [
        {
          attachmentId: 327757,
          name: "KRT-1500.pdf",
          text: reachKrtText.replace("10 000", "1 000 000").replace("PETTERSEN ARVID STÅLE", "BRANDTZÆG AUDUN"),
        },
      ],
    });

    expect(result).toEqual([]);
  });

  it("withholds transaction types whose holding impact is not modeled", () => {
    const result = parseNewswebInsiderDisclosure({
      messageId: 3,
      title: "Mandatory notification",
      body: null,
      publishedAt: new Date("2026-07-17T00:00:00Z"),
      sourceUrl: "https://newsweb.oslobors.no/message/3",
      attachments: [
        {
          attachmentId: 4,
          name: "form.pdf",
          text: reachKrtText.replace("Transaksjonstype : Kjøp", "Transaksjonstype : Gave"),
        },
      ],
    });

    expect(result).toEqual([]);
  });

  it("withholds options instead of treating them as ordinary shares", () => {
    const result = parseNewswebInsiderDisclosure({
      messageId: 5,
      title: "Mandatory notification",
      body: null,
      publishedAt: new Date("2026-07-17T00:00:00Z"),
      sourceUrl: "https://newsweb.oslobors.no/message/5",
      attachments: [
        {
          attachmentId: 6,
          name: "form.pdf",
          text: reachKrtText.replace("Instrument : Aksje", "Instrument : Aksjeopsjon"),
        },
      ],
    });

    expect(result).toEqual([]);
  });

  it("uses stable attachment identities regardless of attachment order", () => {
    const disclosure = {
      messageId: 7,
      title: "Mandatory notification",
      body: null,
      publishedAt: new Date("2026-07-17T00:00:00Z"),
      sourceUrl: "https://newsweb.oslobors.no/message/7",
      attachments: [
        { attachmentId: 8, name: "first.pdf", text: reachKrtText },
        { attachmentId: 9, name: "second.pdf", text: reachKrtText },
      ],
    };

    const first = parseNewswebInsiderDisclosure(disclosure).map(({ sourceId }) => sourceId).sort();
    const reversed = parseNewswebInsiderDisclosure({
      ...disclosure,
      attachments: [...disclosure.attachments].reverse(),
    }).map(({ sourceId }) => sourceId).sort();

    expect(reversed).toEqual(first);
  });
});
