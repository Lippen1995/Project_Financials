import { describe, expect, it } from "vitest";

import {
  calculateProfileCompleteness,
  buildUserProfilePatchPayload,
  getProfileAffiliationSubtitle,
  getProfileCompletenessHint,
  getProfileDisplayName,
  getProfileHeadline,
  getProfileInitials,
  getProfileLocationLabel,
  userProfilePatchSchema,
  type UserProfileState,
} from "@/lib/user-profile";

describe("user profile helpers", () => {
  it("removes read-only profile fields before onboarding saves or skips", () => {
    const profile = {
      displayName: "Investor Demo",
      workEmail: null,
      profileCompletenessScore: 9,
      onboardingCompleted: false,
      onboardingCompletedAt: null,
      onboardingStep: 1,
      linkedinConnected: false,
      linkedinProviderAccountId: null,
      expertiseAreas: [],
      sectorsOfInterest: [],
      education: [],
      careerHistory: [],
    } as unknown as UserProfileState;

    const payload = buildUserProfilePatchPayload(profile, {
      fallbackEmail: "investor@example.com",
      onboardingStep: 1,
      extra: { skipOnboarding: true },
    });

    expect(userProfilePatchSchema.safeParse(payload).success).toBe(true);
    expect(payload).not.toHaveProperty("profileCompletenessScore");
    expect(payload).not.toHaveProperty("onboardingCompletedAt");
    expect(payload).not.toHaveProperty("linkedinConnected");
    expect(payload).not.toHaveProperty("linkedinProviderAccountId");
    expect(payload).toMatchObject({
      displayName: "Investor Demo",
      workEmail: "investor@example.com",
      onboardingStep: 1,
      skipOnboarding: true,
    });
  });

  it("calculates completeness deterministically for professional profiles", () => {
    const first = calculateProfileCompleteness({
      displayName: "Simen Lippestad",
      profileImageUrl: "https://example.com/avatar.png",
      professionalBio: "Analyserer norske energi- og industriselskaper.",
      jobTitle: "Senior Analyst",
      employerName: "Fjord Insight",
      employerSector: "Business Intelligence",
      workEmail: "simen@fjordinsight.no",
      countryOfWork: "Norway",
      education: [{ institution: "UiO", degree: "MSc Finance" }],
      expertiseAreas: ["Data Analysis"],
      sectorsOfInterest: ["Renewable Energy"],
    });

    const second = calculateProfileCompleteness({
      displayName: "Simen Lippestad",
      profileImageUrl: "https://example.com/avatar.png",
      professionalBio: "Analyserer norske energi- og industriselskaper.",
      jobTitle: "Senior Analyst",
      employerName: "Fjord Insight",
      employerSector: "Business Intelligence",
      workEmail: "simen@fjordinsight.no",
      countryOfWork: "Norway",
      education: [{ institution: "UiO", degree: "MSc Finance" }],
      expertiseAreas: ["Data Analysis"],
      sectorsOfInterest: ["Renewable Energy"],
    });

    expect(first).toBe(100);
    expect(second).toBe(first);
  });

  it("uses student-specific rules when student mode is enabled", () => {
    const professionalScore = calculateProfileCompleteness({
      displayName: "Student Example",
      professionalBio: "Interested in energy markets.",
      workEmail: "student@example.com",
      countryOfWork: "Norway",
      expertiseAreas: ["Data Analysis"],
      sectorsOfInterest: ["Renewable Energy"],
    });

    const studentScore = calculateProfileCompleteness({
      displayName: "Student Example",
      professionalBio: "Interested in energy markets.",
      isStudent: true,
      universityName: "NHH",
      degree: "MSc Economics",
      studyFocus: "Energy economics",
      workEmail: "student@example.com",
      countryOfWork: "Norway",
      education: [{ institution: "NHH", degree: "MSc Economics" }],
      expertiseAreas: ["Data Analysis"],
      sectorsOfInterest: ["Renewable Energy"],
    });

    expect(studentScore).toBeGreaterThan(professionalScore);
    expect(getProfileHeadline({ isStudent: true, degree: "MSc Economics", universityName: "NHH" })).toBe(
      "MSc Economics ved NHH",
    );
  });

  it("builds a stable display name and initials fallback", () => {
    expect(getProfileDisplayName({ email: "free@projectx.local" })).toBe("free");
    expect(getProfileInitials({ email: "free@projectx.local" })).toBe("FR");
    expect(getProfileDisplayName({})).toBe("Bruker");
  });

  it("formats affiliation subtitles for professionals and students without undefined fragments", () => {
    expect(
      getProfileAffiliationSubtitle({
        jobTitle: "Senior Investment Analyst",
        employerSector: "Energy & Infrastructure",
        employerName: "Fjord Insight",
      }),
    ).toBe("Senior Investment Analyst • Energy & Infrastructure at Fjord Insight");

    expect(
      getProfileAffiliationSubtitle({
        isStudent: true,
        degree: "MSc Economics",
        universityName: "NHH",
      }),
    ).toBe("Student • MSc Economics at NHH");

    expect(
      getProfileAffiliationSubtitle({
        jobTitle: "Analyst",
        employerName: null,
        employerSector: undefined,
      }),
    ).toBe("Analyst");
  });

  it("returns helpful profile completeness copy", () => {
    expect(
      getProfileCompletenessHint({
        profileCompletenessScore: 100,
      }),
    ).toBe("Your profile is complete.");

    expect(
      getProfileCompletenessHint({
        profileCompletenessScore: 72,
        profileImageUrl: "https://example.com/avatar.png",
        professionalBio: "Infra investor",
        jobTitle: "Analyst",
        employerName: "Fjord Insight",
        employerSector: "Business Intelligence",
        workEmail: "analyst@fjordinsight.no",
        countryOfWork: "Norway",
        education: [{ institution: "NHH", degree: "MSc Economics" }],
        expertiseAreas: ["Data Analysis"],
        sectorsOfInterest: [],
      }),
    ).toBe("Add your sectors of interest to improve your profile.");
  });

  it("falls back gracefully for location labels", () => {
    expect(getProfileLocationLabel({ countryOfOrigin: "Norway" })).toBe("Norway");
    expect(getProfileLocationLabel({})).toBeNull();
  });

  it("validates and normalizes employer organization numbers", () => {
    expect(
      userProfilePatchSchema.parse({ employerOrgNumber: "928 846 466" }).employerOrgNumber,
    ).toBe("928846466");
    expect(userProfilePatchSchema.safeParse({ employerOrgNumber: "928846467" }).success).toBe(false);
    expect(userProfilePatchSchema.parse({ employerOrgNumber: null }).employerOrgNumber).toBeNull();
  });
});
