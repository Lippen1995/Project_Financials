import NextAuth from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const credentialSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
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
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.subscriptionPlan = (user as { subscriptionPlan?: string }).subscriptionPlan ?? "free";
        token.subscriptionStatus = (user as { subscriptionStatus?: string }).subscriptionStatus ?? "FREE";
      }

      if (token.sub) {
        const subscription = await prisma.subscription.findUnique({
          where: { userId: token.sub },
        });
        token.subscriptionPlan = subscription?.plan ?? "free";
        token.subscriptionStatus = subscription?.status ?? "FREE";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.subscriptionPlan = (token.subscriptionPlan as string) ?? "free";
        session.user.subscriptionStatus = (token.subscriptionStatus as string) ?? "FREE";
      }

      return session;
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
