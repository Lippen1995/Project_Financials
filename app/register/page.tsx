import { redirect } from "next/navigation";

import { AuthPageClient } from "@/components/auth/auth-page-client";
import { safeAuth } from "@/lib/auth";
import { AUTH_POST_LOGIN_PATH, getLinkedInConfigurationStatus } from "@/lib/linkedin-auth";

export default async function RegisterPage() {
  const session = await safeAuth();
  if (session?.user?.id) {
    redirect(AUTH_POST_LOGIN_PATH);
  }

  const linkedIn = getLinkedInConfigurationStatus();

  return (
    <AuthPageClient
      mode="register"
      linkedinConfigured={linkedIn.configured}
      linkedInHelpText={
        linkedIn.configured
          ? null
          : `LinkedIn-signup er deaktivert til ${linkedIn.missingVariables.join(" og ")} er satt.`
      }
    />
  );
}
