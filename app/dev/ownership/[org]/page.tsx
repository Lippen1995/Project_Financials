import { notFound } from "next/navigation";

import { OwnershipTab } from "@/components/company/ownership/ownership-tab";
import { getCompanyOwnershipOverview } from "@/server/ownership/ownership-overview-service";

// Dev-only visual harness for iterating on the ownership/group design without auth.
// Never served in production.
export const dynamic = "force-dynamic";

export default async function OwnershipDevPreview({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { org } = await params;
  const overview = await getCompanyOwnershipOverview({ orgNumber: org });

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        Dev-forhåndsvisning · {overview.companyName} ({org}) · ikke en produksjonsrute
      </div>
      <OwnershipTab slug={org} initial={overview} />
    </main>
  );
}
