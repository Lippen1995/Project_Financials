import NextAuth from "next-auth";
import type { NextAuthConfig, Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import LinkedIn from "next-auth/providers/linkedin";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { getLinkedInConfigurationStatus, LINKEDIN_OIDC_SCOPE } from "@/lib/linkedin-auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, getClientAddress } from "@/lib/rate-limit";
import { ensureUserBaselineState } from "@/server/services/user-profile-service";
import { getSessionWorkspaceContext } from "@/server/services/workspace-service";

const credentialSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(6).max(256),
});

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
if (process.env.NODE_ENV === "production" && !authSecret) {
  throw new Error("AUTH_SECRET must be configured in production.");
}
const linkedIn = getLinkedInConfigurationStatus();

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: {},
      password: {},
    },
    async authorize(credentials, request) {
      const rawEmail =
        typeof credentials?.email === "string"
          ? credentials.email.trim().toLowerCase().slice(0, 254)
          : "invalid";
      const loginLimit = consumeRateLimit(
        "credentials-login",
        `${getClientAddress(request.headers)}:${rawEmail}`,
        { limit: 10, windowMs: 15 * 60_000 },
      );
      if (!loginLimit.allowed) {
        return null;
      }

      const parsed = credentialSchema.safeParse(credentials);
      if (!parsed.success) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email },
        include: { subscription: true },
      });

      if (!user?.passwordHash) {
        return null;
      }

      const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!isValid) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionPlan: user.subscription?.plan ?? "free",
        subscriptionStatus: user.subscription?.status ?? "FREE",
      };
    },
  }),
];

if (linkedIn.configured) {
  providers.push(
    LinkedIn({
      clientId: linkedIn.clientId!,
      clientSecret: linkedIn.clientSecret!,
      authorization: {
        params: {
          scope: LINKEDIN_OIDC_SCOPE,
        },
      },
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: authSecret,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "linkedin") {
        return true;
      }

      if (!profile?.email || !profile.email_verified) {
        return false;
      }

      return consumeRateLimit(
        "linkedin-signin",
        profile.email.trim().toLowerCase().slice(0, 254),
        { limit: 20, windowMs: 15 * 60_000 },
      ).allowed;
    },
    async jwt({ token, user }) {
      if (user) {
        token.subscriptionPlan = (user as { subscriptionPlan?: string }).subscriptionPlan ?? "free";
        token.subscriptionStatus = (user as { subscriptionStatus?: string }).subscriptionStatus ?? "FREE";
      }

      if (token.sub) {
        try {
          const subscription = await prisma.subscription.findUnique({
            where: { userId: token.sub },
          });
          token.subscriptionPlan = subscription?.plan ?? "free";
          token.subscriptionStatus = subscription?.status ?? "FREE";

          const workspaceContext = await getSessionWorkspaceContext(token.sub);
          token.currentWorkspaceId = workspaceContext.currentWorkspaceId ?? undefined;
          token.currentWorkspaceName = workspaceContext.currentWorkspaceName ?? undefined;
          token.currentWorkspaceType = workspaceContext.currentWorkspaceType ?? undefined;
          token.currentWorkspaceStatus = workspaceContext.currentWorkspaceStatus ?? undefined;
          token.currentWorkspaceRole = workspaceContext.currentWorkspaceRole ?? undefined;

          const userRecord = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { appRole: true },
          });
          token.appRole = userRecord?.appRole ?? "USER";
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            const message = error instanceof Error ? error.message : "Unknown auth persistence error";
            console.warn("Auth persistence could not be refreshed. Reusing existing token values.", message);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.subscriptionPlan = (token.subscriptionPlan as string) ?? "free";
        session.user.subscriptionStatus = (token.subscriptionStatus as string) ?? "FREE";
        session.user.currentWorkspaceId = (token.currentWorkspaceId as string | undefined) ?? undefined;
        session.user.currentWorkspaceName = (token.currentWorkspaceName as string | undefined) ?? undefined;
        session.user.currentWorkspaceType =
          (token.currentWorkspaceType as "PERSONAL" | "TEAM" | undefined) ?? undefined;
        session.user.currentWorkspaceStatus =
          (token.currentWorkspaceStatus as "ACTIVE" | "ARCHIVED" | undefined) ?? undefined;
        session.user.currentWorkspaceRole =
          (token.currentWorkspaceRole as "OWNER" | "ADMIN" | "MEMBER" | undefined) ?? undefined;
        session.user.appRole =
          (token.appRole as "USER" | "ADMIN" | "FINANCIAL_REVIEWER" | undefined) ?? "USER";
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!user.id) {
        return;
      }

      await ensureUserBaselineState(user.id, {
        displayName: user.name,
        email: user.email,
        profileImageUrl: user.image,
        linkedinConnected: account?.provider === "linkedin",
        linkedinProviderAccountId:
          account?.provider === "linkedin" ? account.providerAccountId : undefined,
        requireOnboarding: account?.provider === "linkedin",
      });
    },
  },
});

export async function safeAuth(): Promise<Session | null> {
  try {
    return await auth();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Auth session could not be read, falling back to logged-out state.", error);
    }

    return null;
  }
}
