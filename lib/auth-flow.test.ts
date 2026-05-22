import { describe, expect, it } from "vitest";

import {
  getOnboardingPath,
  isAuthBypassPath,
  resolvePostLoginDestination,
} from "@/lib/auth-flow";

describe("auth flow helpers", () => {
  it("sends incomplete profiles to onboarding", () => {
    expect(
      resolvePostLoginDestination({
        onboardingCompleted: false,
        onboardingRequired: true,
        preferredPath: "/dashboard",
      }),
    ).toBe("/onboarding/profile");
  });

  it("lets existing incomplete users continue to the app when onboarding is not required", () => {
    expect(
      resolvePostLoginDestination({
        onboardingCompleted: false,
        onboardingRequired: false,
        preferredPath: "/dashboard",
      }),
    ).toBe("/dashboard");
  });

  it("avoids redirecting completed users back into auth or onboarding bypass paths", () => {
    expect(
      resolvePostLoginDestination({
        onboardingCompleted: true,
        onboardingRequired: false,
        preferredPath: "/login",
      }),
    ).toBe("/dashboard");

    expect(isAuthBypassPath("/api/auth/callback/linkedin")).toBe(true);
    expect(isAuthBypassPath("/onboarding/profile")).toBe(true);
  });

  it("builds edit-mode onboarding links with an explicit step", () => {
    expect(getOnboardingPath("edit", 3)).toBe("/onboarding/profile?mode=edit&step=3");
  });
});
