import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { safeAuth } from "@/lib/auth";

export type AdminUser = {
  id: string;
  email: string | null | undefined;
  appRole: "ADMIN" | "FINANCIAL_REVIEWER";
};

type AuthResult =
  | { user: AdminUser; error: null }
  | { user: null; error: NextResponse };

export async function requireFinancialReviewer(): Promise<AuthResult> {
  const session = await safeAuth();

  if (!session?.user?.id) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Always verify role from DB — never trust JWT alone
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { appRole: true, email: true },
  });

  const role = dbUser?.appRole;
  if (role !== "ADMIN" && role !== "FINANCIAL_REVIEWER") {
    return {
      user: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    user: {
      id: session.user.id,
      email: dbUser?.email ?? session.user.email,
      appRole: role,
    },
    error: null,
  };
}

export async function getFinancialReviewerOrNull(): Promise<AdminUser | null> {
  const session = await safeAuth();
  if (!session?.user?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { appRole: true, email: true },
  });

  const role = dbUser?.appRole;
  if (role !== "ADMIN" && role !== "FINANCIAL_REVIEWER") return null;

  return {
    id: session.user.id,
    email: dbUser?.email ?? session.user.email,
    appRole: role,
  };
}

export function isFinancialReviewerRole(appRole: string | undefined): appRole is "ADMIN" | "FINANCIAL_REVIEWER" {
  return appRole === "ADMIN" || appRole === "FINANCIAL_REVIEWER";
}
