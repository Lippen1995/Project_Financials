import { redirect } from "next/navigation";

import { ProfileOnboardingClient } from "@/components/profile/profile-onboarding-client";
import { safeAuth } from "@/lib/auth";
import { PROFILE_TOTAL_STEPS } from "@/lib/user-profile";
import { getPrivateUserProfileView } from "@/server/services/user-profile-service";

function clampStep(value: string | string[] | undefined, fallback: number) {
  const candidate = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(candidate)) {
    return fallback;
  }

  return Math.min(PROFILE_TOTAL_STEPS, Math.max(1, Math.trunc(candidate)));
}

export default async function ProfileOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await safeAuth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const view = await getPrivateUserProfileView(session.user.id);
  const params = await searchParams;
  const requestedMode = params.mode === "edit" ? "edit" : "create";
  const mode = view.profile.onboardingCompleted ? "edit" : requestedMode;
  const initialStep = clampStep(params.step, view.profile.onboardingStep || 1);

  return (
    <ProfileOnboardingClient
      email={view.user.email}
      initialMatchedCompany={view.matchedCompany}
      initialProfile={view.profile}
      initialStep={initialStep}
      mode={mode}
      sessionFallbackImage={view.user.image}
      sessionFallbackName={view.user.name}
    />
  );
}
