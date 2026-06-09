import { describe, expect, it } from "vitest";

import {
  areSameInvestorStory,
  buildCompanyEventStoryKey,
  classifyCompanyEventStage,
  computeCompanyEventFeedRank,
  type FeedRankableEvent,
} from "@/server/news/company-event-feed-ranking";

const now = new Date("2026-06-06T12:00:00Z");

function event(partial: Partial<FeedRankableEvent> = {}): FeedRankableEvent {
  return {
    id: partial.id ?? "event-1",
    companyId: partial.companyId ?? "company-1",
    eventType: partial.eventType ?? "contract_award",
    title: partial.title ?? "Company wins material customer contract",
    eventDate: partial.eventDate ?? new Date("2026-06-05T12:00:00Z"),
    lastSeen: partial.lastSeen ?? new Date("2026-06-05T12:00:00Z"),
    investorValueScore: partial.investorValueScore ?? 72,
    confidenceScore: partial.confidenceScore ?? 0.9,
    noveltyScore: partial.noveltyScore ?? 0.82,
    severityScore: partial.severityScore ?? 0.72,
  };
}

describe("company event feed ranking", () => {
  it("ranks a fresh material event above an old event with a slightly higher static score", () => {
    const fresh = event();
    const old = event({
      id: "old",
      eventType: "capital_raise",
      title: "Private placement successfully placed",
      eventDate: new Date("2026-04-01T12:00:00Z"),
      investorValueScore: 82,
    });

    expect(computeCompanyEventFeedRank(fresh, now)).toBeGreaterThan(
      computeCompanyEventFeedRank(old, now),
    );
  });

  it("demotes administrative transaction updates", () => {
    const primary = event({
      eventType: "share_issue",
      title: "Company launches fully underwritten rights issue",
    });
    const administrative = event({
      id: "admin",
      eventType: "share_issue",
      title: "Last day of trading in warrants issued in connection with the rights issue",
      investorValueScore: 82,
    });

    expect(classifyCompanyEventStage(administrative)).toBe("administrative");
    expect(computeCompanyEventFeedRank(primary, now)).toBeGreaterThan(
      computeCompanyEventFeedRank(administrative, now),
    );
  });

  it("treats generic threshold disclosures as routine unless the title carries more detail", () => {
    expect(
      classifyCompanyEventStage(event({
        eventType: "ownership_change",
        title: "Flaggemelding Company ASA",
      })),
    ).toBe("routine");
  });

  it("demotes employee share plans and option-exercise issuance as administrative", () => {
    expect(
      classifyCompanyEventStage(event({
        eventType: "share_issue",
        title: "Issue of New Shares Following Option Exercise",
      })),
    ).toBe("administrative");
    expect(
      classifyCompanyEventStage(event({
        eventType: "buyback",
        title: "Initiation of share buyback for Employee Share Purchase Programme",
      })),
    ).toBe("administrative");
  });

  it("demotes routine share-buyback status reports as administrative", () => {
    expect(
      classifyCompanyEventStage(event({
        eventType: "buyback",
        title: "Status tilbakekjop av egne aksjer",
      })),
    ).toBe("administrative");
    expect(
      classifyCompanyEventStage(event({
        eventType: "buyback",
        title: "Transactions made under the share buyback programme",
      })),
    ).toBe("administrative");
    expect(
      classifyCompanyEventStage(event({
        eventType: "buyback",
        title: "DNB Bank ASA - status for tilbakekjopsprogram etter uke 23 2026",
      })),
    ).toBe("administrative");
    expect(
      classifyCompanyEventStage(event({
        eventType: "buyback",
        title: "DNB Bank ASA - status of share buy-back programme after week 23 2026",
      })),
    ).toBe("administrative");
  });

  it("groups financing lifecycle messages for the same company and time window", () => {
    const placement = event({
      eventType: "capital_raise",
      title: "Contemplated private placement",
    });
    const prospectus = event({
      id: "prospectus",
      eventType: "regulatory_approval",
      title: "Prospectus approved",
      eventDate: new Date("2026-06-03T12:00:00Z"),
    });
    const unrelatedCompany = event({
      id: "other",
      companyId: "company-2",
      eventType: "share_issue",
    });

    expect(areSameInvestorStory(placement, prospectus)).toBe(true);
    expect(areSameInvestorStory(placement, unrelatedCompany)).toBe(false);
  });

  it("groups near-identical transaction messages published for a parent and subsidiary", () => {
    const parent = event({
      companyId: "parent",
      eventType: "capital_raise",
      title: "Magnora ASA: Magnora Data Center ASA private placement successfully placed",
    });
    const subsidiary = event({
      id: "subsidiary-event",
      companyId: "subsidiary",
      eventType: "capital_raise",
      title: "Magnora Data Center ASA: Private placement successfully placed",
    });

    expect(areSameInvestorStory(parent, subsidiary)).toBe(true);
  });

  it("groups the same legal settlement disclosed by related listed companies", () => {
    const parent = event({
      companyId: "nel",
      eventType: "legal_settlement",
      title: "Nel ASA: Settlement agreement with Iwatani Corporation of America",
    });
    const subsidiary = event({
      id: "cavendish-settlement",
      companyId: "cavendish",
      eventType: "legal_settlement",
      title: "Cavendish Hydrogen ASA: Settlement Agreement with Iwatani Corporation of America",
    });

    expect(areSameInvestorStory(parent, subsidiary)).toBe(true);
  });

  it("uses one story key for a reporting invitation and results in the same quarter", () => {
    const invitation = buildCompanyEventStoryKey({
      companyId: "company-1",
      eventType: "reporting_calendar",
      title: "Invitation to Q1 results",
      eventDate: new Date("2026-04-10T12:00:00Z"),
    });
    const results = buildCompanyEventStoryKey({
      companyId: "company-1",
      eventType: "earnings",
      title: "First quarter results 2026",
      eventDate: new Date("2026-05-05T12:00:00Z"),
    });

    expect(invitation).toBe(results);
  });
});
