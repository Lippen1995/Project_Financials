import { redirect } from "next/navigation";

import { OversiktDashboard } from "@/components/dashboard/oversikt-dashboard";
import { safeAuth } from "@/lib/auth";
import { getOversiktDashboardData } from "@/server/services/oversikt-dashboard-service";

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();
}

export default async function DashboardPage() {
  const session = await safeAuth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const firstName = session.user.name?.split(" ")[0] ?? session.user.email ?? "der";
  const dateLabel = formatDateLabel(new Date());
  const data = await getOversiktDashboardData(session.user.id);

  return (
    <OversiktDashboard
      firstName={firstName}
      dateLabel={dateLabel}
      watch={data.watch}
      news={data.news}
      bankruptcies={data.bankruptcies}
      bankruptciesLastWeek={data.bankruptciesLastWeek}
      financialDisclosure={data.financialDisclosure}
    />
  );
}
