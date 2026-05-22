import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const linkedInMocks = vi.hoisted(() => ({
  isLinkedInConfigured: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  signIn: authMocks.signIn,
  signOut: authMocks.signOut,
}));

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/linkedin-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/linkedin-auth")>();
  return {
    ...actual,
    isLinkedInConfigured: linkedInMocks.isLinkedInConfigured,
  };
});

describe("auth actions", () => {
  beforeEach(() => {
    // Reset the module registry so each `await import("auth-actions")` re-runs
    // fresh and picks up the mocked "@/lib/linkedin-auth" — otherwise a cached
    // copy from another test file in the suite keeps the real implementation.
    vi.resetModules();
    vi.resetAllMocks();
  });

  // Generous timeout: each test dynamically imports auth-actions, which pulls in
  // a heavy dependency tree (next-auth, prisma, bcrypt). The transform can exceed
  // the 5s default when the whole suite runs in parallel under load.
  it("starts the LinkedIn provider flow when configured", async () => {
    linkedInMocks.isLinkedInConfigured.mockReturnValue(true);

    const { signInWithLinkedInAction } = await import("@/server/actions/auth-actions");
    await signInWithLinkedInAction();

    expect(authMocks.signIn).toHaveBeenCalledWith("linkedin", {
      redirectTo: "/auth/post-login",
    });
  }, 20000);

  it("does nothing when LinkedIn auth is not configured", async () => {
    linkedInMocks.isLinkedInConfigured.mockReturnValue(false);

    const { signInWithLinkedInAction } = await import("@/server/actions/auth-actions");
    await signInWithLinkedInAction();

    expect(authMocks.signIn).not.toHaveBeenCalled();
  }, 20000);
});
