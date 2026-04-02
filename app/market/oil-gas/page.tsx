import { OilGasMarketClient } from "@/components/market/oil-gas/oil-gas-market-client";
import { safeAuth } from "@/lib/auth";
import { isPremium } from "@/server/billing/subscription";

export default async function OilGasMarketPage() {
  const session = await safeAuth();
  const premium = isPremium(session?.user?.subscriptionStatus, session?.user?.subscriptionPlan);

  return (
    <main className="space-y-8 pb-10">
      <OilGasMarketClient premium={premium} />
    </main>
  );
}
