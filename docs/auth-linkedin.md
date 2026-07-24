# LinkedIn auth for Fjord Insight

This project uses the existing `next-auth` / Auth.js setup in [`lib/auth.ts`](C:/Users/simen/Project_Financials/lib/auth.ts) with Prisma persistence.

## Required env vars

Set either the `AUTH_*` names or the `LINKEDIN_CLIENT_*` names:

```env
AUTH_SECRET="replace-with-a-long-random-secret"
NEXTAUTH_SECRET="replace-with-a-long-random-string"
NEXTAUTH_URL="http://localhost:3000"

AUTH_LINKEDIN_ID="your-linkedin-client-id"
AUTH_LINKEDIN_SECRET="your-linkedin-client-secret"

# Optional aliases if you prefer the older naming
LINKEDIN_CLIENT_ID=""
LINKEDIN_CLIENT_SECRET=""
```

## LinkedIn app setup

1. Create an app in the LinkedIn Developer Portal.
2. Enable OpenID Connect for the app.
3. Add the local redirect URL:
   `http://localhost:3000/api/auth/callback/linkedin`
4. Copy the client id and client secret into your local `.env`.

The provider is configured with OIDC scopes:

```text
openid profile email
```

## Local test flow

1. Start PostgreSQL and the Next.js app.
2. Apply the versioned Prisma migrations:
   `npm run db:migrate:deploy`
3. Start the app:
   `npm run dev`
4. Visit `/login`.
5. If LinkedIn credentials are missing, the LinkedIn button is disabled with a clear explanation.
6. If LinkedIn credentials are present:
   - click `Fortsett med LinkedIn`
   - complete the LinkedIn sign-in
   - you should be sent to `/auth/post-login`
   - incomplete profiles are redirected to `/onboarding/profile`
   - completed profiles continue to `/dashboard`

## Notes

- LinkedIn is treated as a connection source, not identity verification.
- Standard LinkedIn OIDC is only used to prefill name, email, and profile image when available.
- Employer, role, education, and geography remain manual onboarding fields unless the user fills them in.
