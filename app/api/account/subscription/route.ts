import { NextResponse } from "next/server";

import { safeAuth } from "@/lib/auth";
import { getUserSubscription } from "@/server/billing/subscription";

export async function GET() {
  const session = await safeAuth();
  if (!session?.user.id) {
    return NextResponse.json({ data: null });
  }

  const subscription = await getUserSubscription(session.user.id);
  return NextResponse.json({ data: subscription });
}
