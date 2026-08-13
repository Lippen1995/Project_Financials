import React from "react";

import { buildAppSessionTopNavigation } from "@/components/navigation/app-session-top-navigation";
import { safeAuth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await safeAuth();
  const topNavigation = await buildAppSessionTopNavigation(session?.user ?? null);

  return (
    <>
      {topNavigation}

      <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10">{children}</div>
    </>
  );
}
