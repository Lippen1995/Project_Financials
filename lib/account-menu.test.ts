import { describe, expect, it } from "vitest";

import {
  buildAccountMenuSections,
  getViewerDisplayName,
  getViewerHeadline,
  getViewerInitials,
} from "@/lib/account-menu";

describe("account menu helpers", () => {
  it("derives initials from multi-part names", () => {
    expect(getViewerInitials({ name: "Simen Lippestad" })).toBe("SL");
  });

  it("falls back to email prefix when name is missing", () => {
    expect(getViewerDisplayName({ email: "analyst@example.com" })).toBe("analyst");
    expect(getViewerInitials({ email: "analyst@example.com" })).toBe("AN");
  });

  it("builds a workspace-aware headline when workspace data exists", () => {
    expect(
      getViewerHeadline({
        currentWorkspaceName: "Nordic Growth",
        currentWorkspaceRole: "ADMIN",
      }),
    ).toBe("Workspace-admin i Nordic Growth");
  });

  it("prefers profile-specific job and employer details in the headline", () => {
    expect(
      getViewerHeadline({
        profileJobTitle: "Senior Investment Analyst",
        profileEmployerName: "Equinor",
      }),
    ).toBe("Senior Investment Analyst · Equinor");
  });

  it("includes the admin section only for admin-capable users", () => {
    const userSections = buildAccountMenuSections({ appRole: "USER" });
    const adminSections = buildAccountMenuSections({ appRole: "ADMIN" });

    expect(userSections.some((section) => section.label === "ADMINISTRER")).toBe(false);
    expect(adminSections.some((section) => section.label === "ADMINISTRER")).toBe(true);
  });

  it("routes profile settings to the edit onboarding flow", () => {
    const sections = buildAccountMenuSections({ appRole: "USER" });
    const accountSection = sections.find((section) => section.label === "KONTO");

    expect(accountSection?.items[0]).toMatchObject({
      label: "Profilinnstillinger",
      href: "/onboarding/profile?mode=edit",
    });
  });
});
