import { redirect } from "next/navigation";

import { safeAuth } from "@/lib/auth";
import { resolveUserPostLoginDestination } from "@/server/services/user-profile-service";

export default async function AuthPostLoginPage() {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  redirect((await resolveUserPostLoginDestination(session.user.id)) as never);
}
