import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, feedbackServiceMock } = vi.hoisted(() => ({
  authMock: {
    safeAuth: vi.fn(),
  },
  feedbackServiceMock: {
    COMPANY_EVENT_FEEDBACK_ACTIONS: [
      "rated",
      "relevant",
      "not_relevant",
      "wrong_company",
      "wrong_event_type",
      "duplicate",
      "too_high_score",
      "too_low_score",
      "important_for_watchlist",
      "dismissed",
      "corrected_event_type",
      "corrected_direction",
      "corrected_score_bucket",
    ],
    recordCompanyEventFeedback: vi.fn(),
    getCompanyEventFeedbackMetrics: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/server/news/company-event-feedback-service", () => feedbackServiceMock);

import { GET, POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/company-events/event-1/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  }) as never;
}

describe("company event feedback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.safeAuth.mockResolvedValue({
      user: {
        id: "user-1",
        appRole: "USER",
      },
    });
    feedbackServiceMock.recordCompanyEventFeedback.mockResolvedValue({ id: "feedback-1" });
    feedbackServiceMock.getCompanyEventFeedbackMetrics.mockResolvedValue({ totalFeedback: 0 });
  });

  it("requires authentication", async () => {
    authMock.safeAuth.mockResolvedValue(null);

    const response = await POST(request({ action: "relevant" }), {
      params: Promise.resolve({ eventId: "event-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("validates feedback actions", async () => {
    const response = await POST(request({ action: "invented_action" }), {
      params: Promise.resolve({ eventId: "event-1" }),
    });

    expect(response.status).toBe(400);
    expect(feedbackServiceMock.recordCompanyEventFeedback).not.toHaveBeenCalled();
  });

  it("records feedback for the authenticated user", async () => {
    const response = await POST(
      request({
        action: "wrong_company",
        notes: "This belongs elsewhere",
      }),
      {
        params: Promise.resolve({ eventId: "event-1" }),
      },
    );

    expect(response.status).toBe(201);
    expect(feedbackServiceMock.recordCompanyEventFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        userId: "user-1",
        action: "wrong_company",
        notes: "This belongs elsewhere",
        actorRole: "USER",
      }),
    );
  });

  it("accepts separate relevance and investor-value ratings", async () => {
    const response = await POST(
      request({
        action: "rated",
        previousValue: { relevanceScore: 90, investorValueScore: 80 },
        correctedValue: { relevanceScore: 75, investorValueScore: 35 },
      }),
      {
        params: Promise.resolve({ eventId: "event-1" }),
      },
    );

    expect(response.status).toBe(201);
    expect(feedbackServiceMock.recordCompanyEventFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "rated",
        correctedValue: { relevanceScore: 75, investorValueScore: 35 },
      }),
    );
  });

  it("returns event feedback metrics", async () => {
    const response = await GET(new Request("http://localhost/api/company-events/event-1/feedback") as never, {
      params: Promise.resolve({ eventId: "event-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ data: { totalFeedback: 0 } });
    expect(feedbackServiceMock.getCompanyEventFeedbackMetrics).toHaveBeenCalledWith("event-1");
  });
});
