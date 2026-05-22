export const LINKEDIN_OIDC_SCOPE = "openid profile email";
export const AUTH_POST_LOGIN_PATH = "/auth/post-login";
export const LINKEDIN_CALLBACK_PATH = "/api/auth/callback/linkedin";

export type LinkedInConfigurationStatus = {
  callbackUrl: string;
  clientId: string | null;
  clientSecret: string | null;
  configured: boolean;
  missingVariables: string[];
};

function getBaseUrl() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function getLinkedInConfigurationStatus(): LinkedInConfigurationStatus {
  const clientId =
    process.env.AUTH_LINKEDIN_ID?.trim() || process.env.LINKEDIN_CLIENT_ID?.trim() || null;
  const clientSecret =
    process.env.AUTH_LINKEDIN_SECRET?.trim() ||
    process.env.LINKEDIN_CLIENT_SECRET?.trim() ||
    null;

  const missingVariables: string[] = [];

  if (!clientId) {
    missingVariables.push("AUTH_LINKEDIN_ID or LINKEDIN_CLIENT_ID");
  }

  if (!clientSecret) {
    missingVariables.push("AUTH_LINKEDIN_SECRET or LINKEDIN_CLIENT_SECRET");
  }

  return {
    callbackUrl: `${getBaseUrl()}${LINKEDIN_CALLBACK_PATH}`,
    clientId,
    clientSecret,
    configured: missingVariables.length === 0,
    missingVariables,
  };
}

export function isLinkedInConfigured() {
  return getLinkedInConfigurationStatus().configured;
}
