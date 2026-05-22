import { AUTH_POST_LOGIN_PATH } from "@/lib/linkedin-auth";

const ONBOARDING_ENTRY_PATH = "/onboarding/profile";
const AUTH_BYPASS_PREFIXES = [
  "/login",
  "/register",
  ONBOARDING_ENTRY_PATH,
  "/api/auth",
  "/auth/post-login",
];

export function getOnboardingPath(mode?: "edit" | "create", step?: number | null) {
  const params = new URLSearchParams();

  if (mode === "edit") {
    params.set("mode", "edit");
  }

  if (typeof step === "number" && Number.isFinite(step) && step >= 1) {
    params.set("step", String(Math.min(5, Math.trunc(step))));
  }

  const query = params.toString();
  return query ? `${ONBOARDING_ENTRY_PATH}?${query}` : ONBOARDING_ENTRY_PATH;
}

export function isAuthBypassPath(pathname: string | null | undefined) {
  if (!pathname) {
    return false;
  }

  return AUTH_BYPASS_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function resolvePostLoginDestination(options: {
  onboardingCompleted: boolean;
  onboardingRequired: boolean;
  preferredPath?: string | null;
}) {
  const preferredPath = options.preferredPath?.trim() || null;

  if (options.onboardingRequired && !options.onboardingCompleted) {
    return getOnboardingPath();
  }

  if (!preferredPath || isAuthBypassPath(preferredPath) || preferredPath === AUTH_POST_LOGIN_PATH) {
    return "/dashboard";
  }

  return preferredPath;
}
